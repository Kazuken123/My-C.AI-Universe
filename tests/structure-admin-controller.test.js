import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const controllerPath = path.resolve(process.cwd(), 'backend/controllers/admin.controller.js');
const source = fs.readFileSync(controllerPath, 'utf8');

// 1. Đảm bảo Controller không còn gọi getDatabase() trực tiếp
assert.equal(
  source.includes('getDatabase('),
  false,
  'AdminController không được phép gọi getDatabase() trực tiếp mà phải thông qua Repository'
);

// 2. Đảm bảo hằng số SECURITY_CHECKLIST được tách ra cấp độ module
assert.equal(
  source.includes('const SECURITY_CHECKLIST = Object.freeze('),
  true,
  'SECURITY_CHECKLIST phải được khai báo bất biến ở cấp module'
);

// 3. Đảm bảo runtime methods getOverview và getUsers thực thi đúng đắn với repositories
import { AdminController } from '../backend/controllers/admin.controller.js';

const mockUserRepo = {
  count: async () => 10,
  countAdmins: async () => 2,
  findAll: async () => [
    { id: 'u1', username: 'alice', email: 'alice@example.com', role: 'admin', toJSON() { return { id: this.id, username: this.username }; } },
    { id: 'u2', username: 'bob', email: null, role: 'user', toJSON() { return { id: this.id, username: this.username }; } }
  ]
};
const mockCharRepo = { count: async () => 5 };
const mockSessionRepo = {
  count: async () => 8,
  countMessages: async () => 42,
  countByUser: async () => new Map([['u1', 3], ['u2', 5]])
};
const mockPersonaRepo = { count: async () => 3 };
const mockMemoryRepo = { count: async () => 12 };

const controller = new AdminController();
controller.userRepo = mockUserRepo;
controller.charRepo = mockCharRepo;
controller.sessionRepo = mockSessionRepo;
controller.personaRepo = mockPersonaRepo;
controller.memoryRepo = mockMemoryRepo;

let overviewPayload = null;
const mockResOverview = {
  setHeader() { return this; },
  status(code) { this.statusCode = code; return this; },
  json(data) { overviewPayload = data; return this; }
};

await controller.getOverview({}, mockResOverview);
assert.equal(overviewPayload.counts.totalUsers, 10);
assert.equal(overviewPayload.counts.admins, 2);
assert.equal(overviewPayload.counts.standardUsers, 8);
assert.equal(overviewPayload.counts.chatMessages, 42);
assert.equal(Array.isArray(overviewPayload.securityChecklist), true);

let usersPayload = null;
const mockResUsers = {
  setHeader() { return this; },
  status(code) { this.statusCode = code; return this; },
  json(data) { usersPayload = data; return this; }
};

await controller.getUsers({}, mockResUsers);
assert.equal(usersPayload.length, 2);
assert.equal(usersPayload[0].sessionCount, 3);
assert.equal(usersPayload[1].sessionCount, 5);
assert.equal(usersPayload[1].email, 'N/A');

// 4. Đảm bảo getUsers an toàn khi đối tượng người dùng là plain object không có toJSON()
controller.userRepo.findAll = async () => [
  { id: 'u_plain', username: 'plain_user', email: 'plain@example.com', role: 'user' }
];
let plainUsersPayload = null;
const mockResPlain = {
  setHeader() { return this; },
  status(code) { this.statusCode = code; return this; },
  json(data) { plainUsersPayload = data; return this; }
};
await controller.getUsers({}, mockResPlain);
assert.equal(Array.isArray(plainUsersPayload), true);
assert.equal(plainUsersPayload[0].id, 'u_plain');
assert.equal(plainUsersPayload[0].sessionCount, 0);

console.log('✅ [PASS] TASK-01: AdminController tuân thủ ranh giới Repository và SRP.');
