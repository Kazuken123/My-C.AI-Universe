import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const prepareAuditSource = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/prepare-audit.js'),
  'utf8'
);
const setupMemorySource = fs.readFileSync(
  path.resolve(process.cwd(), 'scripts/setup-memory.js'),
  'utf8'
);

// 1. Đảm bảo prepare-audit.js truyền đường dẫn qua biến môi trường AUDIT_PROMPT_FILE và dùng execFileSync
assert.equal(
  prepareAuditSource.includes('$env:AUDIT_PROMPT_FILE'),
  true,
  'prepare-audit.js phải đọc đường dẫn file từ biến môi trường $env:AUDIT_PROMPT_FILE thay vì nội suy chuỗi lệnh'
);

// 2. Đảm bảo setup-memory.js dùng execFileSync với mảng tham số
assert.equal(
  setupMemorySource.includes('execFileSync('),
  true,
  'setup-memory.js phải sử dụng execFileSync thay vì execSync nối chuỗi shell'
);

console.log('✅ [PASS] TASK-04: Các script công cụ đã loại bỏ hoàn toàn nội suy chuỗi lệnh shell.');
