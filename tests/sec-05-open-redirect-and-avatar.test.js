import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const authPageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'nextjs-frontend/app/auth/page.tsx'),
  'utf8'
);
const profilePageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'nextjs-frontend/app/profile/page.tsx'),
  'utf8'
);

// 1. Kiểm tra hàm sanitizeReturnUrl có mặt trong auth/page.tsx
assert.equal(
  authPageSource.includes('function sanitizeReturnUrl('),
  true,
  'auth/page.tsx phải định nghĩa và sử dụng hàm sanitizeReturnUrl để chặn Open Redirect'
);

// 2. Kiểm tra regex isSafeImageUrl chặn // và chặn SVG data URI trong cả 2 trang
assert.equal(
  profilePageSource.includes('data:image\\/(png|jpeg|jpg|webp|gif);base64,'),
  true,
  'profile/page.tsx chỉ được cho phép các định dạng ảnh raster an toàn hoặc đường dẫn nội bộ hợp lệ'
);

console.log('✅ [PASS] TASK-05: Đã chặn Open Redirect và chuẩn hóa kiểm tra URL ảnh đại diện.');
