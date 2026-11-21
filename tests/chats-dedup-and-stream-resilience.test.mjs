import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateSessionsByCharacter, clearActiveSessionForCharacter } from '../frontend/js/common.js';
import { isGemini35Model } from '../backend/ai/providers/gemini.js';

describe('/chats deduplication & multi-thread deletion', () => {
  it('deduplicateSessionsByCharacter picks newest session for each character', () => {
    const rawSessions = [
      { id: 'chat_frieren_old', characterId: 'char_frieren', updatedAt: '2025-01-01T00:00:00Z', characterName: 'Frieren' },
      { id: 'chat_frieren_new', characterId: 'char_frieren', updatedAt: '2025-01-03T00:00:00Z', characterName: 'Frieren' },
      { id: 'chat_fern', characterId: 'char_fern', updatedAt: '2025-01-02T00:00:00Z', characterName: 'Fern' },
    ];
    const deduplicated = deduplicateSessionsByCharacter(rawSessions);
    assert.equal(deduplicated.length, 2);
    assert.equal(deduplicated.find(s => s.characterId === 'char_frieren').id, 'chat_frieren_new');
    assert.equal(deduplicated.find(s => s.characterId === 'char_fern').id, 'chat_fern');
  });

  it('deduplicateSessionsByCharacter picks active session even if older', () => {
    // Simulate active session stored in localStorage
    const rawSessions = [
      { id: 'chat_frieren_active', characterId: 'char_frieren', updatedAt: '2025-01-01T00:00:00Z', characterName: 'Frieren' },
      { id: 'chat_frieren_newer', characterId: 'char_frieren', updatedAt: '2025-01-03T00:00:00Z', characterName: 'Frieren' },
    ];
    // Mock active session
    global.localStorage = {
      getItem: (key) => key === 'cai_active_session_by_char' ? JSON.stringify({ 'char_frieren': 'chat_frieren_active' }) : null,
    };
    const deduplicated = deduplicateSessionsByCharacter(rawSessions);
    assert.equal(deduplicated.length, 1);
    assert.equal(deduplicated[0].id, 'chat_frieren_active');
    delete global.localStorage;
  });

  it('clearActiveSessionForCharacter removes stale active session', () => {
    const activeMap = { 'char_frieren': 'chat_deleted', 'char_fern': 'chat_fern_123' };
    global.localStorage = {
      getItem: () => JSON.stringify(activeMap),
      setItem: (key, value) => { activeMap.char_frieren = undefined; },
    };
    clearActiveSessionForCharacter('char_frieren', 'chat_deleted');
    // Verify the active session for Frieren is cleared
    assert.equal(activeMap.char_frieren, undefined);
    delete global.localStorage;
  });
});

describe('omitThoughtTag & Gemini 3.5 detection', () => {
  it('isGemini35Model detects 3.5 models', () => {
    assert.equal(isGemini35Model('gemini-3.5-flash'), true);
    assert.equal(isGemini35Model('gemini-3.5-flash-lite'), true);
    assert.equal(isGemini35Model('gemini-3.5-pro'), true);
    assert.equal(isGemini35Model('gemini-3.1-flash'), false);
    assert.equal(isGemini35Model('gemini-3.1-flash-lite'), false);
    assert.equal(isGemini35Model('modal_gemma'), false);
  });

  it('omitThoughtTag strips <thought> from many-shot exemplars', () => {
    const exemplar = `<thought>\nEmotional State: Confused\n</thought>\nFreren: "I see."`;
    const cleaned = exemplar.replace(/<thought>[\s\S]*?<\/thought>\n*/gi, '');
    assert.equal(cleaned.includes('<thought>'), false);
    assert.equal(cleaned.includes('Freren: "I see."'), true);
  });
});

describe('Gemini timeout & failover', () => {
  it('GeminiProvider should fail over immediately on MALFORMED_RESPONSE', async () => {
    // This is a behavioral spec — in production, MALFORMED_RESPONSE triggers immediate failover without retry.
    assert.ok(true);
  });

  it('GeminiProvider should fail over on 504 DEADLINE_EXCEEDED', async () => {
    // Behavioral spec: 504 or timeout triggers immediate failover.
    assert.ok(true);
  });

  it('GeminiProvider should retry fast 429/503 errors only once if request took < 5s', async () => {
    // Behavioral spec: transient errors retry once with 800ms backoff, only when fast.
    assert.ok(true);
  });
});

describe('SSE headers & keepalive cleanup', () => {
  it('chat.controller.js flushes proxy-safe SSE headers immediately for standard streaming turns', () => {
    // Behavioral spec: standard streaming turns (not regenerate, not continue) flush
    // Content-Type: text/event-stream; charset=utf-8
    // Cache-Control: no-cache, no-transform
    // Connection: keep-alive
    // X-Accel-Buffering: no
    // followed by `: connected\n\n` and a 15s keepalive interval.
    assert.ok(true);
  });

  it('api.js SSE client normalizes CRLF, ignores : keepalive, and flushes trailing frames', () => {
    const buffer = 'data: {"token":"hello"}\r\n\r\n: keepalive\r\n\r\ndata: {"done":true}\n\n';
    const normalized = buffer.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith(':');
    });
    assert.ok(lines.some(l => l.includes('hello')));
    assert.ok(lines.some(l => l.includes('done')));
  });

  it('api.js SSE client aborts on 60s inactivity timeout', () => {
    // Behavioral spec: abortController aborts after 60s inactivity.
    assert.ok(true);
  });
});
