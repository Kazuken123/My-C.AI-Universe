import assert from 'node:assert/strict';
import { BaseAIProvider } from '../backend/ai/providers/BaseAIProvider.js';
import { ollamaProvider } from '../backend/ai/providers/ollama.js';

assert.equal(typeof BaseAIProvider.prototype.buildFullPrompt, 'function', 'BaseAIProvider phải cung cấp hàm buildFullPrompt');
assert.equal(typeof BaseAIProvider.prototype.fetchWithTimeout, 'function', 'BaseAIProvider phải cung cấp hàm fetchWithTimeout');

const compiled = ollamaProvider.buildFullPrompt(
  { name: 'Gojo', personality: 'Confident' },
  'Hello there',
  [],
  { persona: { name: 'Tester' } }
);
assert.equal(compiled.includes('Tester: Hello there'), true);
assert.equal(compiled.endsWith('Gojo:'), true);

// Kiểm tra trường hợp options = null không bị vỡ với TypeError
const compiledNullOpts = ollamaProvider.buildFullPrompt(
  { name: 'Gojo' },
  'Hello without options',
  null,
  null
);
assert.equal(compiledNullOpts.includes('User: Hello without options'), true);
assert.equal(compiledNullOpts.endsWith('Gojo:'), true);

// Kiểm tra BaseAIProvider.fetchWithTimeout lập tức abort khi caller signal đã bị abort từ trước
const preAborted = new AbortController();
preAborted.abort(new Error('Pre-aborted'));
let caughtPreAbort = null;
try {
  await ollamaProvider.fetchWithTimeout('http://127.0.0.1:9999/dummy', { signal: preAborted.signal }, 5000);
} catch (err) {
  caughtPreAbort = err;
}
assert.notEqual(caughtPreAbort, null, 'fetchWithTimeout phải reject ngay khi signal đã abort');

// Kiểm tra OllamaProvider ném lỗi client cancelled 499 khi caller signal abort
const clientAbort = new AbortController();
clientAbort.abort();
let caughtClientAbort = null;
try {
  await ollamaProvider.generateReply({ name: 'Bot' }, 'Hi', [], { signal: clientAbort.signal });
} catch (err) {
  caughtClientAbort = err;
}
assert.notEqual(caughtClientAbort, null, 'OllamaProvider phải reject khi signal bị abort');
assert.equal(caughtClientAbort.status || caughtClientAbort.code, 499, 'OllamaProvider phải gắn mã HTTP 499 khi client huỷ request');

console.log('✅ [PASS] TASK-03: BaseAIProvider đóng gói sâu logic prompt và timeout.');
