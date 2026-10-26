# 🌟 My C.AI Universe (v2.3 — Cloud SQL & Production Edition)

A full-stack **Character.AI (`c.ai`)** roleplay platform built with an **Object-Oriented Programming (OOP)** architecture and a **6-table Relational SQL Database (`Turso Cloud` / `libSQL`)**, powered by Google Gemini.

> [!NOTE]
> **Non-Affiliation & Trademark Disclaimer:**  
> *My C.AI Universe* is an independent, educational, non-commercial open-source project created for technical portfolio and learning purposes. It is **not** affiliated with, endorsed by, sponsored by, or associated in any way with Character Technologies, Inc. or Character.AI. "Character.AI" and "c.ai" are trademarks of Character Technologies, Inc. All fictional characters, likenesses, and franchises belong to their respective copyright owners.

> 📈 **Living Progress & Architecture Log:** Check [PROGRESS.md](PROGRESS.md) for version history, recent bug fixes, Turso database patterns, and active roadmap.
> 
> 🗺️ **Interactive System Architecture:** View [how-my-website-works.html](how-my-website-works.html) or [docs/how-my-website-works.html](docs/how-my-website-works.html) for an interactive visual explainer of how the entire system works with animated live flows, component inspection, and dark/light themes.

> **CI and backend layers:** See [the CI guide](docs/CI.md) for isolated tests, frontend build checks, and deployment gates.

---

## 🏛️ Object-Oriented Programming (OOP) & SQL Architecture

- **OOP Domain Models (`backend/models/`)**:
  - `BaseEntity` (abstract base class) $\rightarrow$ `Character`, `UserPersona`, `ChatSession`, `ChatMessage`, `MessageVariant`, `CharacterMemory`.
- **OOP Data Access Repositories (`backend/repositories/`)**:
  - `DatabaseConnection` (Singleton managing `universe.sqlite`, `schema.sql`, `seed.sql`, and ACID transactions).
  - `BaseRepository` (abstract base class) $\rightarrow$ `CharacterRepository`, `ChatSessionRepository`, `PersonaRepository`, `MemoryRepository`.
- **OOP AI Strategy Providers (`backend/ai/`)**:
  - `BaseAIProvider` (abstract strategy) $\rightarrow$ `GeminiProvider`, `OllamaProvider`, coordinated by `AIOrchestrator`.
- **OOP Services & Controllers (`backend/services/`, `backend/controllers/`)**:
  - `WikiScraperService`, `SemanticMemoryService`, `StorageService` (Facade).
  - `BaseController` $\rightarrow$ `CharacterController`, `ChatController`, `PersonaController`, `MemoryController`, hosted by `ApplicationServer` (`server.js`).
- **OOP Frontend SPA (`frontend/js/`)**:
  - `CAIUniverseApp`, `ApiClient`, `CharacterManager`, `ChatRoomController`, `PersonaManager`.

---

## 📁 Categorized Project Structure

```text
My C.AI Universe/
├── .github/
│   └── copilot-instructions.md      # AI coding guidelines & OOP + SQL overview
├── backend/
│   ├── ai/
│   │   ├── memory/
│   │   │   └── memoryClient.js      # Python embedding service HTTP client class
│   │   ├── prompt/
│   │   │   └── characterPrompt.js   # System prompt compiler & light-novel formatter
│   │   ├── providers/
│   │   │   ├── BaseAIProvider.js    # Abstract OOP Strategy base class for LLMs
│   │   │   ├── gemini.js            # GeminiProvider OOP class (@google/genai)
│   │   │   ├── ollama.js            # OllamaProvider OOP class (local LLM)
│   │   │   └── index.js             # Provider exports
│   │   ├── errors.js                # Custom AIError, ValidationError, NotFoundError
│   │   └── index.js                 # AIOrchestrator OOP class & request queue
│   ├── config/
│   │   └── index.js                 # Centralized server, AI, and DB configuration
│   ├── controllers/
│   │   ├── BaseController.js        # Abstract OOP base controller
│   │   ├── character.controller.js  # CharacterController OOP class
│   │   ├── chat.controller.js       # ChatController OOP class
│   │   ├── memory.controller.js     # MemoryController OOP class
│   │   └── persona.controller.js    # PersonaController OOP class
│   ├── db/
│   │   ├── create_database.sql      # Portable MySQL / MariaDB / SQLite creation script
│   │   ├── database.js              # DatabaseConnection Singleton OOP class
│   │   ├── schema.sql               # 6-table relational DDL (PKs, FKs, CASCADE, Indexes)
│   │   ├── seed.sql                 # Initial SQL INSERT seed statements
│   │   └── universe.sqlite          # Live relational SQLite database file
│   ├── models/
│   │   ├── BaseEntity.js            # Abstract OOP root entity class
│   │   ├── Character.js             # Character domain entity class
│   │   ├── CharacterMemory.js       # CharacterMemory domain entity class
│   │   ├── ChatSession.js           # ChatSession, ChatMessage, MessageVariant classes
│   │   ├── UserPersona.js           # UserPersona domain entity class
│   │   └── index.js                 # Model barrel exports
│   ├── repositories/
│   │   ├── BaseRepository.js        # Abstract OOP SQL repository base class
│   │   ├── CharacterRepository.js   # Character SQL repository class
│   │   ├── ChatSessionRepository.js # ChatSession / Message / Variant SQL repository
│   │   ├── MemoryRepository.js      # CharacterMemory SQL repository class
│   │   ├── PersonaRepository.js     # UserPersona SQL repository class
│   │   └── index.js                 # Repository singleton & class exports
│   ├── routes/
│   │   ├── character.route.js
│   │   ├── chat.route.js
│   │   ├── memory.route.js
│   │   ├── persona.route.js
│   │   └── index.js                 # Unified /api router
│   └── services/
│       ├── memory.service.js        # SemanticMemoryService OOP class
│       ├── storage.service.js       # StorageService OOP Facade class
│       └── wiki.service.js          # WikiScraperService OOP class
├── docs/
│   ├── ARCHITECTURE_ERD_DFD.md      # Full Architecture, UML Class Diagram, ERD & DFDs
│   └── MEMORY_SERVICE.md            # Hybrid memory documentation
├── frontend/
│   ├── css/
│   │   └── styles.css               # Character.AI dark/light responsive design system
│   ├── js/
│   │   ├── api.js                   # ApiClient OOP class
│   │   ├── app.js                   # CAIUniverseApp OOP root controller & router
│   │   ├── characters.js            # CharacterManager OOP class (Discover & Studio)
│   │   ├── chat.js                  # ChatRoomController OOP class
│   │   └── personas.js              # PersonaManager OOP class
│   └── index.html                   # Unified C.AI application shell
├── memory-service/
│   ├── memory_service.py            # Optional Python Flask sentence-transformers service
│   └── requirements.txt             # Python dependencies
├── scripts/
│   ├── init-database.js             # CLI script to initialize & inspect SQL database
│   └── setup-memory.js              # Setup script for Python memory dependencies
├── tests/
│   └── api.test.js                  # Automated end-to-end SQL & OOP API test suite
├── .env.example                     # Environment variable template
├── .gitignore                       # Git ignore rules
├── package.json                     # Project manifest & scripts
└── server.js                        # ApplicationServer OOP entry point
```

---

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize / Inspect the Relational SQL Database**:
   ```bash
   npm run db:init
   ```
   *(You can also open `backend/db/universe.sqlite` directly in any SQLite viewer, or import `backend/db/create_database.sql` + `backend/db/seed.sql` into MySQL / MariaDB / DBeaver.)*

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Run automated SQL & API tests**:
   ```bash
   npm test
   ```

---

## 📄 License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for full details.