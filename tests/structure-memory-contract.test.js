import assert from 'node:assert/strict';
import { memoryClient } from '../backend/ai/memory/memoryClient.js';

let checkHealthCalled = false;
const originalCheckHealth = memoryClient.checkHealth;
memoryClient.checkHealth = async () => {
  checkHealthCalled = true;
  return true;
};

try {
  // Khi source là story_summary, memoryClient phải bỏ qua ngay lập tức mà không gọi HTTP sang Python hay checkHealth
  const result = await memoryClient.addMemory('Rolling summary text', 'char_1', {
    source: 'story_summary',
    sessionId: 'sess_1'
  });
  assert.equal(result, null, 'memoryClient.addMemory phải chặn story_summary ngay tại biên client');
  assert.equal(checkHealthCalled, false, 'memoryClient.addMemory không được gọi checkHealth hoặc HTTP khi source là story_summary');

  // Kiểm tra biến thể viết hoa STORY_SUMMARY
  const resultUpper = await memoryClient.addMemory('Rolling summary text', 'char_1', {
    source: 'STORY_SUMMARY',
    sessionId: 'sess_1'
  });
  assert.equal(resultUpper, null, 'memoryClient.addMemory phải chặn STORY_SUMMARY bất kể hoa thường');
  assert.equal(checkHealthCalled, false, 'memoryClient.addMemory không được gọi checkHealth khi source là STORY_SUMMARY');

  // Kiểm tra metadata là null hoặc rỗng không gây crash TypeError
  const resultNullMeta = await memoryClient.addMemory('', 'char_1', null);
  assert.equal(resultNullMeta, null, 'metadata null không được ném ra TypeError');
  assert.equal(checkHealthCalled, false, 'empty content không được gọi checkHealth');

  console.log('✅ [PASS] TASK-06: Hợp đồng dữ liệu giữa Node.js MemoryClient và Python MemoryService đã đồng nhất.');
} finally {
  memoryClient.checkHealth = originalCheckHealth;
}
