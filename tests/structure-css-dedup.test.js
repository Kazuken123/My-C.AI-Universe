import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const nextAdminCss = fs.readFileSync(path.resolve(process.cwd(), 'nextjs-frontend/app/admin.css'), 'utf8');
const nextCropperCss = fs.readFileSync(path.resolve(process.cwd(), 'nextjs-frontend/app/cropper.css'), 'utf8');

assert.equal(
  nextAdminCss.trim(),
  "@import '../../frontend/css/admin.css';",
  'nextjs-frontend/app/admin.css phải import từ nguồn chuẩn frontend/css/admin.css'
);
assert.equal(
  nextCropperCss.trim(),
  "@import '../../frontend/css/cropper.css';",
  'nextjs-frontend/app/cropper.css phải import từ nguồn chuẩn frontend/css/cropper.css'
);

console.log('✅ [PASS] TASK-07: Đã khử trùng lặp hoàn toàn admin.css và cropper.css.');
