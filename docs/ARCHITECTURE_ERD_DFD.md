# My C.AI Universe — System Architecture, ERD & DFD Specification

This document defines the base **System Architecture**, **Entity-Relationship Diagram (ERD)**, and **Data Flow Diagrams (DFD Level 0, Level 1, and Level 2)** for **My C.AI Universe** before implementation of the backend and frontend modules.

---

## 1. System Architecture (Base Architecture)

**My C.AI Universe** follows a layered, modular client-server architecture modeled after Character.AI:

1. **Presentation Layer (`frontend/`)**:
   - Single-Page Application (SPA) shell with multi-route support (`/`, `/chat.html`, `/create.html`, `/characters.html`, `/chats.html`).
   - Built with modular Vanilla ES6 JavaScript (`api.js`, `app.js`, `chat.js`, `characters.js`, `personas.js`) and a Character.AI-inspired CSS design system (`styles.css`).
   - Features Discover feed, Character Studio (manual + Fandom/Wikipedia scraper + AI generator), Chat Room (message variants/swiping, scene continuation, message editing, rewind, pinned memories, Web Speech TTS), and User Persona management.

2. **API & Controller Layer (`backend/routes/`, `backend/controllers/`)**:
   - RESTful Express.js API handling HTTP requests, input validation, and standardized error formatting.
   - Divided into four domain controllers: `character.controller.js`, `chat.controller.js`, `persona.controller.js`, and `memory.controller.js`.

3. **Service & AI Intelligence Layer (`backend/services/`, `backend/ai/`)**:
   - **AI Orchestrator (`backend/ai/index.js`)**: Queued request dispatcher supporting Google Gemini (`@google/genai`) as primary model and local Ollama (`qwen2.5` / configurable model) as optional provider/fallback.
   - **Prompt Engine (`backend/ai/prompt/characterPrompt.js`)**: Assembles character persona, speaking style, active user persona, pinned messages, retrieved long-term semantic memories, and recent conversation history into a light-novel roleplay prompt.
   - **Wiki Scraper Service (`backend/services/wiki.service.js`)**: Fetches allowed Fandom/Wikipedia pages via Cheerio, extracts character infobox avatars and article text, and uses Gemini structured JSON extraction to populate character attributes and opening greetings.
   - **Hybrid Memory Engine (`backend/services/memory.service.js` & `memory-service/memory_service.py`)**: Combines a built-in Node.js TF-IDF/cosine similarity engine with an optional Python `sentence-transformers` microservice (`all-MiniLM-L6-v2`) for semantic memory storage and retrieval.

4. **Relational SQL Persistence Layer (`backend/db/` & `backend/services/storage.service.js`)**:
   - Powered by a normalized 6-table **SQLite Relational Database** (`backend/db/universe.sqlite`) via `node:sqlite` (`backend/db/database.js`).
   - Defined in [`backend/db/schema.sql`](../backend/db/schema.sql) and seeded via [`backend/db/seed.sql`](../backend/db/seed.sql) with Foreign Keys (`ON DELETE CASCADE`), WAL journaling, ACID transactions, and secondary indexes across `user_personas`, `characters`, `chat_sessions`, `chat_messages`, `message_variants`, and `character_memories`.

### High-Level System Architecture Diagram

```mermaid
flowchart TB
    subgraph Client["Frontend Client (Browser)"]
        UI_Discover["Discover & Search View"]
        UI_Studio["Character Studio & Wiki Importer"]
        UI_Chat["C.AI Chat Room (Variants, Rewind, Pins, TTS)"]
        UI_Persona["User Persona & Memory Drawer"]
        API_Client["Frontend API Client (frontend/js/api.js)"]
    end

    subgraph Server["Node.js / Express Backend (backend/)"]
        Router["API Router (/api/*)"]
        CharCtrl["Character Controller"]
        ChatCtrl["Chat & Session Controller"]
        PersonaCtrl["Persona Controller"]
        MemCtrl["Memory Controller"]

        WikiSvc["Wiki Scraper Service (Cheerio + Gemini)"]
        PromptEng["Character Prompt Engine"]
        AIOrch["AI Orchestrator & Rate Queue"]
        MemSvc["Hybrid Memory Service (Node TF-IDF + Python Bridge)"]
        StorageSvc["Storage Service (Atomic JSON Repository)"]
    end

    subgraph External["External & AI Services"]
        Gemini["Google Gemini API (@google/genai)"]
        Ollama["Local Ollama API (localhost:11434)"]
        Wiki["Fandom / Wikipedia Pages"]
        PyMem["Python Embedding Service (Flask :5001)"]
    end

    subgraph Database["JSON Persistence (backend/db/)"]
        DB_Chars[("characters.json")]
        DB_Chats[("chats.json")]
        DB_Personas[("personas.json")]
        DB_Memories[("memories.json")]
    end

    UI_Discover & UI_Studio & UI_Chat & UI_Persona --> API_Client
    API_Client <-->|"REST JSON over HTTP"| Router

    Router --> CharCtrl & ChatCtrl & PersonaCtrl & MemCtrl

    CharCtrl --> WikiSvc
    CharCtrl --> StorageSvc
    WikiSvc -->|"HTTP GET HTML"| Wiki
    WikiSvc -->|"Structured JSON Extraction"| Gemini

    ChatCtrl --> PromptEng
    ChatCtrl --> AIOrch
    ChatCtrl --> MemSvc
    ChatCtrl --> StorageSvc

    PersonaCtrl --> StorageSvc
    MemCtrl --> MemSvc

    AIOrch --> Gemini
    AIOrch --> Ollama

    MemSvc <-->|"Optional HTTP :5001"| PyMem
    MemSvc --> StorageSvc

    StorageSvc <--> DB_Chars & DB_Chats & DB_Personas & DB_Memories
```

---

## 2. Entity-Relationship Diagram (ERD)

The data model consists of 6 core entities:
- **`USER_PERSONA`**: Represents the user's roleplay identity (name, avatar, bio, active default flag).
- **`CHARACTER`**: Represents an AI character with rich profile attributes, greeting, wiki metadata, categories, and interaction metrics.
- **`CHAT_SESSION`**: Represents a conversation thread between a `USER_PERSONA` and a `CHARACTER`. A user can have multiple chat sessions per character (e.g., different roleplay storylines).
- **`CHAT_MESSAGE`**: Represents an individual turn (`user` or `model`) within a `CHAT_SESSION`, supporting pinning and star ratings.
- **`MESSAGE_VARIANT`**: Represents alternative generated responses (swipes) for a single `CHAT_MESSAGE`, tracking which variant index is currently selected.
- **`CHARACTER_MEMORY`**: Represents long-term episodic/factual memories associated with a `CHARACTER` (and optionally a `CHAT_SESSION`), including semantic vector/tokens and importance metadata.

```mermaid
erDiagram
    USER_PERSONA ||--o{ CHAT_SESSION : "participates_as"
    CHARACTER ||--o{ CHAT_SESSION : "has_sessions"
    CHARACTER ||--o{ CHARACTER_MEMORY : "remembers"
    CHAT_SESSION ||--o{ CHAT_MESSAGE : "contains"
    CHAT_MESSAGE ||--|{ MESSAGE_VARIANT : "has_swipes"
    CHAT_SESSION ||--o{ CHARACTER_MEMORY : "generates"

    USER_PERSONA {
        string id PK "Unique Persona ID"
        string name "Display name in roleplay"
        string avatar "Avatar URL or emoji/initials"
        string description "Persona background, appearance & traits"
        boolean isDefault "Whether active by default in chats"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }

    CHARACTER {
        string id PK "Unique Character ID"
        string name "Character full name"
        string tagline "Short C.AI card subtitle"
        string avatar "Character portrait URL"
        string greeting "Opening message when starting a chat"
        string personality "Psychological profile & traits"
        string appearance "Physical description & attire"
        string abilities "Powers, skills & capabilities"
        string background "Backstory & lore"
        string speaking_style "Tone, catchphrases & speech patterns"
        string example_dialogues "Sample exchanges for style anchoring"
        string initial_memory "Core canonical memories"
        string systemPrompt "Compiled base system instruction"
        string wiki "Source Fandom/Wikipedia URL"
        string[] categories "Tags e.g. Anime, Roleplay, Helper"
        string creator "Creator handle"
        int interactions "Total message interactions count"
        int likes "Total user likes"
        boolean isLiked "Current user like status"
        datetime createdAt "Creation timestamp"
        datetime updatedAt "Last update timestamp"
    }

    CHAT_SESSION {
        string id PK "Unique Session ID"
        string characterId FK "References CHARACTER.id"
        string personaId FK "References USER_PERSONA.id"
        string title "Session title or storyline label"
        string provider "Preferred AI provider (gemini / ollama)"
        datetime createdAt "Session start time"
        datetime updatedAt "Last message timestamp"
    }

    CHAT_MESSAGE {
        string id PK "Unique Message ID"
        string sessionId FK "References CHAT_SESSION.id"
        string role "Sender role: user | model | system"
        string content "Active canonical text content"
        int selectedVariantIndex "Index of active MESSAGE_VARIANT"
        boolean isPinned "Pinned to context memory"
        int rating "User rating (0-4 stars)"
        datetime createdAt "Message creation timestamp"
    }

    MESSAGE_VARIANT {
        string id PK "Variant ID"
        string messageId FK "References CHAT_MESSAGE.id"
        string text "Generated response text"
        datetime createdAt "Generation timestamp"
    }

    CHARACTER_MEMORY {
        string id PK "Unique Memory ID"
        string characterId FK "References CHARACTER.id"
        string sessionId FK "Optional source CHAT_SESSION.id"
        string content "Declarative fact or episodic memory"
        string source "conversation | manual | wiki"
        float[] embedding "Optional dense vector or token weights"
        datetime createdAt "Memory creation timestamp"
    }
```

---

## 3. Data Flow Diagrams (DFD)

### 3.1 DFD Level 0 — Context Diagram

The Context Diagram shows **My C.AI Universe** as a single system interacting with external entities: the **User**, **Fandom / Wikipedia**, and **AI Providers (Google Gemini / Ollama)**.

```mermaid
flowchart LR
    User(["👤 User (Roleplayer / Creator)"])
    System(("🌟 0.0\nMy C.AI Universe\nSystem"))
    Wiki(["🌐 Fandom / Wikipedia\nExternal Wiki"])
    LLM(["🤖 AI Providers\n(Google Gemini / Ollama)"])

    User -->|"Character specs, Wiki URL,\nChat messages, Swipes, Personas"| System
    System -->|"Character profiles, Roleplay replies,\nVariants, Audio TTS, Memory state"| User

    System -->|"HTTP GET Wiki HTML"| Wiki
    Wiki -->|"Raw Article HTML & Infobox"| System

    System -->|"Compiled Character Prompt +\nMemory Context + History"| LLM
    LLM -->|"Extracted JSON Profile /\nIn-Character Roleplay Response"| System
```

---

### 3.2 DFD Level 1 — Core System Processes

DFD Level 1 decomposes the system into **5 major processes** and **4 data stores**:

- **Process 1.0**: Character Management & Wiki Ingestion
- **Process 2.0**: Chat Session & Conversation Management
- **Process 3.0**: AI Roleplay Generation, Regeneration & Continuation
- **Process 4.0**: Long-Term Semantic Memory Management
- **Process 5.0**: User Persona Management

```mermaid
flowchart TB
    User(["👤 User"])
    Wiki(["🌐 Fandom / Wikipedia"])
    LLM(["🤖 Gemini / Ollama"])

    P1(("1.0\nCharacter\nManagement &\nWiki Ingestion"))
    P2(("2.0\nChat Session &\nConversation\nManagement"))
    P3(("3.0\nAI Roleplay\nGeneration &\nVariants"))
    P4(("4.0\nLong-Term\nSemantic Memory\nEngine"))
    P5(("5.0\nUser Persona\nManagement"))

    D1[("D1: characters.json")]
    D2[("D2: chats.json")]
    D3[("D3: memories.json")]
    D4[("D4: personas.json")]

    %% Process 1.0 flows
    User -->|"Create / Edit / Search / Like\nCharacter or Wiki URL"| P1
    P1 -->|"Fetch HTML"| Wiki
    Wiki -->|"Article DOM + Avatar"| P1
    P1 <-->|"Extract Structured Lore JSON"| LLM
    P1 <-->|"Read / Write Character"| D1
    P1 -->|"Seed Initial Memories"| P4
    P1 -->|"Character List & Profile"| User

    %% Process 5.0 flows
    User -->|"Create / Update / Select Persona"| P5
    P5 <-->|"Read / Write Personas"| D4
    P5 -->|"Active Persona Profile"| User

    %% Process 2.0 flows
    User -->|"Start Chat, Edit/Pin/Rewind Msg,\n/update Command"| P2
    P2 <-->|"Load / Save Sessions & Messages"| D2
    P2 <-->|"Load Character / Apply /update"| D1
    P2 -->|"Updated Chat State"| User

    %% Process 3.0 flows
    User -->|"Send Message / Swipe Variant /\nEmpty-Enter Continue"| P3
    D1 -->|"Character System Prompt & Lore"| P3
    D2 -->|"Recent History & Pinned Msgs"| P3
    D4 -->|"Active User Persona"| P3
    P3 -->|"Query Relevant Memories"| P4
    P4 -->|"Top-K Relevant Memories"| P3
    P3 <-->|"Roleplay Prompt / Response"| LLM
    P3 -->|"Save New Message or Variant"| D2
    P3 -->|"Analyze Turn for New Facts"| P4
    P3 -->|"Formatted Reply & Variants"| User

    %% Process 4.0 flows
    User -->|"Add / View / Delete Memories"| P4
    P4 <-->|"Read / Write Memories"| D3
```

---

### 3.3 DFD Level 2 — Detailed Decomposition of Core Processes

#### 3.3.1 DFD Level 2: Process 1.0 (Character Creation & Wiki Extraction)

```mermaid
flowchart LR
    User(["👤 User"])
    Wiki(["🌐 Fandom / Wikipedia"])
    Gemini(["🤖 Gemini API"])
    D1[("D1: characters.json")]
    D3[("D3: memories.json")]

    P1_1(("1.1\nValidate Input &\nDomain Whitelist"))
    P1_2(("1.2\nScrape HTML &\nExtract Infobox Avatar"))
    P1_3(("1.3\nExtract Structured\nCharacter JSON"))
    P1_4(("1.4\nCompile System Prompt\n& Opening Greeting"))
    P1_5(("1.5\nPersist Character &\nInitial Memories"))

    User -->|"Name, Personality, Wiki URL"| P1_1
    P1_1 -->|"Validated Wiki URL"| P1_2
    P1_2 -->|"GET Request"| Wiki
    Wiki -->|"HTML Document"| P1_2
    P1_2 -->|"Cleaned Article Text +\nAvatar URL"| P1_3
    P1_3 <-->|"Prompt -> JSON Schema"| Gemini
    P1_3 -->|"Appearance, Personality,\nAbilities, Background, Style"| P1_4
    P1_1 -->|"Manual Fields"| P1_4
    P1_4 -->|"Complete Character Record"| P1_5
    P1_5 -->|"Save Character"| D1
    P1_5 -->|"Save Initial Memories"| D3
    P1_5 -->|"Created Character JSON"| User
```

#### 3.3.2 DFD Level 2: Process 3.0 & 4.0 (Chat Turn, Memory Retrieval, Variants & Continuation)

```mermaid
flowchart TB
    User(["👤 User"])
    LLM(["🤖 Gemini / Ollama"])
    D1[("D1: characters.json")]
    D2[("D2: chats.json")]
    D3[("D3: memories.json")]
    D4[("D4: personas.json")]

    P3_1(("3.1\nClassify Request\n(Chat / Swipe /\nContinue / Command)"))
    P3_2(("3.2\nRetrieve Semantic\n& Pinned Memories"))
    P3_3(("3.3\nAssemble Full\nRoleplay Prompt"))
    P3_4(("3.4\nDispatch to AI\nProvider Queue"))
    P3_5(("3.5\nPersist Turn /\nVariant & Metrics"))
    P4_1(("4.1\nExtract & Store\nNew Memories"))

    User -->|"Message / Regenerate / Continue"| P3_1
    P3_1 -->|"/update field: val"| D1
    P3_1 -->|"User Query + charId"| P3_2
    D3 -->|"Character Memories"| P3_2
    D2 -->|"Pinned Messages"| P3_2
    P3_2 -->|"Top-K Memories + Pins"| P3_3
    D1 -->|"Character Profile"| P3_3
    D2 -->|"Last 20 Messages"| P3_3
    D4 -->|"Active User Persona"| P3_3
    P3_3 -->|"Structured Prompt Payload"| P3_4
    P3_4 <-->|"Generate Content"| LLM
    P3_4 -->|"AI Reply Text"| P3_5
    P3_5 -->|"Update Session & Variants"| D2
    P3_5 -->|"Increment Interactions"| D1
    P3_5 -->|"User Msg + AI Reply"| P4_1
    P4_1 -->|"Store Fact + Vector/Tokens"| D3
    P3_5 -->|"JSON Response (reply, session, variants)"| User
```

---

## 4. REST API Contract Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server health, active AI provider, and database counts |
| `GET` | `/api/characters` | List characters (supports `?search=`, `?category=`, `?sort=`) |
| `GET` | `/api/character/:id` | Get character details by ID |
| `POST` | `/api/character` | Create character (manual or with `wiki` auto-scraping) |
| `PUT` | `/api/character/:id` | Update character profile fields and recompile system prompt |
| `DELETE` | `/api/character/:id` | Delete a character and its associated sessions/memories |
| `POST` | `/api/character/:id/like` | Toggle like on a character |
| `POST` | `/api/character/parse-wiki` | Preview extracted character data & avatar from a Wiki URL |
| `POST` | `/api/character/generate` | AI-generate character profile fields from a short concept |
| `GET` | `/api/chats` | List all chat sessions (optionally filtered by `?characterId=`) |
| `POST` | `/api/chats` | Create a new chat session with character greeting |
| `GET` | `/api/chats/:sessionId` | Get full chat session including messages and variants |
| `DELETE` | `/api/chats/:sessionId` | Delete a chat session |
| `POST` | `/api/chat` | Send message, regenerate variant (`regenerate: true`), or continue (`continue: true`) |
| `PUT` | `/api/chats/:sessionId/messages/:messageId` | Edit a message, select a variant index, pin/unpin, or rate |
| `POST` | `/api/chats/:sessionId/rewind` | Rewind conversation to a specific message ID (deletes subsequent turns) |
| `GET` | `/api/memories` | Get long-term memories (`?characterId=`) |
| `POST` | `/api/memories` | Manually add a long-term memory for a character |
| `DELETE` | `/api/memories/:id` | Delete a specific memory |
| `GET` | `/api/personas` | List user personas |
| `POST` | `/api/personas` | Create a user persona |
| `PUT` | `/api/personas/:id` | Update or set default user persona |
| `DELETE` | `/api/personas/:id` | Delete a user persona |
