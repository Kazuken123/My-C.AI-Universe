import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH ||
    process.env.TURSO_DATABASE_URL?.trim() || !process.env.DOTENV_CONFIG_PATH ||
    path.dirname(process.env.SQLITE_PATH) !== process.env.DATA_DIR) {
  throw new Error('Run through scripts/run-tests.js to isolate storage and credentials.');
}
// Prevent the application's legacy bootstrap from copying the developer's default DB.
writeFileSync(process.env.SQLITE_PATH, '', { flag: 'wx' });

const { getDatabase, closeDatabase } = await import('../backend/db/database.js');
const { MemoryRepository } = await import('../backend/repositories/MemoryRepository.js');
const { SemanticMemoryService } = await import('../backend/services/memory.service.js');
const { MemoryController } = await import('../backend/controllers/memory.controller.js');
const { chatSessionRepository } = await import('../backend/repositories/ChatSessionRepository.js');
const { CharacterMemory } = await import('../backend/models/CharacterMemory.js');
const db = getDatabase();
const repository = new MemoryRepository();
after(closeDatabase);

let sequence = 0;
async function fixture() {
  const suffix = ++sequence;
  const user = `privacy_user_${suffix}`, character = `privacy_character_${suffix}`;
  const session = `privacy_session_${suffix}`;
  await db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at, updated_at)
    VALUES (?, ?, 'fixture-only', 'Fixture', 'now', 'now')`).run(user, user);
  await db.prepare(`INSERT INTO characters (id, name, system_prompt, created_at, updated_at)
    VALUES (?, 'Fixture', 'Fixture', 'now', 'now')`).run(character);
  await db.prepare(`INSERT INTO chat_sessions (id, user_id, character_id, title, created_at, updated_at)
    VALUES (?, ?, ?, 'Private', 'now', 'now')`).run(session, user, character);
  const privateMemory = new CharacterMemory({ characterId: character, sessionId: session, content: 'Private fact' });
  const publicMemory = new CharacterMemory({ characterId: character, content: 'Intentional public lore', source: 'manual', visibility: 'global' });
  await repository.save(privateMemory);
  await repository.save(publicMemory);
  return { user, character, session, privateMemory, publicMemory };
}

function serviceWithPython(results = []) {
  return new SemanticMemoryService(repository, {
    retrieveMemories: async () => results,
    deleteMemory: async () => false,
    addMemory: async () => null
  });
}

async function publicRead(service, f, user = null) {
  const controller = new MemoryController(service, {}, chatSessionRepository);
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
  await controller.getMemories({ query: { characterId: f.character, sessionId: f.session }, user }, res);
  assert.equal(res.statusCode, 200);
  return res.body.memories.map(m => m.id);
}

for (const parent of ['chat_sessions', 'users', 'characters']) {
  test(`private memory stays private when ${parent} is deleted`, async () => {
    const f = await fixture(), service = serviceWithPython();
    const stranger = { id: 'another_user', isAdmin: () => false };
    assert.deepEqual(await publicRead(service, f), [f.publicMemory.id]);
    assert.deepEqual(await publicRead(service, f, stranger), [f.publicMemory.id]);
    assert.ok((await repository.findForContext(f.character, f.session)).some(m => m.id === f.privateMemory.id));
    await db.prepare(`DELETE FROM ${parent} WHERE id = ?`).run(
      parent === 'users' ? f.user : parent === 'characters' ? f.character : f.session
    );
    const expected = parent === 'characters' ? [] : [f.publicMemory.id];
    assert.deepEqual(await publicRead(service, f), expected);
    assert.deepEqual(await publicRead(service, f, stranger), expected);
    assert.deepEqual((await service.retrieveRelevantMemories('Private fact', f.character, 4, f.session)).map(m => m.id), expected);
  });
}

test('Python results cannot revive deleted, foreign, or changed SQL memory content', async () => {
  const f = await fixture(), foreign = await fixture();
  const service = serviceWithPython([
    { id: f.privateMemory.id, content: 'Deleted private fact', similarity: 1 },
    { id: foreign.privateMemory.id, content: 'Foreign fact', similarity: 1 },
    { id: f.publicMemory.id, content: 'Stale or forged public text', similarity: 0.9 }
  ]);
  assert.equal(await service.deleteMemory(f.privateMemory.id), true);
  const result = await service.retrieveRelevantMemories('fact', f.character, 4, f.session);
  assert.deepEqual(result.map(m => m.id), [f.publicMemory.id]);
  assert.equal(result[0].content, f.publicMemory.content);
  await db.prepare('DELETE FROM characters WHERE id = ?').run(f.character);
  assert.deepEqual(await service.retrieveRelevantMemories('fact', f.character, 4, f.session), []);
});

test('SQL is authoritative even when Python mislabels a private memory as global', async () => {
  const f = await fixture();
  const service = serviceWithPython([{ id: f.privateMemory.id, session_id: null, content: 'Private fact', similarity: 1 }]);
  const result = await service.retrieveRelevantMemories('fact', f.character);
  assert.deepEqual(result.map(m => m.id), [f.publicMemory.id]);
});

test('a late Python response cannot revive a session deleted during retrieval', async () => {
  const f = await fixture();
  const service = new SemanticMemoryService(repository, {
    retrieveMemories: async () => {
      await db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(f.session);
      return [{ id: f.privateMemory.id, content: 'Private fact', similarity: 1 }];
    }
  });
  assert.deepEqual((await service.retrieveRelevantMemories('fact', f.character, 4, f.session)).map(m => m.id), [f.publicMemory.id]);
});

test('background extraction cannot create public facts without a live session', async () => {
  const f = await fixture(), service = serviceWithPython();
  const before = await repository.count();
  await service.detectAndStoreFromTurn('My name is Private Person', '', f.character);
  assert.equal(await repository.count(), before);
  await db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(f.session);
  await assert.rejects(service.addMemory('Late private fact', f.character, 'conversation', f.session));
  assert.deepEqual((await repository.findForContext(f.character)).map(m => m.id), [f.publicMemory.id]);
});

test('public lore requires an explicit visibility decision and survives reload', async () => {
  const f = await fixture();
  assert.equal(new CharacterMemory({ characterId: f.character, content: 'Unclassified' }).visibility, 'quarantined');
  const lore = await serviceWithPython().addMemory('Fresh authorized canon', f.character, 'manual');
  assert.equal(lore.visibility, 'global');
  assert.ok((await repository.findForContext(f.character)).some(m => m.id === lore.id));
  assert.equal((await repository.findById(lore.id)).visibility, 'global');
  assert.ok((await repository.findForContext('1766160797313')).some(m => m.id === 'mem_gojo_1'));
});
