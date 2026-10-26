// Read-only audit probes. No app bootstrap, database files, network, or credentials.
// These assertions reproduce defects; a successful run does NOT mean the app is safe.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function extract(file, begin, end, name, context = {}) {
  const source = read(file);
  const start = source.indexOf(begin);
  const finish = end ? source.indexOf(end, start) : source.length;
  assert.ok(start >= 0 && finish > start, `Source boundary changed: ${file}`);
  const code = source.slice(start, finish).replace(/export class /g, 'class ');
  return vm.runInNewContext(`${code}\n${name}`, { console, setTimeout, clearTimeout, ...context });
}
const findings = [];
const record = (id, evidence) => findings.push({ id, reproduced: true, evidence });

// A02: provider type conversion occurs outside queue try/finally.
const unhandled = [];
const capture = err => unhandled.push(String(err.message));
process.on('unhandledRejection', capture);
const provider = { providerName: 'mock', generateReply: async () => 'safe fixture' };
const Orchestrator = extract('backend/ai/index.js', 'export class AIOrchestrator', 'export const aiOrchestrator', 'AIOrchestrator', {
  geminiProvider: provider, ollamaProvider: provider, config: { AI_PROVIDER: 'gemini' }
});
const queue = new Orchestrator();
let firstSettled = false, secondSettled = false;
queue.chat({ name: 'fixture' }, 'hello', [], { provider: {} }).then(() => { firstSettled = true; }, () => { firstSettled = true; });
await new Promise(r => setTimeout(r, 20));
queue.chat({ name: 'fixture' }, 'valid request', [], { provider: 'gemini' }).then(() => { secondSettled = true; }, () => { secondSettled = true; });
await new Promise(r => setTimeout(r, 20));
assert.equal(queue.isProcessing, true);
assert.equal(queue.requestQueue.length, 1);
assert.equal(firstSettled || secondSettled, false);
assert.ok(unhandled.some(x => x.includes('toLowerCase')));
record('A02', { queueLocked: queue.isProcessing, validRequestStuck: !secondSettled, error: unhandled[0] });
process.removeListener('unhandledRejection', capture);

// A03: writes with ambiguous network outcomes are replayed.
const Statement = extract('backend/db/database.js', 'export class LibsqlStatementWrapper', 'export class LibsqlConnectionWrapper', 'LibsqlStatementWrapper');
let applied = 0;
const statement = new Statement({ execute: async () => {
  applied++;
  if (applied === 1) { const e = new Error('response lost after server applied write'); e.code = 'ECONNRESET'; throw e; }
  return { rowsAffected: 1 };
} }, 'UPDATE characters SET interactions = interactions + 1');
await statement.run();
assert.equal(applied, 2);
record('A03', { mutationsForOneRequest: applied });

// A04: fast message edits never issue a variant-table write.
const statements = [];
const db = { prepare: sql => ({ run: async (...args) => { statements.push({ sql, args }); return { changes: 1 }; } }) };
class BaseRepository { get db() { return db; } }
const Repository = extract('backend/repositories/ChatSessionRepository.js', 'export class ChatSessionRepository', 'export const chatSessionRepository', 'ChatSessionRepository', { BaseRepository });
await new Repository().updateMessageFields('s', 'm', { content: 'edited text' });
assert.equal(statements.some(x => /message_variants/i.test(x.sql)), false);
assert.ok(statements.some(x => /UPDATE chat_messages/.test(x.sql)));
record('A04', { writes: statements.map(x => x.sql.trim()), variantTableUpdated: false });

// A05: optimistic variant IDs collide on two independently loaded copies.
const { ChatMessage, ChatSession } = await import(pathToFileURL(path.join(root, 'backend/models/ChatSession.js')).href);
const original = new ChatMessage({ id: 'msg_fixture', content: 'original' });
const a = new ChatMessage(original.toJSON()), b = new ChatMessage(original.toJSON());
const variantA = a.addVariant('take A'), variantB = b.addVariant('take B');
assert.equal(variantA.id, variantB.id);
record('A05', { variantA: variantA.id, variantB: variantB.id, textsDiffer: variantA.text !== variantB.text });

// A06: ordinary greeting + paired turns never meet the summary modulo trigger.
const lengths = [];
const session = new ChatSession({ characterId: 'fixture' });
session.addMessage({ role: 'model', content: 'greeting' });
for (let i = 0; i < 60; i++) {
  session.addMessage({ role: 'user', content: 'hello' });
  session.addMessage({ role: 'model', content: 'reply' });
  lengths.push(session.messages.length);
}
const summaries = lengths.filter(n => n >= 24 && (n % 12 === 0 || n === 24));
assert.equal(summaries.length, 0);
assert.match(read('backend/services/memory.service.js'), /totalMsgs % 12 !== 0 && totalMsgs !== 24/);
record('A06', { ordinaryTurns: 60, finalMessageCount: session.messages.length, summaryTriggerCount: summaries.length });

// A07: EOF without a terminal done event is accepted by the shipped vanilla client.
const responseFor = text => {
  let sent = false;
  return { ok: true, body: { getReader: () => ({ read: async () => {
    if (sent) return { done: true };
    sent = true; return { done: false, value: new TextEncoder().encode(text) };
  } }) } };
};
const ApiClient = extract('frontend/js/api.js', 'export class ApiClient', 'export const api', 'ApiClient', {
  loadingBar: { start() {}, done() {} }, localStorage: { getItem: () => null }, TextDecoder,
  fetch: async () => responseFor('data: {"token":"partial"}\n\n')
});
let doneEvent = false, text = '';
await new ApiClient().sendChatMessageStream({}, token => { text += token; }, () => { doneEvent = true; });
assert.equal(text, 'partial'); assert.equal(doneEvent, false);
record('A07', { promiseResolved: true, doneEvent, received: text });

// A09: initialization reports success and permanently caches a migration failure.
let migrationAttempts = 0;
const notices = [];
const Database = extract('backend/db/database.js', 'export class DatabaseConnection', 'export function getDatabase', 'DatabaseConnection', {
  process: { env: { TURSO_DATABASE_URL: 'libsql://fixture.invalid' } },
  resolveSqlitePath: () => '/unused-fixture.sqlite',
  createClient: () => ({ execute: async () => ({ rows: [] }), executeMultiple: async () => {
    migrationAttempts++; throw new Error('fixture schema failure');
  } }),
  fs: { existsSync: () => true, readFileSync: () => '-- fixture' },
  SCHEMA_SQL_PATH: '/unused-schema', SEED_SQL_PATH: '/unused-seed',
  LibsqlConnectionWrapper: class {},
  console: { log() {}, warn: (...args) => notices.push(args.join(' ')) }
});
const connection = new Database(); connection.connect();
await connection.ensureReady(); await connection.ensureReady();
assert.equal(migrationAttempts, 1);
assert.ok(notices.some(x => x.includes('fixture schema failure')));
record('A09', { ensureReadyResolvedAfterFailure: true, attemptsAcrossTwoCalls: migrationAttempts });

console.log(JSON.stringify({ mode: 'isolated defect reproduction', results: findings }, null, 2));
