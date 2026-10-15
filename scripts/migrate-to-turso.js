#!/usr/bin/env node

/**
 * Migrate Local SQLite to Turso Cloud Database
 * Usage:
 *   TURSO_DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." node scripts/migrate-to-turso.js
 * Or configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env and run:
 *   npm run db:turso:push
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOCAL_DB_PATH = path.join(PROJECT_ROOT, 'backend', 'db', 'universe.sqlite');
const SCHEMA_SQL_PATH = path.join(PROJECT_ROOT, 'backend', 'db', 'schema.sql');

async function migrate() {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!tursoUrl) {
    console.error('❌ Error: TURSO_DATABASE_URL environment variable is not defined.');
    console.error('👉 Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to your .env file or export them before running.');
    process.exit(1);
  }

  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.error(`❌ Local database not found at: ${LOCAL_DB_PATH}`);
    process.exit(1);
  }

  console.log('🚀 Connecting to Local SQLite and Turso Cloud Database...');
  console.log(`📂 Source: ${LOCAL_DB_PATH}`);
  console.log(`🌐 Target: ${tursoUrl}`);

  const localClient = createClient({ url: `file:${path.resolve(LOCAL_DB_PATH)}` });
  const remoteClient = createClient({
    url: tursoUrl,
    authToken: tursoToken || undefined
  });

  // 1. Initialize Schema on Remote Turso
  console.log('\n📜 Initializing schema on Turso Cloud...');
  const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
  await remoteClient.executeMultiple(schemaSql);
  console.log('✅ Schema initialized successfully.');

  // 2. Sync Tables in Dependency Order
  const tables = [
    {
      name: 'users',
      cols: ['id', 'username', 'email', 'password_hash', 'display_name', 'avatar', 'auth_provider', 'provider_id', 'created_at', 'updated_at']
    },
    {
      name: 'user_personas',
      cols: ['id', 'user_id', 'name', 'avatar', 'description', 'is_default', 'created_at', 'updated_at']
    },
    {
      name: 'characters',
      cols: [
        'id', 'name', 'tagline', 'avatar', 'greeting', 'personality', 'appearance', 'abilities',
        'background', 'speaking_style', 'example_dialogues', 'initial_memory',
        'initial_affinity', 'initial_relationship_stage', 'relationship_dynamic',
        'system_prompt', 'wiki', 'wiki_url', 'categories_json', 'creator', 'owner_user_id',
        'interactions', 'likes', 'is_liked', 'created_at', 'updated_at'
      ]
    },
    {
      name: 'character_memories',
      cols: ['id', 'character_id', 'session_id', 'content', 'source', 'created_at']
    },
    {
      name: 'chat_sessions',
      cols: [
        'id', 'user_id', 'character_id', 'persona_id', 'title', 'provider',
        'affinity', 'trust', 'strain', 'relationship_stage', 'relationship_mood',
        'created_at', 'updated_at'
      ]
    },
    {
      name: 'chat_messages',
      cols: ['id', 'session_id', 'role', 'content', 'selected_variant_index', 'is_pinned', 'rating', 'position', 'created_at']
    },
    {
      name: 'message_variants',
      cols: ['id', 'message_id', 'variant_index', 'text', 'created_at']
    }
  ];

  for (const { name, cols } of tables) {
    const localRows = (await localClient.execute(`SELECT * FROM ${name}`)).rows;
    if (localRows.length === 0) {
      console.log(`ℹ️  Table [${name}]: 0 rows found in local SQLite, skipping.`);
      continue;
    }

    console.log(`⏳ Table [${name}]: Migrating ${localRows.length} rows to Turso...`);
    const placeholders = cols.map(() => '?').join(', ');
    const updateClauses = cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ');
    const upsertSql = `
      INSERT INTO ${name} (${cols.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(id) DO UPDATE SET ${updateClauses}
    `;

    for (const row of localRows) {
      const args = cols.map(c => row[c] === undefined ? null : row[c]);
      await remoteClient.execute({ sql: upsertSql, args });
    }

    const countRes = await remoteClient.execute(`SELECT COUNT(*) AS c FROM ${name}`);
    console.log(`✅ Table [${name}]: ${countRes.rows[0].c} rows confirmed on Turso Cloud.`);
  }

  console.log('\n✨ Migration Complete! Local SQLite has been successfully mirrored to Turso Cloud.');
  localClient.close();
  remoteClient.close();
}

migrate().catch(err => {
  console.error('\n❌ Migration Failed:', err);
  process.exit(1);
});
