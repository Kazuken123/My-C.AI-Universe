# IMPLEMENTATION PLAN: Tối ưu hóa AI Orchestrator, Gemini Provider & Hybrid Memory System (v2.3.1)

- [x] Bước 1: Chặn rò rỉ `tagline` và chuẩn hóa Greeting tại `backend/ai/prompt/characterPrompt.js`
- [x] Bước 2: Xử lý triệt để `#buildInCharacterFallback` tại `backend/ai/index.js`
- [x] Bước 3: Nâng cấp chuỗi Fallback Model & `systemInstruction` tại `backend/ai/providers/gemini.js`
- [x] Bước 4: Tối ưu truy vấn SQL trong `backend/db/schema.sql` và `backend/repositories/MemoryRepository.js`
- [x] Bước 5: Nâng cấp `backend/services/memory.service.js` (O(1) summary, session-scoped retrieval, bilingual regex)
- [x] Bước 6: Cập nhật `backend/controllers/chat.controller.js` (truyền sessionId vào memory & aiOptions khi regenerate)
- [x] Bước 7: Kiểm tra & Nghiệm thu (Chạy `npm test`, cập nhật `PROGRESS.md`, chạy `graphify update .`)
