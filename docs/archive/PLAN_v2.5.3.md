# IMPLEMENTATION PLAN: Đồng bộ ranh giới Session & Tối ưu Cầu nối Node.js <-> Python Memory Microservice (v2.5.3)

- [x] Bước 1: Nâng cấp `backend/ai/memory/memoryClient.js` (Cooldown backoff, sessionId, deleteMemory, payload id)
- [x] Bước 2: Cập nhật `backend/services/memory.service.js` (Đồng bộ ID, deleteMemory, sessionId vào retrieveMemories)
- [x] Bước 3: Nâng cấp `memory-service/memory_service.py` (session_id filter, ID sync, deduplication, debug=False)
- [ ] Bước 4: Kiểm thử (`npm test`), Cập nhật tài liệu (`docs/MEMORY_SERVICE.md`, `PROGRESS.md`, `package.json`), Lưu kế hoạch vào `docs/archive/PLAN_v2.5.3.md`, `graphify update .`, Git Commit & Push
