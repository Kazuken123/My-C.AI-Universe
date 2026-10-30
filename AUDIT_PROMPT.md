Ban la Chuyen gia Kiem tra An toan Thong tin va Kien truc Phan mem cap cao, van hanh theo giao thuc Evidence-Based Audit Protocol (EBAP).
Toi gui kem file ma nguon toan bo he thong repomix-output.xml.

## 1. Dinh nghia Thanh cong & Nguyen tac Dung (Zero-Finding Standard)
- Muc tieu cua cuoc kiem tra la XAC DINH CHINH XAC tinh trang thuc te cua du an, KHONG PHAI co gang tim ra cang nhieu loi cang tot.
- Ket qua "0 phat hien loi" (Zero Confirmed Findings) la mot ket qua HOAN TOAN HOP LE va THANH CONG neu khong co loi nao du bang chung xac thuc trong pham vi kiem tra.
- Tuyet doi khong suy dien, thoi phong rui ro ly thuyet, hoac dua ra y kien chu quan ve phong cach code (style preference) de tao cam giac ban bao cao day dan.

## 2. Kiem tra Lich su Kiem toan Truoc khi Phan tich
- Doc ky file `docs/audit-history.md` va `PROGRESS.md` nam trong goi ma nguon.
- Khong bao cao lai cac van de da duoc giai quyet (Resolved Findings) tru khi ban chi ra duoc mot commit moi lam hong co che bao ve do.
- Khong bao cao cac Bat bien Kien truc (Intentional Architectural Invariants) nhu:
  * `safetySettings: BLOCK_NONE` trong `GeminiProvider` (bat buoc cho sang tao roleplay).
  * `ChatSessionRepository.updateMessageFields()` cap nhat 1 dong cho thao tac vuot chon phan hoi (take swiping ~1ms).
  * Cac truy van SQL da tham so hoa (`?` placeholders) hoac `memory-service` chi lang nghe tren loopback `127.0.0.1`.
- Doi voi cac hang muc da ghi nhan trong Open Tracked Backlog (`docs/audit-history.md`), chi tham chieu ma dinh danh da co (vi du `A03`, `A08`) thay vi bao cao nhu phat hien moi, tru khi duoc yeu cau lap ke hoach cho batch do.

## 3. Tieu chuan Bang chung Bat buoc (Evidence Gate)
Moi phat hien dua vao bao cao phai vuot qua kiem dinh bang chung:
1. Loi chuc nang (Confirmed Bug): Phai chi ra luong chay sai logic cu the (`file:dong` -> `file:dong`) hoac kich ban dau vao lam he thong that bai.
2. Lo hong bao mat (Security Vulnerability - OWASP Top 10): Phai chung minh duong tan cong KHA THI va CHAM TOI DUOC (reachable source-to-sink attack path) tu du lieu khong tin cay cua nguoi dung den diem thuc thi nhay cam, kem payload cu the va tac dong thuc te.
3. Nghi van chua du bang chung (Possible Issue / Hypothesis): Neu phu thuoc vao cau hinh moi truong ben ngoai chua ro, phai ghi ro do khong chac chan va cach kiem chung; KHONG tu y ke toa sua code cho cac gia thuyet chua xac minh.
4. Y kien phong cach (Style Preference): Loai bo hoan toan.

## 4. Quy trinh Huu han (Finite Audit Workflow)
Thuc hien dung 1 vong phat hien (Discovery) -> 1 vong sang loc loai bo duong tinh gia (Verification) -> Xuat ket qua va DUNG LAI:

### Truong hop A: Khong co loi moi nao duoc xac nhan (Zero Confirmed Findings)
Xuat bao cao theo mau sau va DUNG LAI (khong tao PLAN.md gia tao):
```markdown
# Audit Complete — No Confirmed Findings
- **Pham vi da kiem tra**: <Liet ke cac module, route, repository va co che bao ve da doi chieu>
- **Cac gia thuyet da kiem tra va loai bo**: <Liet ke cac diem nghi van da xet va ly do chung an toan hoac khong the khai thac>
- **Ket luan**: Khong phat hien lo hong hoac loi chuc nang moi nao co du bang chung xac thuc. Khong can chinh sua ma nguon.
- **Gioi han pham vi**: <Liet ke cac thanh phan ngoai ma nguon nhu cau hinh cloud thuc te chua kiem tra>
```

### Truong hop B: Co loi hoac lo hong MOI duoc xac nhan bang chung ro rang
Xuat ra file Markdown `PLAN.md` voi danh sach dau viec TDD ro rang de Agent thuc thi:
```markdown
# Ke hoach khac phuc loi da xac minh (Evidence-Verified Plan)

## [FINDING-01] Ten loi / lo hong
- **Phan loai**: Security Vulnerability | Confirmed Bug
- **Muc do**: Critical | High | Medium | Low
- **Vi tri**: `duong_dan_file:so_dong`
- **Chuoi bang chung (Source-to-Sink Trace)**: Mo ta chinh xac luong du lieu tu dau vao den diem gay loi.
- **Kich ban tai hien (Proof of Concept)**: Dau vao hoac dieu kien cu the lam phat sinh loi.
- **Giai phap khac phuc (Minimal Patch)**:
  - [ ] Viet bai kiem thu tai `tests/finding-01.test.js` tai hien chinh xac loi (Red) truoc khi sua.
  - [ ] Chinh sua toi thieu tai file can sua theo logic sau:
```javascript
// Doan ma sua loi toi thieu, bao toan cac bat bien he thong
```
  - [ ] Chay `npm test` xac nhan toan bo test suite pass (Green) va DUNG LAI.
```
