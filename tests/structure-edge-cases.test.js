import assert from 'node:assert/strict';
import { AdminController } from '../backend/controllers/admin.controller.js';
import { BaseAIProvider } from '../backend/ai/providers/BaseAIProvider.js';
import { OllamaProvider } from '../backend/ai/providers/ollama.js';

console.log('--- Testing Edge Cases ---');

// 1. AdminController.getUsers with plain objects (no toJSON method)
{
  const controller = new AdminController();
  controller.userRepo = {
    findAll: async () => [
      { id: 'u_plain', username: 'plain_user', email: 'test@test.com', role: 'user' }
    ]
  };
  controller.sessionRepo = {
    countByUser: async () => new Map([['u_plain', 2]])
  };

  let payload = null;
  const res = {
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { payload = data; return this; }
  };

  await controller.getUsers({}, res);
  assert.equal(Array.isArray(payload), true, 'getUsers should handle plain objects without toJSON');
  assert.equal(payload[0].id, 'u_plain');
  assert.equal(payload[0].sessionCount, 2);
  console.log('✅ Edge Case 1 Passed: AdminController handles plain user objects safely.');
}

// 2. AdminController fallback when sessionRepo has no countMessages/countByUser and no db
{
  const controller = new AdminController();
  controller.userRepo = { count: async () => 1, countAdmins: async () => 0, findAll: async () => [] };
  controller.charRepo = { count: async () => 0 };
  controller.sessionRepo = {}; // completely empty mock
  controller.personaRepo = { count: async () => 0 };
  controller.memoryRepo = { count: async () => 0 };

  let payload = null;
  const res = {
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { payload = data; return this; }
  };

  await controller.getOverview({}, res);
  assert.equal(payload.counts.chatMessages, 0);

  let usersPayload = null;
  const resUsers = {
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { usersPayload = data; return this; }
  };
  await controller.getUsers({}, resUsers);
  assert.equal(Array.isArray(usersPayload), true);
  console.log('✅ Edge Case 2 Passed: AdminController handles missing repository methods and missing db safely.');
}

// 3. BaseAIProvider.fetchWithTimeout with already-aborted signal
{
  class TestProvider extends BaseAIProvider {
    constructor() { super('test'); }
  }
  const provider = new TestProvider();
  const callerAbort = new AbortController();
  callerAbort.abort(new Error('User cancelled'));

  let caught = null;
  try {
    await provider.fetchWithTimeout('http://127.0.0.1:9999/dummy', { signal: callerAbort.signal }, 5000);
  } catch (err) {
    caught = err;
  }
  assert.notEqual(caught, null, 'fetchWithTimeout should reject when signal is already aborted');
  console.log('✅ Edge Case 3 Passed: BaseAIProvider immediately aborts on pre-aborted signal.');
}

// 4. OllamaProvider forward signal and timeout from options
{
  const provider = new OllamaProvider();
  const abortCtrl = new AbortController();
  abortCtrl.abort();

  let caught = null;
  try {
    await provider.generateReply(
      { name: 'Bot' },
      'Hello',
      [],
      { signal: abortCtrl.signal }
    );
  } catch (err) {
    caught = err;
  }
  assert.notEqual(caught, null, 'OllamaProvider should reject when caller signal is aborted');
  console.log('✅ Edge Case 4 Passed: OllamaProvider forwards caller cancellation signal.');
}

console.log('All edge cases tested!');
