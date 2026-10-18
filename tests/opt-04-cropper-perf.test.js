import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cropperPath = path.resolve(process.cwd(), 'frontend/js/cropper.js');
const content = fs.readFileSync(cropperPath, 'utf8');

// 1. Đảm bảo có cơ chế gom nhóm lệnh vẽ qua requestAnimationFrame (#scheduleRender)
assert.equal(
  content.includes('requestAnimationFrame('),
  true,
  'ImageCropper phải điều tiết vẽ Canvas qua requestAnimationFrame để tránh nghẽn UI thread'
);

// 2. Đảm bảo ưu tiên xuất định dạng nén nhẹ image/webp với fallback về image/jpeg
assert.equal(
  content.includes("'image/webp'"),
  true,
  'ImageCropper phải ưu tiên xuất định dạng image/webp để giảm kích thước JSON upload payload'
);

console.log('✅ [PASS] TASK-04: ImageCropper đã tối ưu hóa requestAnimationFrame và nén ảnh WebP.');
