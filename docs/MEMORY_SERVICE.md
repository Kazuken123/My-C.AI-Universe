# Hybrid Character Memory System

My C.AI Universe uses a **Hybrid Semantic Memory System** that works out-of-the-box in Node.js while optionally bridging to a Python `sentence-transformers` embedding service.

## How It Works

1. **Built-In Node.js Memory Engine (`backend/services/memory.service.js`)**:
   - Persists character-scoped memories in `backend/db/memories.json`.
   - Computes TF-IDF / token cosine similarity and recency weighting to retrieve the Top-K most relevant memories for every chat turn.
   - Automatically extracts memorable user facts (names, preferences, relationships) and character promises from conversation turns.
   - Injects Pinned Messages (`📌`) and retrieved Long-Term Memories (`🧠`) into the character prompt.

2. **Optional Python Embedding Microservice (`memory-service/memory_service.py`)**:
   - Runs on `http://localhost:5001` using `all-MiniLM-L6-v2` dense embeddings.
   - To install Python dependencies:
     ```bash
     npm run setup-memory
     ```
   - To run the Python embedding service:
     ```bash
     python memory-service/memory_service.py
     ```
   - When running, `backend/services/memory.service.js` automatically delegates semantic retrieval to the Python microservice and falls back to the Node.js engine when offline.
