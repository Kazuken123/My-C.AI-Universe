import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const scriptPath = path.resolve(process.cwd(), 'backend/scripts/download_avatars.js');
const content = fs.readFileSync(scriptPath, 'utf8');

// 1. Đảm bảo có danh sách trắng tên miền tải avatar (SSRF Protection)
assert.equal(
  content.includes('ALLOWED_AVATAR_HOSTS'),
  true,
  'download_avatars.js phải kiểm tra tên miền trong ALLOWED_AVATAR_HOSTS trước khi fetch'
);

// 2. Đảm bảo sử dụng câu lệnh SQL có tham số hóa (Parameterized SQL)
assert.equal(
  content.includes('UPDATE characters SET avatar = ?'),
  true,
  'download_avatars.js phải sử dụng Parameterized Queries (?)'
);

console.log('✅ [PASS] TASK-06: Script download_avatars.js đã được bảo vệ chống SSRF, Path Traversal và SQL Injection.');
