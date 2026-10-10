import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function syncTarget(name, client) {
  console.log(`\n========================================`);
  console.log(`🔄 Syncing stats on: ${name}`);
  console.log(`========================================`);

  // 1. Reset fake likes and is_liked
  await client.execute('UPDATE characters SET likes = 0, is_liked = 0');

  // 2. Update real interactions based on actual user chat messages
  // If no user messages exist, interaction count is 0
  await client.execute(`
    UPDATE characters SET interactions = COALESCE((
      SELECT COUNT(m.id)
      FROM chat_sessions s
      JOIN chat_messages m ON s.id = m.session_id
      WHERE s.character_id = characters.id AND m.role = 'user'
    ), 0)
  `);

  const rows = await client.execute('SELECT id, name, interactions, likes, is_liked FROM characters');
  console.log(`✅ Characters in ${name}:`);
  for (const row of rows.rows) {
    console.log(` - ${row.name} (ID: ${row.id}): ${row.interactions} chats, ${row.likes} likes, is_liked: ${row.is_liked}`);
  }
}

async function main() {
  // 1. Sync Local SQLite
  const localPath = path.resolve(__dirname, '../backend/db/universe.sqlite');
  const localClient = createClient({ url: `file:${localPath}` });
  try {
    await syncTarget('Local SQLite (' + localPath + ')', localClient);
  } finally {
    localClient.close();
  }

  // 2. Sync Turso Cloud (if configured in .env)
  if (process.env.TURSO_DATABASE_URL) {
    const tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL.trim(),
      authToken: (process.env.TURSO_AUTH_TOKEN || '').trim()
    });
    try {
      await syncTarget('Turso Cloud (' + process.env.TURSO_DATABASE_URL + ')', tursoClient);
    } finally {
      tursoClient.close();
    }
  }

  console.log('\n🎉 Finished syncing all stats to 100% real values!\n');
}

main().catch(err => {
  console.error('❌ Error during stats sync:', err);
  process.exit(1);
});
