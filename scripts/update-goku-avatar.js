import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateDb(name, client) {
  await client.execute({
    sql: "UPDATE characters SET avatar = ? WHERE name LIKE '%Goku%'",
    args: ['/assets/avatars/son-goku.jpg']
  });
  const res = await client.execute("SELECT id, name, avatar FROM characters WHERE name LIKE '%Goku%'");
  console.log(`[${name}] Goku record:`, res.rows);
}

async function main() {
  // 1. Local SQLite
  const localPath = path.resolve(__dirname, '../backend/db/universe.sqlite');
  const localClient = createClient({ url: `file:${localPath}` });
  try {
    await updateDb('Local SQLite', localClient);
  } finally {
    localClient.close();
  }

  // 2. Turso Cloud
  if (process.env.TURSO_DATABASE_URL) {
    const tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL.trim(),
      authToken: (process.env.TURSO_AUTH_TOKEN || '').trim()
    });
    try {
      await updateDb('Turso Cloud', tursoClient);

      // Also copy Goku to local SQLite
      const gokuRes = await tursoClient.execute("SELECT * FROM characters WHERE name LIKE '%Goku%'");
      if (gokuRes.rows.length > 0) {
        const localClient = createClient({ url: `file:${localPath}` });
        try {
          const row = gokuRes.rows[0];
          const cols = Object.keys(row);
          const placeholders = cols.map(() => '?').join(', ');
          const sql = `INSERT OR REPLACE INTO characters (${cols.join(', ')}) VALUES (${placeholders})`;
          await localClient.execute({ sql, args: Object.values(row) });
          console.log('[Local SQLite] Synced Goku row from Turso Cloud!');
        } finally {
          localClient.close();
        }
      }
    } finally {
      tursoClient.close();
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
