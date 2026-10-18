import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Character } from '../backend/models/Character.js';

const baseEntityPath = path.resolve(process.cwd(), 'backend/models/BaseEntity.js');
const source = fs.readFileSync(baseEntityPath, 'utf8');

// 1. Đảm bảo không còn sử dụng Math.random() để sinh ID
assert.equal(
  source.includes('Math.random()'),
  false,
  'BaseEntity.generateId() không được sử dụng Math.random() không an toàn mật mã'
);

// 2. Kiểm tra tính duy nhất và độ dài phần ngẫu nhiên đủ lớn (>= 16 ký tự hex sau dấu gạch dưới)
const ids = new Set();
for (let i = 0; i < 1000; i++) {
  const char = new Character({ name: 'Test', greeting: 'Hi', personality: 'Calm' });
  assert.match(char.id, /^\d+_[0-9a-f]{16}$/);
  ids.add(char.id);
}
assert.equal(ids.size, 1000, 'Tất cả 1000 ID sinh ra liên tiếp phải hoàn toàn duy nhất');

console.log('✅ [PASS] TASK-01: BaseEntity sử dụng CSPRNG (crypto.randomBytes) an toàn.');
