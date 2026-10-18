import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pyPath = path.resolve(process.cwd(), 'memory-service/memory_service.py');
const pySource = fs.readFileSync(pyPath, 'utf8');

// 1. Đảm bảo không còn trả trực tiếp str(e) ra JSON response
assert.equal(
  pySource.includes("jsonify({'error': str(e)})"),
  false,
  'memory_service.py không được phép trả trực tiếp str(e) ra HTTP 500 response'
);

// 2. Đảm bảo GET /memories bắt buộc phải có character_id
assert.equal(
  pySource.includes("if not character_id:\n            return jsonify({'error': 'character_id is required'}), 400"),
  true,
  'GET /memories phải bắt buộc tham số character_id để ngăn chặn dump toàn bộ cơ sở dữ liệu bộ nhớ'
);

console.log('✅ [PASS] TASK-04: Dịch vụ Python Memory Service đã chặn rò rỉ dữ liệu liên phiên và ẩn lỗi nội bộ.');
