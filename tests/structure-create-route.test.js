import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const aliasPagePath = path.resolve(process.cwd(), 'nextjs-frontend/app/create/page.tsx');
const content = fs.readFileSync(aliasPagePath, 'utf8');

assert.equal(
  content.includes('function StudioFallback'),
  false,
  'Route alias /create không được định nghĩa trùng lặp hàm StudioFallback'
);
assert.equal(
  content.includes("from '@/app/characters/create/page'"),
  true,
  'Route alias /create phải re-export trực tiếp từ @/app/characters/create/page'
);

console.log('✅ [PASS] TASK-02: Route alias /create đã khử trùng lặp thành công.');
