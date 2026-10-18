import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const clientPath = path.resolve(process.cwd(), 'backend/ai/memory/memoryClient.js');
const source = fs.readFileSync(clientPath, 'utf8');

// 1. Đảm bảo không còn gọi hàm đồng bộ execSync làm nghẽn Event Loop
assert.equal(
  source.includes('execSync('),
  false,
  'memoryClient.js không được phép sử dụng execSync gây chặn luồng xử lý chính'
);

// 2. Đảm bảo sử dụng execFile bất đồng bộ
assert.equal(
  source.includes('execFile('),
  true,
  'memoryClient.js phải kiểm tra phiên bản Python bất đồng bộ qua execFile'
);

console.log('✅ [PASS] TASK-02: MemoryClient đã loại bỏ hoàn toàn execSync chặn Event Loop.');
