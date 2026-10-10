import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    filename TEXT UNIQUE NOT NULL,
    mime_type TEXT NOT NULL,
    data_base64 TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_assets_filename ON media_assets(filename);
`;

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

async function syncTarget(name, client) {
  console.log(`\n========================================`);
  console.log(`📦 Setting up media_assets in: ${name}`);
  console.log(`========================================`);

  await client.executeMultiple(CREATE_TABLE_SQL);

  const avatarsDir = path.resolve(__dirname, '../frontend/assets/avatars');
  if (!fs.existsSync(avatarsDir)) {
    console.log('No avatars directory found at:', avatarsDir);
    return;
  }

  const files = fs.readdirSync(avatarsDir);
  console.log(`Found ${files.length} static avatar files to store in database...`);

  let inserted = 0;
  for (const file of files) {
    const fullPath = path.join(avatarsDir, file);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    const mime = getMimeType(fullPath);
    const buf = fs.readFileSync(fullPath);
    const base64 = buf.toString('base64');
    const assetId = `asset_${file.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    await client.execute({
      sql: `
        INSERT OR REPLACE INTO media_assets (id, filename, mime_type, data_base64, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [assetId, file, mime, base64, buf.length, new Date().toISOString()]
    });
    inserted++;
    console.log(`  ✓ Synced ${file} (${(buf.length / 1024).toFixed(1)} KB, ${mime})`);
  }

  const countRes = await client.execute('SELECT COUNT(*) AS count FROM media_assets');
  console.log(`✅ [${name}] Total media_assets in database: ${countRes.rows[0].count}`);
}

async function main() {
  // 1. Local SQLite
  const localPath = path.resolve(__dirname, '../backend/db/universe.sqlite');
  const localClient = createClient({ url: `file:${localPath}` });
  try {
    await syncTarget('Local SQLite', localClient);
  } finally {
    localClient.close();
  }

  // 2. Turso Cloud (if configured in .env)
  if (process.env.TURSO_DATABASE_URL) {
    const tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL.trim(),
      authToken: (process.env.TURSO_AUTH_TOKEN || '').trim()
    });
    try {
      await syncTarget('Turso Cloud', tursoClient);
    } finally {
      tursoClient.close();
    }
  }

  console.log('\n🎉 All avatar media assets permanently backed up into relational SQL database!\n');
}

main().catch(err => {
  console.error('❌ Error in migrate-media-assets:', err);
  process.exit(1);
});
