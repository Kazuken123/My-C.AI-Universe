import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const avatarsDir = path.join(rootDir, 'frontend', 'assets', 'avatars');

if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

async function downloadFile(url, destPath) {
  console.log(`Downloading ${url} -> ${destPath}...`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://fandom.com'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`Saved ${destPath} (${buffer.length} bytes)`);
}

async function main() {
  const generatedMathTeacher = 'C:\\Users\\giuag\\.gemini\\antigravity\\brain\\e3d04422-d924-43dc-821c-a146a6c21a9c\\math_teacher_avatar_1791524321342.jpg';
  const mathDest = path.join(avatarsDir, 'math-teacher.jpg');
  if (fs.existsSync(generatedMathTeacher)) {
    fs.copyFileSync(generatedMathTeacher, mathDest);
    console.log('Copied generated Math Teacher avatar to', mathDest);
  }

  const downloads = [
    {
      name: 'satoru-gojo.png',
      url: 'https://static.wikia.nocookie.net/jujutsu-kaisen/images/e/ef/Satoru_Gojo_%28Anime_2%29.png/revision/latest?cb=20250726003655'
    },
    {
      name: 'kana-arima.png',
      url: 'https://static.wikia.nocookie.net/oshi_no_ko/images/e/ee/Kana_Arima_Anime.png/revision/latest?cb=20230219171329'
    },
    {
      name: 'frieren.png',
      url: 'https://static.wikia.nocookie.net/frieren/images/3/35/Frieren_anime_profile.png/revision/latest?cb=20230521074853'
    },
    {
      name: 'robin.png',
      url: 'https://static.wikia.nocookie.net/houkai-star-rail/images/7/72/Character_Robin_Icon.png/revision/latest?cb=20240525031318'
    },
    {
      name: 'sherlock-holmes.jpg',
      url: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Sherlock_Holmes_Portrait_Paget.jpg'
    }
  ];

  for (const item of downloads) {
    const dest = path.join(avatarsDir, item.name);
    try {
      await downloadFile(item.url, dest);
    } catch (err) {
      console.error(`Failed to download ${item.name}:`, err.message);
    }
  }

  // Update SQLite Database
  const dbPath = path.join(rootDir, 'backend', 'db', 'universe.sqlite');
  const db = new DatabaseSync(dbPath);

  console.log('Updating SQLite database character avatar paths...');
  
  // Gojo
  db.prepare(`UPDATE characters SET avatar = '/assets/avatars/satoru-gojo.png' WHERE id = '1766160797313' OR name LIKE '%Gojo%'`).run();
  
  // Kana Arima
  db.prepare(`UPDATE characters SET avatar = '/assets/avatars/kana-arima.png' WHERE id = '1766394139616' OR name LIKE '%Kana%'`).run();
  
  // Math Teacher
  db.prepare(`UPDATE characters SET avatar = '/assets/avatars/math-teacher.jpg' WHERE id = '1766395759555' OR name LIKE '%Math%'`).run();
  
  // Frieren
  db.prepare(`UPDATE characters SET avatar = '/assets/avatars/frieren.png' WHERE id = '1767000000001' OR name LIKE '%Frieren%'`).run();
  
  // Sherlock Holmes
  db.prepare(`UPDATE characters SET avatar = '/assets/avatars/sherlock-holmes.jpg' WHERE id = '1767000000002' OR name LIKE '%Sherlock%'`).run();
  
  // Robin (all instances)
  db.prepare(`UPDATE characters SET avatar = '/assets/avatars/robin.png' WHERE name LIKE '%Robin%'`).run();

  const rows = db.prepare('SELECT id, name, avatar FROM characters').all();
  console.log('Updated database rows:');
  console.log(JSON.stringify(rows, null, 2));
}

main().catch(console.error);
