import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as models from '../backend/models/index.js';

assert.equal(typeof models.User, 'function', 'backend/models/index.js phải export lớp User');

const scriptPath = path.resolve(process.cwd(), 'backend/scripts/download_avatars.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

assert.equal(
  scriptContent.includes('C:\\\\Users\\\\giuag'),
  false,
  'download_avatars.js không được chứa đường dẫn tuyệt đối gắn cứng với máy cá nhân'
);
assert.equal(
  scriptContent.includes('node:sqlite'),
  false,
  'download_avatars.js phải sử dụng getDatabase() thay vì import trực tiếp node:sqlite'
);

console.log('✅ [PASS] TASK-04: Đồng bộ Barrel Export và gỡ bỏ đường dẫn cứng / kết nối SQLite cô lập.');
