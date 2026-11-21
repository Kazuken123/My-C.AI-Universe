import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { deduplicateSessionsByCharacter, clearActiveSessionForCharacter } from '../frontend/js/common.js';
import { ApiClient } from '../frontend/js/api.js';
import { GeminiProvider, isGemini35Model } from '../backend/ai/providers/gemini.js';
import { generateCharacterPrompt } from '../backend/ai/prompt/characterPrompt.js';
import { ChatController } from '../backend/controllers/chat.controller.js';
import { ChatSession } from '../backend/models/ChatSession.js';
import { Character } from '../backend/models/Character.js';
import { relationshipService } from '../backend/services/relationship.service.js';

function createStorageMock(initial = {}) {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    readJson: (key) => (store.has(key) ? JSON.parse(store.get(key)) : null)
  };
}

function makeSseResponse(chunks) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

describe('/chats deduplication & multi-thread deletion', () => {
  it('deduplicateSessionsByCharacter picks newest session per character and promotes older thread after deletion', () => {
    const previousStorage = global.localStorage;
    delete global.localStorage;
    try {
      const rawSessions = [
        { id: 'chat_frieren_old', characterId: 'char_frieren', updatedAt: '2025-01-01T00:00:00Z', characterName: 'Frieren' },
        { id: 'chat_frieren_new', characterId: 'char_frieren', updatedAt: '2025-01-03T00:00:00Z', characterName: 'Frieren' },
        { id: 'chat_fern', characterId: 'char_fern', updatedAt: '2025-01-02T00:00:00Z', characterName: 'Fern' }
      ];
      const deduplicated = deduplicateSessionsByCharacter(rawSessions);
      assert.equal(deduplicated.length, 2);
      assert.equal(deduplicated[0].id, 'chat_frieren_new');
      assert.equal(deduplicated[0].threadCount, 2);
      assert.equal(deduplicated[1].id, 'chat_fern');

      // Deleting newest promotes the older Frieren thread immediately
      const afterDelete = deduplicateSessionsByCharacter(rawSessions.filter(s => s.id !== 'chat_frieren_new'));
      assert.equal(afterDelete.find(s => s.characterId === 'char_frieren').id, 'chat_frieren_old');
      assert.equal(afterDelete.find(s => s.characterId === 'char_frieren').threadCount, 1);
    } finally {
      if (previousStorage !== undefined) global.localStorage = previousStorage;
    }
  });

  it('deduplicateSessionsByCharacter honors active session even when older', () => {
    const previousStorage = global.localStorage;
    global.localStorage = createStorageMock({
      cai_active_session_by_char: { char_frieren: 'chat_frieren_active' }
    });
    try {
      const rawSessions = [
        { id: 'chat_frieren_active', characterId: 'char_frieren', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'chat_frieren_newer', characterId: 'char_frieren', updatedAt: '2025-01-03T00:00:00Z' }
      ];
      const deduplicated = deduplicateSessionsByCharacter(rawSessions);
      assert.equal(deduplicated.length, 1);
      assert.equal(deduplicated[0].id, 'chat_frieren_active');
    } finally {
      if (previousStorage !== undefined) global.localStorage = previousStorage;
      else delete global.localStorage;
    }
  });

  it('clearActiveSessionForCharacter removes matching entry, keeps others, and respects expectedSessionId', () => {
    const previousStorage = global.localStorage;
    const storage = createStorageMock({
      cai_active_session_by_char: { char_frieren: 'chat_deleted', char_fern: 'chat_fern_123' }
    });
    global.localStorage = storage;
    try {
      // Mismatched expectedSessionId must not clear the newer choice
      clearActiveSessionForCharacter('char_frieren', 'chat_other');
      assert.deepEqual(storage.readJson('cai_active_session_by_char'), {
        char_frieren: 'chat_deleted',
        char_fern: 'chat_fern_123'
      });

      // Matching expectedSessionId clears only char_frieren
      clearActiveSessionForCharacter('char_frieren', 'chat_deleted');
      assert.deepEqual(storage.readJson('cai_active_session_by_char'), {
        char_fern: 'chat_fern_123'
      });
    } finally {
      if (previousStorage !== undefined) global.localStorage = previousStorage;
      else delete global.localStorage;
    }
  });
});

describe('omitThoughtTag & Gemini 3.5 detection', () => {
  it('isGemini35Model detects 3.5 models and ignores non-3.5 models', () => {
    assert.equal(isGemini35Model('gemini-3.5-flash'), true);
    assert.equal(isGemini35Model('gemini-3.5-flash-lite'), true);
    assert.equal(isGemini35Model('gemini-3.5-pro'), true);
    assert.equal(isGemini35Model('gemini-3.1-flash'), false);
    assert.equal(isGemini35Model('gemini-3.1-flash-lite'), false);
    assert.equal(isGemini35Model('modal_gemma'), false);
    assert.equal(isGemini35Model(null), false);
  });

  it('generateCharacterPrompt omits section 0 and <thought> exemplar blocks when omitThoughtTag is true', () => {
    const character = { name: 'Kana Arima', systemPrompt: 'You are Kana Arima.' };
    const withThought = generateCharacterPrompt(character, { omitThoughtTag: false });
    const withoutThought = generateCharacterPrompt(character, { omitThoughtTag: true });

    assert.match(withThought, /0\. INTERNAL COGNITIVE MONOLOGUE/);
    assert.match(withThought, /<thought>/i);

    assert.doesNotMatch(withoutThought, /0\. INTERNAL COGNITIVE MONOLOGUE/);
    assert.doesNotMatch(withoutThought, /<thought>/i);
    assert.doesNotMatch(withoutThought, /<\/thought>/i);
    assert.match(withoutThought, /1\. Format your replies/);
  });
});

describe('GeminiProvider streaming failover & abort handling', () => {
  it('fails over immediately on MALFORMED_RESPONSE / 504 without retrying primary model and omits <thought> for 3.5', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
    const calls = [];

    globalThis.fetch = async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ url: String(url), body });
      if (String(url).includes('gemini-3.5-flash-lite')) {
        return new Response(JSON.stringify({
          error: { code: 504, message: 'MALFORMED_RESPONSE: parser wedged', status: 'DEADLINE_EXCEEDED' }
        }), { status: 504, headers: { 'Content-Type': 'application/json' } });
      }
      return makeSseResponse([
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello from fallback!' }] }, finishReason: 'STOP' }] })}\n\n`
      ]);
    };

    try {
      const provider = new GeminiProvider();
      const character = { name: 'Kana Arima', systemPrompt: 'You are Kana Arima.' };
      const chunks = [];
      for await (const token of provider.generateReplyStream(character, 'Hi there', [])) {
        chunks.push(token);
      }

      assert.equal(chunks.join(''), 'Hello from fallback!');
      // Primary 3.5 model called only once (no retry), then fallback 3.1 called once
      assert.equal(calls.length, 2);
      assert.match(calls[0].url, /gemini-3\.5-flash-lite/);
      assert.match(calls[1].url, /gemini-3\.1-flash-lite/);

      const prompt35 = calls[0].body.systemInstruction.parts[0].text;
      const prompt31 = calls[1].body.systemInstruction.parts[0].text;
      assert.doesNotMatch(prompt35, /<thought>/i);
      assert.match(prompt31, /<thought>/i);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it('aborts immediately on caller AbortSignal without falling over to fallback model', async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
    const calls = [];
    const controller = new AbortController();

    globalThis.fetch = async (url) => {
      calls.push(String(url));
      const abortReason = new Error('Client disconnected');
      controller.abort(abortReason);
      throw abortReason;
    };

    try {
      const provider = new GeminiProvider();
      const character = { name: 'Frieren', systemPrompt: 'You are Frieren.' };
      await assert.rejects(async () => {
        for await (const _chunk of provider.generateReplyStream(character, 'Hi', [], { signal: controller.signal })) {
          // no-op
        }
      }, /Client disconnected/);
      assert.equal(calls.length, 1);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });
});

describe('ChatController SSE early flush & keepalive cleanup', () => {
  function buildControllerFixture({ appraiseFn, hasOnMethod = true }) {
    const character = new Character({ id: 'char_1', name: 'Frieren', personality: 'Calm mage.' });
    const session = new ChatSession({ id: 'sess_1', userId: 'user_1', characterId: 'char_1' });
    session.addMessage({ role: 'model', content: 'Hello.' });

    const mockCtrl = new ChatController(
      {
        findById: async () => session,
        findAll: async () => [session],
        appendMessages: async () => {}
      },
      {
        findById: async () => character,
        incrementInteractions: async () => {}
      },
      {
        findById: async () => null,
        findDefault: async () => null
      },
      {
        retrieveRelevantMemories: async () => [],
        getSessionStorySummary: async () => '',
        detectAndStoreFromTurn: async () => {},
        updateRollingStorySummary: async () => null
      },
      {
        async *chatStream() {
          yield 'Streamed reply.';
        }
      },
      relationshipService,
      { appraise: appraiseFn }
    );

    const emitter = new EventEmitter();
    const res = {
      statusCode: 200,
      headers: {},
      headersSent: false,
      ended: false,
      writableEnded: false,
      events: [],
      setHeader(k, v) { this.headers[k] = v; },
      flushHeaders() { this.headersSent = true; },
      write(chunk) { this.events.push(chunk); },
      end() { this.ended = true; this.writableEnded = true; },
      status(n) { this.statusCode = n; return this; },
      json(v) { this.body = v; return this; },
      ...(hasOnMethod ? {
        on: emitter.on.bind(emitter),
        off: emitter.off.bind(emitter),
        removeListener: emitter.removeListener.bind(emitter),
        emit: emitter.emit.bind(emitter)
      } : {})
    };
    const req = {
      user: { id: 'user_1' },
      params: { sessionId: 'sess_1' },
      query: { stream: 'true' },
      headers: {},
      body: { charId: 'char_1', sessionId: 'sess_1', message: 'Are you awake?' }
    };
    return { mockCtrl, req, res };
  }

  it('flushes SSE headers and : connected before appraisal runs, and cleans up keepalive timer on finish & close', async () => {
    let sawHeadersBeforeAppraisal = false;
    let sawConnectedBeforeAppraisal = false;
    let activeIntervals = 0;
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (...args) => {
      activeIntervals += 1;
      return origSetInterval(...args);
    };
    globalThis.clearInterval = (id) => {
      if (id) activeIntervals = Math.max(0, activeIntervals - 1);
      return origClearInterval(id);
    };

    try {
      const { mockCtrl, req, res } = buildControllerFixture({
        hasOnMethod: true,
        appraiseFn: async () => {
          sawHeadersBeforeAppraisal = res.headersSent && res.headers['X-Accel-Buffering'] === 'no';
          sawConnectedBeforeAppraisal = res.events[0] === ': connected\n\n';
          return null;
        }
      });

      await mockCtrl.sendChatMessage(req, res);

      assert.equal(sawHeadersBeforeAppraisal, true);
      assert.equal(sawConnectedBeforeAppraisal, true);
      assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform');
      assert.match(res.events.join(''), /"done":true/);
      assert.equal(activeIntervals, 0);
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  it('works with minimal response mocks lacking .on() without throwing or leaking timers', async () => {
    let activeIntervals = 0;
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (...args) => {
      activeIntervals += 1;
      return origSetInterval(...args);
    };
    globalThis.clearInterval = (id) => {
      if (id) activeIntervals = Math.max(0, activeIntervals - 1);
      return origClearInterval(id);
    };

    try {
      const { mockCtrl, req, res } = buildControllerFixture({
        hasOnMethod: false,
        appraiseFn: async () => null
      });
      await mockCtrl.sendChatMessage(req, res);
      assert.equal(res.ended, true);
      assert.match(res.events.join(''), /"done":true/);
      assert.equal(activeIntervals, 0);
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });
});

describe('ApiClient SSE parsing & Chat UI regression checks', () => {
  it('ApiClient.sendChatMessageStream normalizes CRLF, ignores : keepalive, and flushes trailing frame at EOF', async () => {
    const client = new ApiClient();
    client.getToken = () => null;
    const prevFetch = globalThis.fetch;

    globalThis.fetch = async () => makeSseResponse([
      ': connected\r\n\r\n',
      'data: {"token":"Hel"}\r\n\r\n',
      ': keepalive\r\n\r\n',
      'data: {"token":"lo"}\r\n\r\n',
      'data: {"done":true,"response":"Hello"}' // no trailing \n\n
    ]);

    try {
      const tokens = [];
      let donePayload = null;
      await client.sendChatMessageStream(
        { charId: 'c1', message: 'hi' },
        (tok) => tokens.push(tok),
        (done) => { donePayload = done; }
      );
      assert.equal(tokens.join(''), 'Hello');
      assert.equal(donePayload?.done, true);
      assert.equal(donePayload?.response, 'Hello');
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('chat.js appends donePayload messages to session and resets setComposerBusy(false) in regenerate/continue', () => {
    const chatSource = readFileSync(new URL('../frontend/js/chat.js', import.meta.url), 'utf8');
    const chatCss = readFileSync(new URL('../frontend/css/chat.css', import.meta.url), 'utf8');

    assert.match(chatSource, /baseMessages\.push\(donePayload\.userMessage\)/);
    assert.match(chatSource, /baseMessages\.push\(donePayload\.aiMessage\)/);

    const regenMatch = chatSource.match(/async function handleRegenerateVariant[\s\S]*?async function handleContinueScene/);
    assert.ok(regenMatch, 'handleRegenerateVariant section found');
    const regenBusyFalseCount = (regenMatch[0].match(/setComposerBusy\(false\)/g) || []).length;
    assert.ok(regenBusyFalseCount >= 2, 'handleRegenerateVariant resets setComposerBusy(false) in watchdog and finally');

    const continueMatch = chatSource.match(/async function handleContinueScene[\s\S]*?async function refreshRightDrawer/);
    assert.ok(continueMatch, 'handleContinueScene section found');
    const continueBusyFalseCount = (continueMatch[0].match(/setComposerBusy\(false\)/g) || []).length;
    assert.ok(continueBusyFalseCount >= 2, 'handleContinueScene resets setComposerBusy(false) in watchdog and finally');

    const sendBtnCss = chatCss.match(/\.composer-send-btn\s*\{[^}]*\}/);
    assert.ok(sendBtnCss && /position:\s*relative/.test(sendBtnCss[0]), '.composer-send-btn defines position: relative');
  });
});
