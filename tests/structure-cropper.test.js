import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cropperPath = path.resolve(process.cwd(), 'frontend/js/cropper.js');
const content = fs.readFileSync(cropperPath, 'utf8');

assert.equal(
  content.includes('this.uploader = uploader || ((dataUrl) => api.uploadAvatar(dataUrl))'),
  true,
  'ImageCropper phải hỗ trợ dependency injection cho hàm uploader để tách biệt UI và Network'
);

assert.equal(
  content.includes('#exportCroppedDataUrl()'),
  true,
  'ImageCropper phải tách riêng logic xuất ảnh #exportCroppedDataUrl'
);
assert.equal(
  content.includes('await this.uploader(dataUrl)'),
  true,
  'ImageCropper phải gọi this.uploader thay vì api.uploadAvatar trực tiếp trong handleApply'
);

console.log('✅ [PASS] TASK-05: ImageCropper hỗ trợ Dependency Injection cho tầng upload.');
