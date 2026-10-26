import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { applyMemoryPrivacyMigration } from '../backend/db/migrations/20261027-memory-privacy.js';

if (process.env.NODE_ENV !== 'test' || !process.env.DATA_DIR || !process.env.DOTENV_CONFIG_PATH ||
    process.env.TURSO_DATABASE_URL?.trim()) throw new Error('Use the isolated test runner.');

let sequence = 0;
async function legacy(t) {
  const client = createClient({ url: `file:${path.join(process.env.DATA_DIR, `legacy-${++sequence}.sqlite`)}` });
  t.after(() => client.close());
  // Older schemas may lack parent cascades; the privacy migration must cover these too.
  await client.executeMultiple(`PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE characters (id TEXT PRIMARY KEY);
    CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, user_id TEXT, character_id TEXT);
    CREATE TABLE character_memories (id TEXT PRIMARY KEY, character_id TEXT NOT NULL,
      session_id TEXT REFERENCES chat_sessions(id) ON DELETE SET NULL, content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'conversation', created_at TEXT NOT NULL);
    INSERT INTO users VALUES ('u');
    INSERT INTO characters VALUES ('c'), ('1766160797313');
    INSERT INTO chat_sessions VALUES ('s', 'u', 'c');
    INSERT INTO character_memories VALUES ('private', 'c', 's', 'Private fact', 'conversation', 'now');
    INSERT INTO character_memories VALUES ('orphan', 'c', NULL, 'Orphaned private fact', 'conversation', 'now');
    INSERT INTO character_memories VALUES ('unknown-lore', 'c', NULL, 'Intent cannot be inferred from source', 'wiki', 'now');
    INSERT INTO character_memories VALUES ('mem_gojo_1', '1766160797313', NULL,
      'Satoru Gojo loves sweet foods, especially Kikufuku mochi with edamame and whipped cream from Sendai.', 'wiki', 'now');`);
  return client;
}

test('legacy backfill retains ambiguous records, preserves verified seed lore, and is idempotent', async t => {
  const client = await legacy(t);
  await applyMemoryPrivacyMigration(client);
  const before = (await client.execute('SELECT id, session_id, content, visibility FROM character_memories ORDER BY id')).rows;
  const visibility = Object.fromEntries(before.map(r => [r.id, r.visibility]));
  assert.deepEqual(visibility, { 'mem_gojo_1': 'global', orphan: 'quarantined', private: 'session', 'unknown-lore': 'quarantined' });
  assert.equal(before.length, 4, 'Migration must retain all legacy rows');
  await applyMemoryPrivacyMigration(client);
  assert.deepEqual((await client.execute('SELECT id, session_id, content, visibility FROM character_memories ORDER BY id')).rows, before);

  // A reviewed operator can classify an intentional public record without deleting others.
  await client.execute("UPDATE character_memories SET visibility='global' WHERE id='unknown-lore' AND session_id IS NULL AND visibility='quarantined'");
  await applyMemoryPrivacyMigration(client);
  const publicRows = (await client.execute("SELECT id FROM character_memories WHERE visibility='global' AND session_id IS NULL ORDER BY id")).rows;
  assert.deepEqual(publicRows.map(r => r.id), ['mem_gojo_1', 'unknown-lore']);
});

for (const parent of ['chat_sessions', 'users', 'characters']) {
  test(`legacy ${parent} deletion purges attached private facts without relying on missing FKs`, async t => {
    const client = await legacy(t);
    await applyMemoryPrivacyMigration(client);
    await client.execute(`DELETE FROM ${parent} WHERE id = '${parent === 'users' ? 'u' : parent === 'characters' ? 'c' : 's'}'`);
    assert.equal((await client.execute("SELECT id FROM character_memories WHERE id='private'")).rows.length, 0);
    assert.equal((await client.execute("SELECT id FROM character_memories WHERE id='mem_gojo_1' AND visibility='global'")).rows.length, 1);
    await assert.rejects(client.execute("INSERT INTO character_memories VALUES ('late','c','s','Private fact','conversation','now','session')"));
  });
}

test('a seed ID with changed private content is not automatically published', async t => {
  const client = await legacy(t);
  await client.execute("UPDATE character_memories SET content='Private replacement' WHERE id='mem_gojo_1'");
  await applyMemoryPrivacyMigration(client);
  assert.equal((await client.execute("SELECT visibility FROM character_memories WHERE id='mem_gojo_1'")).rows[0].visibility, 'quarantined');
});

test('migration failure rolls schema/data back together and a safe retry succeeds', async t => {
  const client = await legacy(t);
  const failing = { transaction: async (...args) => {
    const tx = await client.transaction(...args);
    return {
      execute: sql => {
        if (typeof sql === 'string' && sql.includes('CREATE TRIGGER')) throw new Error('Injected migration failure');
        return tx.execute(sql);
      },
      commit: () => tx.commit(), rollback: () => tx.rollback()
    };
  } };
  await assert.rejects(applyMemoryPrivacyMigration(failing), /Injected migration failure/);
  assert.equal((await client.execute('PRAGMA table_info(character_memories)')).rows.some(c => c.name === 'visibility'), false);
  assert.equal((await client.execute('SELECT id FROM character_memories')).rows.length, 4);
  await applyMemoryPrivacyMigration(client);
  assert.equal((await client.execute("SELECT visibility FROM character_memories WHERE id='private'")).rows[0].visibility, 'session');
});

test('invalid scope writes and late extraction cannot create global or orphaned private facts', async t => {
  const client = await legacy(t);
  await applyMemoryPrivacyMigration(client);
  await assert.rejects(client.execute("UPDATE character_memories SET visibility='global' WHERE id='private'"));
  await assert.rejects(client.execute("INSERT INTO character_memories VALUES ('late','c','gone','fact','conversation','now','session')"));
  await client.execute("DELETE FROM chat_sessions WHERE id='s'");
  assert.equal((await client.execute("SELECT id FROM character_memories WHERE id='private'")).rows.length, 0);
});

test('application readiness rejects privacy migration failure before serving queries', async t => {
  // Pre-create the isolated target; bootstrap must never copy the developer's DB.
  const client = createClient({ url: `file:${process.env.SQLITE_PATH}` });
  await client.execute('CREATE TABLE schema_migrations (invalid_column TEXT)');
  client.close();
  const { getDatabase, closeDatabase } = await import('../backend/db/database.js');
  t.after(closeDatabase);
  await assert.rejects(getDatabase().prepare('SELECT * FROM character_memories').all(), /name/);
});
