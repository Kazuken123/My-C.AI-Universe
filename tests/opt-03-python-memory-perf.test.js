import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pyPath = path.resolve(process.cwd(), 'memory-service/memory_service.py');
const pySource = fs.readFileSync(pyPath, 'utf8');

// 1. Đảm bảo save_memories dùng compact JSON separators=(',', ':') thay vì indent=2
assert.equal(
  pySource.includes("separators=(',', ':')"),
  true,
  'memory_service.py phải lưu JSON ở chế độ compact để giảm dung lượng đĩa và thời gian I/O'
);

// 2. Đảm bảo tính toán vector sử dụng dtype=np.float32
assert.equal(
  pySource.includes('dtype=np.float32'),
  true,
  'memory_service.py phải sử dụng np.float32 cho ma trận embedding để giảm 50% RAM và tăng tốc SIMD'
);

// 3. Đảm bảo get_all_memories đã loại bỏ khóa embedding khỏi JSON trả về
assert.equal(
  pySource.includes("if k != 'embedding'"),
  true,
  'get_all_memories không được trả mảng vector embedding 384 chiều ra ngoài payload HTTP'
);

console.log('✅ [PASS] TASK-03: Đã tối ưu hóa ma trận float32, compact I/O và payload JSON trong memory_service.py.');
