# Hybrid Character Memory System (v2.5.3)

My C.AI Universe uses a **Hybrid Semantic Memory System** that works out-of-the-box in Node.js with relational SQL persistence (`Turso Cloud` / `libSQL`) while seamlessly bridging to an optional Python `sentence-transformers` embedding microservice.

## Architecture & Data Flow

1. **Relational SQL & In-Memory Engine (`backend/services/memory.service.js` & `backend/repositories/MemoryRepository.js`)**:
   - Persists character-scoped memories in relational table `character_memories` with index `idx_character_memories_session_source(session_id, source)`.
   - Scopes memory retrieval strictly to canonical character lore (`session_id IS NULL`) plus the active chat session (`session_id = currentSessionId`), eliminating cross-session memory bleeding.
   - Computes token cosine similarity and recency weighting to retrieve Top-K relevant memories for each chat turn.
   - Automatically extracts memorable user facts (names, preferences, relationships in English and Vietnamese) and character promises from conversation turns.
   - Isolates rolling story chronicles (`source = 'story_summary'`) with $O(1)$ indexed retrieval and upserts.

2. **Python Dense Embedding Microservice (`memory-service/memory_service.py`)**:
   - Runs on `http://localhost:5001` using `all-MiniLM-L6-v2` dense sentence embeddings.
   - **Session Isolation**: Filters memories strictly matching `character_id` and `(session_id is None or session_id == current_session_id)`, ignoring rolling story chronicles.
   - **Deduplication**: Content-hash deduplication across `(character_id, session_id)` avoids redundant vector embeddings.
   - **RAM Optimization**: Starts with `debug=False, use_reloader=False` to prevent double-loading model weights into RAM.
   - To install dependencies and run:
     ```bash
     npm run setup-memory
     python memory-service/memory_service.py
     ```

3. **Resilient HTTP Bridge (`backend/ai/memory/memoryClient.js`)**:
   - **Synchronized ID Lifecycle**: Passes the SQL `CharacterMemory.id` across the wire, eliminating ghost memories upon deletion (`deleteMemory(memoryId)`).
   - **Health-Check Backoff**: Enforces a 30-second cooldown on failed health checks, providing instantaneous $0\text{ ms}$ fallback to Node.js when the Python service is offline.
