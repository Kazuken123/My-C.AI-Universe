# IMPLEMENTATION PLAN: Performance Optimization — Batch SQL, Lean Queries, Model Fix & Frontend Dedup (v2.5.5)

- [x] Bước 1: Sửa N+1 `_hydrateSession` — batch variant loading (`backend/repositories/ChatSessionRepository.js`)
- [x] Bước 2: Thêm `findAllLean()` cho sidebar listing (`backend/repositories/ChatSessionRepository.js`, `backend/controllers/chat.controller.js`)
- [x] Bước 3: Sửa model Gemini mặc định (`backend/config/index.js`, `.env`, `gemini.js`)
- [x] Bước 4: Deduplicate auth middleware (`backend/middlewares/auth.js`)
- [x] Bước 5: Parallelize controller lookups (`backend/controllers/chat.controller.js`)
- [x] Bước 6: Giảm queue delay AI Orchestrator (`backend/ai/index.js`)
- [x] Bước 7: Frontend — Cache & Deduplicate `loadAllSessions` (`frontend/js/chat.js`)
- [x] Bước 8: Kiểm thử (`npm test`), tài liệu (`PROGRESS.md`, `package.json`), archive, graphify, Git commit & push
