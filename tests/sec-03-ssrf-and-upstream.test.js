import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { memoryClient } from '../backend/ai/memory/memoryClient.js';

// 1. Kiểm tra MemoryClient có hàm kiểm tra URL nội bộ an toàn
assert.equal(
  typeof memoryClient.isAllowedServiceUrl,
  'function',
  'MemoryClient phải có phương thức isAllowedServiceUrl để chặn SSRF'
);
assert.equal(memoryClient.isAllowedServiceUrl('http://localhost:5001'), true);
assert.equal(memoryClient.isAllowedServiceUrl('http://127.0.0.1:5001'), true);
assert.equal(memoryClient.isAllowedServiceUrl('http://169.254.169.254/latest/meta-data/'), false);
assert.equal(memoryClient.isAllowedServiceUrl('file:///etc/passwd'), false);

// 2. Kiểm tra OllamaProvider không ghép raw response text vào AIError gửi cho client
const ollamaSource = fs.readFileSync(
  path.resolve(process.cwd(), 'backend/ai/providers/ollama.js'),
  'utf8'
);
assert.equal(
  ollamaSource.includes('throw new AIError(`Ollama HTTP ${res.status}: ${text}`'),
  false,
  'OllamaProvider không được trả thẳng nội dung lỗi thô của upstream vào thông điệp AIError'
);

console.log('✅ [PASS] TASK-03: Đã bảo vệ chống SSRF tại MemoryClient và ẩn chi tiết lỗi nội bộ tại OllamaProvider.');
