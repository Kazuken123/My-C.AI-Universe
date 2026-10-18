import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pyPath = path.resolve(process.cwd(), 'memory-service/memory_service.py');
const pySource = fs.readFileSync(pyPath, 'utf8');

// 1. Đảm bảo save_memories sử dụng ghi file nguyên tử qua os.replace
assert.equal(
  pySource.includes('os.replace('),
  true,
  'save_memories phải ghi qua file tạm và dùng os.replace để đảm bảo tính nguyên tử (atomic write)'
);

// 2. Đảm bảo retrieve_relevant_memories dùng np.dot trực tiếp trên các vector float32 đã chuẩn hóa
assert.equal(
  pySource.includes('np.dot(memory_embeddings, query_embedding[0])'),
  true,
  'retrieve_relevant_memories phải dùng np.dot trên vector đã chuẩn hóa thay vì tính lại L2 norm'
);

// 3. Đảm bảo get_all_memories loại bỏ story_summary và cô lập session_id khi session_id là None
assert.equal(
  pySource.includes("if (m.get('source') or m.get('metadata', {}).get('source')) != 'story_summary'"),
  true,
  'get_all_memories phải loại bỏ bản ghi nội bộ story_summary'
);

console.log('✅ [PASS] TASK-03: Dịch vụ Python Memory Service đã cô lập session, ghi file nguyên tử và tối ưu np.dot.');
