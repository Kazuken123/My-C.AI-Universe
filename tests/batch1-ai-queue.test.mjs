import test from 'node:test';
import assert from 'node:assert/strict';

if (process.env.NODE_ENV !== 'test' || !process.env.DOTENV_CONFIG_PATH) {
  throw new Error('Run through scripts/run-tests.js to isolate credentials.');
}
const { AIOrchestrator } = await import('../backend/ai/index.js');
const { ChatController } = await import('../backend/controllers/chat.controller.js');

function bounded(promise) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Queue did not settle')), 1000);
  })]).finally(() => clearTimeout(timer));
}

function queueWith(generateReply) {
  const queue = new AIOrchestrator();
  queue.registerProvider('gemini', { providerName: 'gemini-fixture', generateReply });
  queue.registerProvider('ollama', { providerName: 'ollama-fixture', generateReply });
  return queue;
}

test('invalid providers reject and do not poison later queued or streamed requests', async () => {
  const queue = queueWith(async () => 'fixture reply');
  for (const provider of [{}, 42, 'unknown', '', null]) {
    await assert.rejects(bounded(queue.chat({ name: 'Fixture' }, 'hello', [], { provider })), e => e.status === 400);
    await assert.rejects(async () => {
      for await (const _ of queue.chatStream({ name: 'Fixture' }, 'hello', [], { provider })) { /* drain */ }
    }, e => e.status === 400);
  }
  assert.equal(await bounded(queue.chat({ name: 'Fixture' }, 'valid')), 'fixture reply');
});

test('concurrent requests run in order and all settle after provider errors', async () => {
  const events = [];
  const queue = queueWith(async (_, message) => {
    events.push(message);
    if (message === 'fail') throw new Error('Fixture provider unavailable');
    return `reply:${message}`;
  });
  const results = await bounded(Promise.all([
    queue.chat({ name: 'Fixture' }, 'one'),
    queue.chat({ name: 'Fixture' }, 'fail'),
    queue.chat({ name: 'Fixture' }, 'three')
  ]));
  assert.equal(results[0], 'reply:one');
  assert.equal(typeof results[1], 'string'); // Preserve existing canned fallback behavior (A17 is separate).
  assert.equal(results[2], 'reply:three');
  assert.deepEqual(events, ['one', 'fail', 'fail', 'three']);
});

test('an unexpected fallback-building exception rejects one item and recovers', async () => {
  const queue = queueWith(async (character) => {
    if (!character) throw new Error('Fixture failure');
    return 'recovered';
  });
  const broken = queue.chat(null, 'hello');
  const next = queue.chat({ name: 'Fixture' }, 'next');
  await assert.rejects(bounded(broken));
  assert.equal(await bounded(next), 'recovered');
  await new Promise(r => setTimeout(r, 70));
  assert.equal(queue.isProcessing, false);
  assert.equal(queue.requestQueue.length, 0);
});

test('streaming fallback uses the same validated queue and registered provider', async () => {
  const queue = queueWith(async () => 'queued stream fallback');
  const tokens = [];
  for await (const token of queue.chatStream({ name: 'Fixture' }, 'hello')) tokens.push(token);
  assert.deepEqual(tokens, ['queued stream fallback']);
});

test('HTTP handlers reject malformed providers before storage, memory, or AI calls', async () => {
  const fail = () => { throw new Error('Invalid provider reached a dependency'); };
  const deps = new Proxy({}, { get: () => fail });
  const controller = new ChatController(deps, deps, deps, deps, deps, deps);
  for (const provider of [{}, 7, null, '', 'not-a-provider']) {
    for (const handler of ['sendChatMessage', 'createChatSession']) {
      const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
      await controller[handler]({ user: { id: 'u' }, body: { charId: 'c', characterId: 'c', message: 'hello', provider }, query: { stream: 'true' }, headers: {} }, res);
      assert.equal(res.statusCode, 400, `${handler} provider=${JSON.stringify(provider)}`);
      assert.equal(res.body.error.field, 'provider');
    }
  }
});

test('EBAP-02: resuming a legacy session with unsupported stored provider falls back cleanly when req.body.provider is omitted', async () => {
  const { ChatSession } = await import('../backend/models/ChatSession.js');
  const { Character } = await import('../backend/models/Character.js');
  const { RelationshipService } = await import('../backend/services/relationship.service.js');

  const character = new Character({ id: 'char_1', name: 'Mara', greeting: 'Hello.' });
  const legacySession = new ChatSession({
    id: 'sess_legacy',
    userId: 'u_1',
    characterId: 'char_1',
    provider: 'claude',
    messages: [{ id: 'm_1', role: 'model', content: 'Hello.' }]
  });

  let capturedOptions = null;
  const controller = new ChatController(
    {
      findById: async () => legacySession,
      appendMessages: async () => {}
    },
    { findById: async () => character, incrementInteractions: async () => {} },
    { findById: async () => null, findDefault: async () => null },
    {
      retrieveRelevantMemories: async () => [],
      getSessionStorySummary: async () => '',
      detectAndStoreFromTurn: async () => {},
      updateRollingStorySummary: async () => {}
    },
    {
      chat: async (_char, _msg, _hist, opts) => {
        capturedOptions = opts;
        return '*Nods.* Mara: "Still here."';
      }
    },
    new RelationshipService(),
    { appraise: async () => null }
  );

  const res = {
    statusCode: 200,
    status(n) { this.statusCode = n; return this; },
    json(body) { this.body = body; return this; }
  };

  await controller.sendChatMessage(
    {
      user: { id: 'u_1' },
      body: { charId: 'char_1', sessionId: 'sess_legacy', message: 'Hi again' },
      query: {},
      headers: {}
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(capturedOptions?.provider, 'gemini');
});
