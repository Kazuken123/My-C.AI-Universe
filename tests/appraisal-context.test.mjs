import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH || process.env.TURSO_DATABASE_URL?.trim() || !process.env.DOTENV_CONFIG_PATH || path.dirname(process.env.SQLITE_PATH) !== process.env.DATA_DIR) {
  throw new Error('Use scripts/run-tests.js for isolated storage.');
}
const { AppraisalService } = await import('../backend/services/appraisal.service.js');
const { ChatController } = await import('../backend/controllers/chat.controller.js');
const { Character } = await import('../backend/models/Character.js');
const { ChatSession } = await import('../backend/models/ChatSession.js');
const { UserPersona } = await import('../backend/models/UserPersona.js');
const { relationshipService } = await import('../backend/services/relationship.service.js');

const userText = 'I need to get going after breakfast.';
const appraisalValue = {
  intent: 'neutral', userEffort: 'none', contextStakes: 'mundane', evidence: userText,
  reason: 'Preparing to leave', mood: 'Thoughtful', intensity: 0.2,
  affinityDelta: 0, trustDelta: 0, strainDelta: 0
};
const parseData = prompt => JSON.parse(prompt.slice(prompt.indexOf('DATA: ') + 6));

test('appraisal receives source-labelled relationship context without promoting it into new evidence', async () => {
  let data;
  const service = new AppraisalService(async prompt => {
    data = parseData(prompt);
    return JSON.stringify({ ...appraisalValue, memories: [{ kind: 'episode', content: 'The user left', evidence: userText }] });
  });
  const character = {
    name: 'Liora', personality: 'Reserved and witty.', background: 'Liora is 31 and married to Haru.',
    initial_memory: 'They exchange a familiar morning greeting.', relationshipDynamic: 'Married for five years.'
  };
  const persona = { name: 'Haru', description: 'Her husband, age 32.', avatar: 'irrelevant avatar payload', userId: 'private-owner-id' };
  const memory = { key: 'known-key', kind: 'promise', content: 'I will bring breakfast.', evidence: 'I will bring breakfast.' };
  const result = await service.appraise({
    character, session: { provider: 'gemini', relationshipStage: 'Deep Love / Devoted' }, userText,
    persona, history: Array.from({ length: 14 }, (_, i) => ({ role: 'user', content: `Turn ${i}` })),
    memories: [memory], pinnedMessages: [{ role: 'user', content: 'We are married.' }, { role: 'model', content: 'You left already.' }],
    storySummary: 'They are eating breakfast together.',
    retrievedMemories: [{ content: 'User said: "I prefer tea."', source: 'conversation' }]
  });
  assert.equal(data.character.background, character.background);
  assert.equal(data.character.coreMemory, character.initial_memory);
  assert.equal(data.character.source, 'character_profile');
  assert.deepEqual(data.persona, { source: 'active_user_persona', name: persona.name, description: persona.description });
  assert.deepEqual(data.history.map(message => message.content), Array.from({ length: 10 }, (_, i) => `Turn ${i + 4}`));
  assert.equal(data.memories[0].key, memory.key);
  assert.equal(data.memories[0].source, 'quoted_session_memory');
  assert.equal(data.pinnedMessages[0].source, 'pinned_user_message');
  assert.equal(data.pinnedMessages[1].source, 'pinned_character_message');
  assert.equal(data.storySummary.source, 'fallible_story_summary');
  assert.equal(data.storySummary.content, 'They are eating breakfast together.');
  assert.equal(data.retrievedMemories[0].origin, 'conversation');
  assert.equal(data.retrievedMemories[0].content, 'User said: "I prefer tea."');
  assert.equal(result.evidence, userText);
  assert.equal(result.reason, `User said: ${JSON.stringify(userText)}`);
  assert.equal(result.memories[0].content, userText);
  assert.equal(result.mood, 'Thoughtful');
});

test('added context is bounded and clipped sources are labelled incomplete', async () => {
  let data;
  const service = new AppraisalService(async prompt => { data = parseData(prompt); return JSON.stringify(appraisalValue); });
  await service.appraise({
    character: { name: 'Liora', background: 'b'.repeat(6000), initial_memory: 'c'.repeat(4000) },
    session: {}, userText, persona: { name: 'Haru', description: 'p'.repeat(3000) },
    pinnedMessages: Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `${i}:` + 'x'.repeat(5000) })),
    storySummary: 's'.repeat(7000),
    retrievedMemories: Array.from({ length: 6 }, () => ({ content: 'm'.repeat(3000), source: 'conversation' }))
  });
  assert.equal(data.character.background.length, 5000);
  assert.equal(data.character.coreMemory.length, 3000);
  assert.equal(data.persona.description.length, 2000);
  assert.equal(data.pinnedMessages.length, 8);
  assert.ok(data.pinnedMessages[0].content.startsWith('4:'));
  assert.ok(data.pinnedMessages.every(message => message.content.length === 4000 && message.truncated));
  assert.equal(data.storySummary.content.length, 6000);
  assert.equal(data.storySummary.truncated, true);
  assert.equal(data.retrievedMemories.length, 4);
  assert.ok(data.retrievedMemories.every(memory => memory.content.length === 2000 && memory.truncated));
});

function response() {
  return { statusCode: 200, headersSent: false, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

async function sendFixture({ requestedPersonaId, persistedAvailable = true, newSession = false } = {}) {
  const userId = 'context-owner';
  const character = new Character({ id: 'context-character', name: 'Liora', background: 'A married adult, age 31.', initial_memory: 'Haru and Liora are spouses.' });
  const personas = {
    saved: new UserPersona({ id: 'saved', userId, name: 'Haru', description: 'Her husband, age 32.' }),
    default: new UserPersona({ id: 'default', userId, name: 'Default traveler', description: 'A visiting traveler.' }),
    requested: new UserPersona({ id: 'requested', userId, name: 'Another role', description: 'A coworker, age 30.' })
  };
  const session = new ChatSession({ id: 'context-session', userId, characterId: character.id, personaId: 'saved', affinity: 80, trust: 80, relationshipStage: 'Deep Love / Devoted' });
  session.addMessage({ role: 'user', content: 'We are married and both adults.', isPinned: true });
  session.addMessage({ role: 'model', content: 'Breakfast is almost ready.' });
  const retrievedMemories = [{ content: 'They prefer tea with breakfast.', source: 'conversation' }];
  const storySummary = 'They are sharing their usual morning routine.';
  const lookups = [], captured = {};
  const personasRepo = {
    async findById(id, owner) {
      assert.equal(owner, userId);
      lookups.push(id);
      if (id === 'saved' && !persistedAvailable) return null;
      return personas[id] || null;
    },
    async findDefault(owner) { assert.equal(owner, userId); lookups.push('findDefault'); return personas.default; }
  };
  const sessionsRepo = {
    async findById(id, owner) { assert.equal(owner, userId); assert.equal(id, session.id); return session; },
    async findAll(id, owner) { assert.equal(owner, userId); assert.equal(id, character.id); return []; },
    async appendMessages(saved) { captured.savedPersonaId = saved.personaId; }
  };
  const appraiser = new AppraisalService(async prompt => { captured.appraisal = parseData(prompt); return JSON.stringify(appraisalValue); });
  const controller = new ChatController(
    sessionsRepo,
    { findById: async () => character, incrementInteractions: async () => {} },
    personasRepo,
    { retrieveRelevantMemories: async () => retrievedMemories, getSessionStorySummary: async () => storySummary },
    { chat: async (_character, _text, _history, options) => { captured.generation = options; return 'Take your time with breakfast.'; } },
    relationshipService,
    appraiser
  );
  const res = response();
  await controller.sendChatMessage({
    user: { id: userId }, query: {}, headers: {},
    body: { charId: character.id, ...(newSession ? {} : { sessionId: session.id }), message: userText, ...(requestedPersonaId ? { personaId: requestedPersonaId } : {}) }
  }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return { captured, lookups, personas, storySummary, retrievedMemories };
}

test('controller uses the saved persona before the default and shares context with appraisal', async () => {
  const { captured, lookups, personas, storySummary, retrievedMemories } = await sendFixture();
  assert.deepEqual(lookups, ['saved']);
  assert.equal(captured.generation.persona.id, personas.saved.id);
  assert.equal(captured.appraisal.persona.description, captured.generation.persona.description);
  assert.equal(captured.appraisal.pinnedMessages[0].content, captured.generation.pinnedMessages[0].content);
  assert.equal(captured.appraisal.storySummary.content, storySummary);
  assert.equal(captured.generation.storySummary, storySummary);
  assert.equal(captured.appraisal.retrievedMemories[0].content, retrievedMemories[0].content);
  assert.deepEqual(captured.generation.memories, retrievedMemories);
});

test('an explicit owned persona overrides the session persona', async () => {
  const { captured, lookups } = await sendFixture({ requestedPersonaId: 'requested' });
  assert.deepEqual(lookups, ['requested']);
  assert.equal(captured.generation.persona.id, 'requested');
  assert.equal(captured.savedPersonaId, 'requested');
  assert.equal(captured.appraisal.persona.name, 'Another role');
});

test('an inaccessible requested persona cannot be used or persisted', async () => {
  const { captured, lookups } = await sendFixture({ requestedPersonaId: 'other-users-persona' });
  assert.deepEqual(lookups, ['other-users-persona', 'saved']);
  assert.equal(captured.generation.persona.id, 'saved');
  assert.equal(captured.savedPersonaId, 'saved');
  assert.equal(captured.appraisal.persona.name, 'Haru');
});

test('a missing saved persona and a new session fall back to the owned default', async () => {
  const missing = await sendFixture({ persistedAvailable: false });
  assert.deepEqual(missing.lookups, ['saved', 'findDefault']);
  assert.equal(missing.captured.generation.persona.id, 'default');
  const fresh = await sendFixture({ newSession: true });
  assert.deepEqual(fresh.lookups, ['findDefault']);
  assert.equal(fresh.captured.savedPersonaId, 'default');
  assert.equal(fresh.captured.appraisal.persona.name, 'Default traveler');
});
