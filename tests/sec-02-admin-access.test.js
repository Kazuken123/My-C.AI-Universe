import assert from 'node:assert/strict';
import { adminController } from '../backend/controllers/admin.controller.js';

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

// 1. Gọi updateUserRole khi thiếu thông tin admin trong req.user phải bị chặn (HTTP 401/403)
const resUnauth = createMockRes();
await adminController.updateUserRole(
  { params: { id: 'user_1' }, body: { role: 'admin' }, user: null },
  resUnauth
);
assert.equal(resUnauth.statusCode >= 400, true, 'Phải từ chối khi req.user không tồn tại');

// 2. Gọi unblockClient với tên bộ giới hạn (limiter) không hợp lệ phải trả về HTTP 400
const resInvalidLimiter = createMockRes();
await adminController.unblockClient(
  {
    user: { id: 'admin_1', role: 'admin' },
    body: { key: 'ip:127.0.0.1', limiter: 'invalid_limiter_name' }
  },
  resInvalidLimiter
);
assert.equal(resInvalidLimiter.statusCode, 400, 'Phải từ chối limiter ngoài danh sách trắng');

// 3. Gọi unblockClient với key sai định dạng (không bắt đầu bằng ip: hoặc user:) phải trả về HTTP 400
const resInvalidKey = createMockRes();
await adminController.unblockClient(
  {
    user: { id: 'admin_1', role: 'admin' },
    body: { key: '<script>alert(1)</script>', limiter: 'all' }
  },
  resInvalidKey
);
assert.equal(resInvalidKey.statusCode, 400, 'Phải từ chối key không đúng định dạng ip:* hoặc user:*');

console.log('✅ [PASS] TASK-02: AdminController kiểm soát chặt quyền truy cập và đầu vào.');
