Ban la Chuyen gia Kiem tra An toan Thong tin va Kien truc Phan mem cap cao.
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
```javascript
// Doan ma an toan thay the
```
  - [ ] Chay lenh kiem thu xac nhan da het loi: npm test
