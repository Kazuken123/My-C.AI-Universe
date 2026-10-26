import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const repomixConfigFile = path.join(projectRoot, '.repomixignore');
const repomixOutputFile = path.join(projectRoot, 'repomix-output.xml');
const promptOutputFile = path.join(projectRoot, 'AUDIT_PROMPT.md');

console.log('--- Buoc 1: Dong goi ma nguon bang Repomix ---');

if (!fs.existsSync(repomixConfigFile)) {
  console.log('Tao file .repomixignore mac dinh...');
  const defaultIgnore = `node_modules/
dist/
build/
target/
*.lock
package-lock.json
pnpm-lock.yaml
yarn.lock
*.log
.git/
graphify-out/
.agents/
*.diff
.env
*.db
*.sqlite
*.sqlite3
assets/avatars/
*.png
*.jpg
*.jpeg
*.webp
*.ico
repomix-output.xml
repomix-output_*.xml
`;
  fs.writeFileSync(repomixConfigFile, defaultIgnore, 'utf8');
}

try {
  execSync('npx --yes repomix', { stdio: 'inherit', cwd: projectRoot });
} catch (error) {
  console.error('Loi khi chay repomix:', error.message);
  process.exit(1);
}

if (!fs.existsSync(repomixOutputFile)) {
  console.error('Khong tim thay file repomix-output.xml sau khi dong goi.');
  process.exit(1);
}

const stats = fs.statSync(repomixOutputFile);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`Dong goi thanh cong: ${repomixOutputFile} (${sizeMB} MB)`);

console.log('--- Buoc 2: Tao cau lenh kiem tra lo hong danh cho Gemini Web Argon ---');

const argonSecurityPrompt = `Ban la Chuyen gia Kiem tra An toan Thong tin va Kien truc Phan mem cap cao.
Toi gui kem file ma nguon toan bo he thong repomix-output.xml.

Muc tieu:
Kiem tra toan bo ma nguon de phat hien moi lo hong bao mat theo chuan OWASP Top 10, bao gom:
1. SQL Injection / NoSQL Injection / Command Injection
2. Broken Authentication & Session Management (JWT, API keys, permissions)
3. Broken Access Control & IDOR
4. SSRF (Server-Side Request Forgery) trong cac luong scrap/fetch du lieu
5. Insecure Deserialization & Prototype Pollution
6. Race conditions trong xu ly du lieu va co che lock
7. Information Disclosure & Sensitive Data Exposure

Yeu cau trinh bay ket qua:
Xuat ra duy nhat mot file Markdown co ten PLAN.md voi cau truc danh sach dau viec ro rang de Agent lap trinh tu dong thuc thi sua loi.

Cau truc mau cho tung lo hong trong PLAN.md:
# Ke hoach khac phuc lo hong bao mat

## [VULN-01] Ten lo hong
- Muc do: Critical | High | Medium | Low
- Vi tri: duong_dan_file:so_dong
- Nguyen nhan va rui ro: Giai thich ngan gon co che tan cong.
- Giai phap khac phuc:
  - [ ] Viet hoac cap nhat file kiem thu tai tests/vuln-01.test.js de tai hien lo hong truoc.
  - [ ] Chinh sua ma nguon tai file can sua theo logic an toan sau:
\`\`\`javascript
// Doan ma an toan thay the
\`\`\`
  - [ ] Chay lenh kiem thu xac nhan da het loi: npm test
`;

fs.writeFileSync(promptOutputFile, argonSecurityPrompt, 'utf8');
console.log(`Da tao file cau lenh tai: ${promptOutputFile}`);

console.log('--- Buoc 3: Sao chep cau lenh vao Clipboard ---');
try {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', 'Get-Content -Raw -Encoding UTF8 -LiteralPath $env:AUDIT_PROMPT_FILE | Set-Clipboard'],
      { env: { ...process.env, AUDIT_PROMPT_FILE: promptOutputFile } }
    );
    console.log('Da sao chep toan bo noi dung cau lenh vao Clipboard Windows.');
  } else {
    console.log(`Doc file ${promptOutputFile} de lay noi dung prompt.`);
  }
} catch (e) {
  console.log(`Chua tu dong copy duoc vao clipboard, mo file ${promptOutputFile} de copy thu cong.`);
}

console.log('\n=== HUONG DAN SU DUNG TIEP THEO ===');
console.log('1. Mo Gemini Web Argon tren trinh duyet.');
console.log('2. Keo tha file repomix-output.xml vao o chat.');
console.log('3. Nhan Ctrl + V de dan cau lenh (da luu san trong Clipboard) va gui.');
console.log('4. Copy ket qua tu Gemini Web luu vao file PLAN.md o thu muc goc.');
console.log('5. Yeu cau Antigravity: "Thuc thi PLAN.md de sua toan bo lo hong".');
