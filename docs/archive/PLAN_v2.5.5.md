# IMPLEMENTATION PLAN: Dynamic Character Continuity, Strict Role-Alternation & Context-Aware Memory Query (v2.5.5)

- [x] Bước 1: Nâng cấp `generateCharacterPrompt` tại `backend/ai/prompt/characterPrompt.js`
  - Bổ sung quy tắc Dynamic Character Evolution & Contextual Adaptation
  - Bổ sung quy tắc Turn-to-Turn Logical Continuity (Anti-Contradiction)
  - Mở rộng Anti-Melodrama & Grounded Realism (chặn từ ngữ phóng đại cảm xúc)
  - Chuyển chỉ thị `[ALTERNATIVE TAKE DIRECTIVE]` vào `systemInstruction`
- [x] Bước 2: Chuẩn hóa chuỗi `contents` luân phiên tại `backend/ai/providers/gemini.js`
  - Gộp các lượt nhắn cùng role liên tiếp bằng `\n\n`
  - Tự động chèn `{ role: 'user', parts: [{ text: '[Scene Start]' }] }` khi lượt đầu tiên là model greeting
- [x] Bước 3: Làm giàu ngữ cảnh `queryForMemory` & làm sạch luồng Regenerate tại `backend/controllers/chat.controller.js`
  - Ghép ngữ cảnh lượt trước vào `queryForMemory` khi người dùng nhắn câu ngắn (<30 ký tự)
  - Truyền trực tiếp `precedingUserMsg` khi regenerate thay vì meta-prompt
- [x] Bước 4: Kiểm thử (`npm test` & `tests/continuity-v2.5.5.test.js`), cập nhật tài liệu (`PROGRESS.md`, `package.json`), AST graphify, Git commit & push
