import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { adminController } from '../backend/controllers/admin.controller.js';

const adminSource = fs.readFileSync(
  path.resolve(process.cwd(), 'backend/controllers/admin.controller.js'),
  'utf8'
);
const cropperSource = fs.readFileSync(
  path.resolve(process.cwd(), 'frontend/js/cropper.js'),
  'utf8'
);

// 1. Đảm bảo getRateLimitStatus tái sử dụng this.#collectRateLimiterStats()
const rateLimitMethodMatch = adminSource.match(/getRateLimitStatus\(_req,\s*res\)\s*\{[\s\S]*?\n  \}/);
assert.notEqual(rateLimitMethodMatch, null);
assert.equal(
  rateLimitMethodMatch[0].includes('this.#collectRateLimiterStats()'),
  true,
  'getRateLimitStatus phải tái sử dụng this.#collectRateLimiterStats()'
);

// Kiểm tra runtime của getRateLimitStatus
let statusPayload = null;
const mockRes = {
  status(code) { this.statusCode = code; return this; },
  json(data) { statusPayload = data; return this; }
};
adminController.getRateLimitStatus({}, mockRes);
assert.equal(typeof statusPayload.global, 'object');
assert.equal(typeof statusPayload.auth, 'object');
assert.equal(typeof statusPayload.sensitiveAi, 'object');

// 2. Đảm bảo ImageCropper.close() hủy requestAnimationFrame (cancelAnimationFrame) và kiểm tra kích thước file
assert.equal(
  cropperSource.includes('cancelAnimationFrame(this.rafId)'),
  true,
  'ImageCropper.close() phải hủy requestAnimationFrame đang chờ'
);
assert.equal(
  cropperSource.includes('MAX_INPUT_FILE_BYTES'),
  true,
  'ImageCropper.#loadFile phải kiểm tra kích thước file tối đa trước khi đọc vào RAM'
);

console.log('✅ [PASS] TASK-01: AdminController và ImageCropper đã được chuẩn hóa vòng đời tài nguyên.');
