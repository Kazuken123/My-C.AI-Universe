import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const avatarsDir = path.join(rootDir, 'frontend', 'assets', 'avatars');

if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const ALLOWED_AVATAR_HOSTS = new Set([
  'static.wikia.nocookie.net',
  'upload.wikimedia.org'
]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

function assertSafeAvatarDownload(url, destPath) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_AVATAR_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Blocked untrusted avatar host or protocol: ${url}`);
  }
  const resolvedDest = path.resolve(destPath);
  const resolvedBase = path.resolve(avatarsDir);
  if (!resolvedDest.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Path traversal blocked for destination: ${destPath}`);
  }
}

async function downloadFile(url, destPath) {
  assertSafeAvatarDownload(url, destPath);
  console.log(`Downloading ${url} -> ${destPath}...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://fandom.com'
      },
      signal: controller.signal,
      redirect: 'error'
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_AVATAR_BYTES) {
      throw new Error(`Avatar exceeds size limit (${contentLength} bytes)`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_AVATAR_BYTES) {
      throw new Error(`Downloaded payload exceeds 5MB limit (${buffer.length} bytes)`);
    }
    fs.writeFileSync(destPath, buffer);
    console.log(`Saved ${destPath} (${buffer.length} bytes)`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  const customMathTeacherSource = process.env.MATH_TEACHER_AVATAR_PATH;
  const mathDest = path.join(avatarsDir, 'math-teacher.jpg');
  if (customMathTeacherSource && fs.existsSync(customMathTeacherSource)) {
    fs.copyFileSync(customMathTeacherSource, mathDest);
    console.log('Copied custom Math Teacher avatar to', mathDest);
  }

  const downloads = [
    {
      name: 'satoru-gojo.png',
      idMatch: '1766160797313',
      namePattern: '%Gojo%',
      url: 'https://static.wikia.nocookie.net/jujutsu-kaisen/images/e/ef/Satoru_Gojo_%28Anime_2%29.png/revision/latest?cb=20250726003655'
    },
    {
      name: 'kana-arima.png',
      idMatch: '1766394139616',
      namePattern: '%Kana%',
      url: 'https://static.wikia.nocookie.net/oshi_no_ko/images/e/ee/Kana_Arima_Anime.png/revision/latest?cb=20230219171329'
    },
    {
      name: 'frieren.png',
      idMatch: '1767000000001',
      namePattern: '%Frieren%',
      url: 'https://static.wikia.nocookie.net/frieren/images/3/35/Frieren_anime_profile.png/revision/latest?cb=20230521074853'
    },
    {
      name: 'robin.png',
      idMatch: null,
      namePattern: '%Robin%',
      url: 'https://static.wikia.nocookie.net/houkai-star-rail/images/7/72/Character_Robin_Icon.png/revision/latest?cb=20240525031318'
    },
    {
      name: 'sherlock-holmes.jpg',
      idMatch: '1767000000002',
      namePattern: '%Sherlock%',
      url: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Sherlock_Holmes_Portrait_Paget.jpg'
    }
  ];

  await Promise.allSettled(
    downloads.map(async (item) => {
      const dest = path.join(avatarsDir, item.name);
      try {
        await downloadFile(item.url, dest);
      } catch (err) {
        console.error(`Failed to download ${item.name}:`, err.message);
      }
    })
  );

  const db = getDatabase();
  console.log('Updating database character avatar paths in batch transaction...');

  const avatarMappings = [
    ...downloads.map(d => ({ avatar: `/assets/avatars/${d.name}`, id: d.idMatch, pattern: d.namePattern })),
    { avatar: '/assets/avatars/math-teacher.jpg', id: '1766395759555', pattern: '%Math%' }
  ];

  if (typeof db.exec === 'function') {
    await db.exec('BEGIN TRANSACTION');
  }
  try {
    for (const mapping of avatarMappings) {
      if (mapping.id) {
        await db.prepare('UPDATE characters SET avatar = ? WHERE id = ? OR name LIKE ?').run(mapping.avatar, mapping.id, mapping.pattern);
      } else {
        await db.prepare('UPDATE characters SET avatar = ? WHERE name LIKE ?').run(mapping.avatar, mapping.pattern);
      }
    }
    if (typeof db.exec === 'function') {
      await db.exec('COMMIT');
    }
  } catch (txErr) {
    if (typeof db.exec === 'function') {
      await db.exec('ROLLBACK');
    }
    throw txErr;
  }

  const rows = await db.prepare('SELECT id, name, avatar FROM characters').all();
  console.log('Updated database rows:', JSON.stringify(rows, null, 2));
}

main().catch(console.error);
