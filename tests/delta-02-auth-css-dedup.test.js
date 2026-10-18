import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const nextAuthCss = fs.readFileSync(path.resolve(process.cwd(), 'nextjs-frontend/app/auth.css'), 'utf8');

assert.equal(
  nextAuthCss.trim(),
  "@import '../../frontend/css/auth.css';",
  'nextjs-frontend/app/auth.css phải import trực tiếp từ nguồn chuẩn frontend/css/auth.css'
);

console.log('✅ [PASS] TASK-02: Đã khử trùng lặp hoàn toàn nextjs-frontend/app/auth.css.');
