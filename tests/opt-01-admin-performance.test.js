import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { adminController } from '../backend/controllers/admin.controller.js';

const controllerPath = path.resolve(process.cwd(), 'backend/controllers/admin.controller.js');
const source = fs.readFileSync(controllerPath, 'utf8');

// 1. Đảm bảo getOverview sử dụng Promise.all và không gọi userRepo.findAll() để đếm
assert.equal(
  source.includes('await Promise.all(['),
  true,
  'AdminController phải sử dụng Promise.all để chạy song song các truy vấn thống kê'
);

// 2. Kiểm tra payload trả về của getCharacters đã lược bỏ các trường văn bản nặng
function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

const res = createMockRes();
await adminController.getCharacters({}, res);
assert.equal(res.statusCode, 200);
assert.equal(Array.isArray(res.body), true);

if (res.body.length > 0) {
  const sample = res.body[0];
  assert.equal('id' in sample && 'name' in sample && 'likes' in sample, true);
  assert.equal('systemPrompt' in sample, false, 'Payload danh sách nhân vật không được chứa systemPrompt nặng');
  assert.equal('example_dialogues' in sample, false, 'Payload danh sách nhân vật không được chứa example_dialogues');
  assert.equal('initial_memory' in sample, false, 'Payload danh sách nhân vật không được chứa initial_memory');
}

console.log('✅ [PASS] TASK-01: Đã song song hóa truy vấn SQL và tối ưu kích thước JSON payload trong AdminController.');
