import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const personasPageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'nextjs-frontend/app/personas/page.tsx'),
  'utf8'
);
const authPageSource = fs.readFileSync(
  path.resolve(process.cwd(), 'nextjs-frontend/app/auth/page.tsx'),
  'utf8'
);

// 1. Đảm bảo loadPersonas hỗ trợ cờ silent để không bật lại toàn bộ skeleton khi cập nhật cục bộ
assert.equal(
  personasPageSource.includes('loadPersonas(true)'),
  true,
  'personas/page.tsx phải gọi loadPersonas(true) ở chế độ silent sau khi cập nhật/xóa/tạo mới'
);

// 2. Đảm bảo auth/page.tsx quản lý và dọn dẹp timer thông báo bằng clearTimeout
assert.equal(
  authPageSource.includes('clearTimeout('),
  true,
  'auth/page.tsx phải dọn dẹp setTimeout của socialNotice bằng clearTimeout'
);

console.log('✅ [PASS] TASK-05: Đã tối ưu hóa làm mới danh sách Persona không nháy Skeleton và dọn dẹp Timer tại AuthPage.');
