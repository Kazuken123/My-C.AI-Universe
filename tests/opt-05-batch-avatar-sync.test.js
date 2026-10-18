import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.resolve(process.cwd(), 'backend/scripts/download_avatars.js');
const content = fs.readFileSync(scriptPath, 'utf8');

// 1. Đảm bảo tải song song qua Promise.allSettled
assert.equal(
  content.includes('Promise.allSettled('),
  true,
  'download_avatars.js phải tải song song các file ảnh bằng Promise.allSettled'
);

// 2. Đảm bảo gom nhóm các lệnh UPDATE vào trong Transaction (BEGIN TRANSACTION ... COMMIT)
assert.equal(
  content.includes('BEGIN TRANSACTION'),
  true,
  'download_avatars.js phải gom các câu lệnh UPDATE vào một SQL Transaction duy nhất'
);

console.log('✅ [PASS] TASK-05: Đã song song hóa tải ảnh và gom nhóm Transaction SQL trong download_avatars.js.');
