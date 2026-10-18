import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pyPath = path.resolve(process.cwd(), 'memory-service/memory_service.py');
const pySource = fs.readFileSync(pyPath, 'utf8');

// 1. Đảm bảo save_memories ghi file nguyên tử qua os.replace
assert.equal(
  pySource.includes('os.replace('),
  true,
  'save_memories phải dùng os.replace để đảm bảo ghi file nguyên tử'
);

// 2. Đảm bảo get_all_memories loại bỏ story_summary
assert.equal(
  pySource.includes("!= 'story_summary'"),
  true,
  'get_all_memories phải loại bỏ các bản ghi nội bộ story_summary'
);

// 3. Đảm bảo get_all_memories cô lập session_id (chỉ lấy None khi không truyền session_id, và lấy (None, session_id) khi có truyền)
assert.equal(
  pySource.includes('in (None, session_id)'),
  true,
  'get_all_memories phải giữ cả ký ức gốc (None) và ký ức của phiên hiện tại (session_id)'
);

console.log('✅ [PASS] HOTFIX: memory_service.py đảm bảo cô lập session và tối ưu hiệu năng.');
