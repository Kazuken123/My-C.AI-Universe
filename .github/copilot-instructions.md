# AI Coding Agent Instructions for My C.AI Universe

## Project Overview
My C.AI Universe is a full-stack Character.AI (`c.ai`) roleplay web application featuring Fandom/Wikipedia character ingestion, AI concept generation, swipeable response variants, scene continuation, message rewind, pinned memories, user personas, and a hybrid long-term semantic memory system.

## Categorized Directory Structure
- **`backend/config/`**: Centralized configuration (`index.js`)
- **`backend/controllers/`**: Express controllers (`character.controller.js`, `chat.controller.js`, `persona.controller.js`, `memory.controller.js`)
- **`backend/routes/`**: Express routers (`character.route.js`, `chat.route.js`, `persona.route.js`, `memory.route.js`, `index.js`)
- **`backend/services/`**: Domain services (`storage.service.js`, `wiki.service.js`, `memory.service.js`)
- **`backend/ai/`**: AI provider orchestration (`index.js`, `errors.js`, `prompt/characterPrompt.js`, `providers/gemini.js`, `providers/ollama.js`, `memory/memoryClient.js`)
- **`backend/db/`**: Relational SQL database (`schema.sql`, `seed.sql`, `database.js`, `universe.sqlite`)
- **`frontend/`**: Unified SPA (`index.html`, `css/styles.css`, `js/app.js`, `js/api.js`, `js/characters.js`, `js/chat.js`, `js/personas.js`)
- **`docs/`**: System Architecture, ERD, and DFD documentation (`ARCHITECTURE_ERD_DFD.md`, `MEMORY_SERVICE.md`)
- **`memory-service/`**: Optional Python `sentence-transformers` microservice (`memory_service.py`)
- **`scripts/`**: Setup utilities (`setup-memory.js`)
- **`tests/`**: End-to-end API test suite (`api.test.js`)