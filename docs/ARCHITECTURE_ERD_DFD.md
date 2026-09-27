# My C.AI Universe — System Architecture, OOP Class Diagram, ERD & DFD Specification

This document defines the **Object-Oriented Programming (OOP) Architecture**, **UML Class Diagram**, **Entity-Relationship Diagram (ERD)**, and **Data Flow Diagrams (DFD Level 0, Level 1, and Level 2)** for **My C.AI Universe**.

---

## 1. Object-Oriented System Architecture

**My C.AI Universe** is built on a layered **Object-Oriented Programming (OOP)** architecture applying **Inheritance**, **Encapsulation**, **Polymorphism (Strategy Pattern)**, **Repository Pattern**, **Singleton Pattern**, and **Facade Pattern**:

1. **Domain Model Layer (`backend/models/`)**:
   - `BaseEntity` (Abstract Root Class) inherited by `Character`, `UserPersona`, `ChatSession`, `ChatMessage`, `MessageVariant`, and `CharacterMemory`.
   - Encapsulates domain validation, prompt compilation, variant swiping, message pinning, and JSON/SQL serialization.

2. **Data Access / Repository Layer (`backend/repositories/` & `backend/db/`)**:
   - `DatabaseConnection` (Singleton Class) manages the native `node:sqlite` relational database (`backend/db/universe.sqlite`), DDL schema (`backend/db/schema.sql`), and seed script (`backend/db/seed.sql`).
   - `BaseRepository` (Abstract Base Class) inherited by `CharacterRepository`, `ChatSessionRepository`, `PersonaRepository`, and `MemoryRepository`.

3. **AI Provider Strategy & Service Layer (`backend/ai/` & `backend/services/`)**:
   - `BaseAIProvider` (Abstract Strategy Class) inherited by `GeminiProvider` and `OllamaProvider`, orchestrated by `AIOrchestrator`.
   - `WikiScraperService`, `SemanticMemoryService`, and `StorageService` (Facade).

4. **Controller & HTTP Server Layer (`backend/controllers/` & `server.js`)**:
   - `BaseController` (Abstract Base Class) inherited by `CharacterController`, `ChatController`, `PersonaController`, and `MemoryController`.
   - `ApplicationServer` encapsulates Express lifecycle and middleware.

5. **Frontend OOP SPA Layer (`frontend/js/`)**:
   - `CAIUniverseApp`, `ApiClient`, `CharacterManager`, `ChatRoomController`, and `PersonaManager`.

---

## 2. UML Class Diagram (OOP Structure)

```mermaid
classDiagram
    class BaseEntity {
        <<abstract>>
        +string id
        +string createdAt
        +string updatedAt
        +generateId() string
        +touch() void
        +validate() boolean
        +toJSON() Object
    }

    class Character {
        +string name
        +string tagline
        +string avatar
        +string greeting
        +string personality
        +string appearance
        +string abilities
        +string background
        +string speaking_style
        +string systemPrompt
        +string[] categories
        +int interactions
        +int likes
        +boolean isLiked
        +recompilePrompt() void
        +toggleLike() Object
        +incrementInteractions() void
        +applyFieldUpdate(field, value) string
        +fromDatabaseRow(row)$ Character
    }

    class UserPersona {
        +string name
        +string avatar
        +string description
        +boolean isDefault
        +activate() void
        +deactivate() void
        +fromDatabaseRow(row)$ UserPersona
    }

    class ChatSession {
        +string characterId
        +string personaId
        +string title
        +string provider
        +ChatMessage[] messages
        +addMessage(msg) ChatMessage
        +getPinnedMessages() ChatMessage[]
        +rewindToMessage(id) boolean
        +fromDatabaseRow(row, msgs)$ ChatSession
    }

    class ChatMessage {
        +string sessionId
        +string role
        +string content
        +int selectedVariantIndex
        +boolean isPinned
        +int rating
        +MessageVariant[] variants
        +addVariant(text) MessageVariant
        +selectVariant(index) void
        +updateContent(text) void
    }

    class MessageVariant {
        +string messageId
        +int variantIndex
        +string text
    }

    class CharacterMemory {
        +string characterId
        +string sessionId
        +string content
        +string source
    }

    BaseEntity <|-- Character
    BaseEntity <|-- UserPersona
    BaseEntity <|-- ChatSession
    BaseEntity <|-- ChatMessage
    BaseEntity <|-- MessageVariant
    BaseEntity <|-- CharacterMemory
    ChatSession "1" *-- "many" ChatMessage : aggregates
    ChatMessage "1" *-- "1..*" MessageVariant : composes

    class BaseRepository {
        <<abstract>>
        +string tableName
        +count() int
        +deleteById(id) boolean
        +runInTransaction(fn) any
    }

    class CharacterRepository {
        +findAll() Character[]
        +findAllFiltered(params) Character[]
        +findById(id) Character
        +save(character) Character
    }

    class ChatSessionRepository {
        +findAll(characterId) ChatSession[]
        +findById(sessionId) ChatSession
        +save(session) ChatSession
    }

    class PersonaRepository {
        +findAll() UserPersona[]
        +findDefault() UserPersona
        +save(persona) UserPersona
    }

    class MemoryRepository {
        +findAll(characterId) CharacterMemory[]
        +save(memory) CharacterMemory
    }

    BaseRepository <|-- CharacterRepository
    BaseRepository <|-- ChatSessionRepository
    BaseRepository <|-- PersonaRepository
    BaseRepository <|-- MemoryRepository

    class BaseAIProvider {
        <<abstract>>
        +string providerName
        +buildSystemPrompt(char, opts) string
        +generateReply(char, msg, mem, opts)* Promise~string~
    }

    class GeminiProvider {
        +generateReply(char, msg, mem, opts) Promise~string~
        +generateCharacterProfile(concept) Promise~Object~
    }

    class OllamaProvider {
        +generateReply(char, msg, mem, opts) Promise~string~
    }

    BaseAIProvider <|-- GeminiProvider
    BaseAIProvider <|-- OllamaProvider

    class BaseController {
        <<abstract>>
        +sendJson(res, payload, code) Response
        +handleError(res, error, msg) Response
    }

    BaseController <|-- CharacterController
    BaseController <|-- ChatController
    BaseController <|-- PersonaController
    BaseController <|-- MemoryController
```

---

## 3. Entity-Relationship Diagram (ERD — Relational SQL Database)

The relational SQL schema ([`backend/db/schema.sql`](../backend/db/schema.sql) and [`backend/db/create_database.sql`](../backend/db/create_database.sql)) consists of 6 normalized tables stored in `backend/db/universe.sqlite`:

```mermaid
erDiagram
    USER_PERSONA ||--o{ CHAT_SESSION : "participates_as"
    CHARACTER ||--o{ CHAT_SESSION : "has_sessions"
    CHARACTER ||--o{ CHARACTER_MEMORY : "remembers"
    CHAT_SESSION ||--o{ CHAT_MESSAGE : "contains"
    CHAT_MESSAGE ||--|{ MESSAGE_VARIANT : "has_swipes"
    CHAT_SESSION ||--o{ CHARACTER_MEMORY : "generates"

    USER_PERSONA {
        string id PK "Primary Key"
        string name "Display name in roleplay"
        string avatar "Avatar emoji or URL"
        string description "Persona background & traits"
        int is_default "1 if active default, 0 otherwise"
        string created_at "ISO timestamp"
        string updated_at "ISO timestamp"
    }

    CHARACTER {
        string id PK "Primary Key"
        string name "Character full name"
        string tagline "Short C.AI card subtitle"
        string avatar "Character portrait URL"
        string greeting "Opening message in new chats"
        string personality "Psychological profile & traits"
        string appearance "Physical description & attire"
        string abilities "Powers, skills & capabilities"
        string background "Backstory & lore"
        string speaking_style "Tone & speech patterns"
        string example_dialogues "Sample exchanges"
        string initial_memory "Core canonical memories"
        string system_prompt "Compiled base system instruction"
        string wiki "Source Fandom/Wikipedia URL"
        string categories_json "JSON array of category tags"
        string creator "Creator handle"
        int interactions "Total message interactions count"
        int likes "Total user likes"
        int is_liked "1 if liked by user"
        string created_at "ISO timestamp"
        string updated_at "ISO timestamp"
    }

    CHAT_SESSION {
        string id PK "Primary Key"
        string character_id FK "REFERENCES characters(id) ON DELETE CASCADE"
        string persona_id FK "REFERENCES user_personas(id) ON DELETE SET NULL"
        string title "Session title"
        string provider "gemini | ollama"
        string created_at "ISO timestamp"
        string updated_at "ISO timestamp"
    }

    CHAT_MESSAGE {
        string id PK "Primary Key"
        string session_id FK "REFERENCES chat_sessions(id) ON DELETE CASCADE"
        string role "user | model | system"
        string content "Active canonical text content"
        int selected_variant_index "Active variant index"
        int is_pinned "1 if pinned to memory"
        int rating "User rating (0-4 stars)"
        int position "Turn order inside session"
        string created_at "ISO timestamp"
    }

    MESSAGE_VARIANT {
        string id PK "Primary Key"
        string message_id FK "REFERENCES chat_messages(id) ON DELETE CASCADE"
        int variant_index "0-based swipe index"
        string text "Generated response text"
        string created_at "ISO timestamp"
    }

    CHARACTER_MEMORY {
        string id PK "Primary Key"
        string character_id FK "REFERENCES characters(id) ON DELETE CASCADE"
        string session_id FK "REFERENCES chat_sessions(id) ON DELETE SET NULL"
        string content "Declarative fact or episodic memory"
        string source "conversation | manual | wiki"
        string created_at "ISO timestamp"
    }
```

---

## 4. Data Flow Diagrams (DFD)

### 4.1 DFD Level 0 — Context Diagram

```mermaid
flowchart LR
    User(["👤 User (Roleplayer / Creator)"])
    System(("🌟 0.0\nMy C.AI Universe\nOOP + SQL System"))
    Wiki(["🌐 Fandom / Wikipedia\nExternal Wiki"])
    LLM(["🤖 AI Providers\n(Google Gemini / Ollama)"])

    User -->|"Character specs, Wiki URL,\nChat messages, Swipes, Personas"| System
    System -->|"Character profiles, Roleplay replies,\nVariants, Audio TTS, Memory state"| User

    System -->|"HTTP GET Wiki HTML"| Wiki
    Wiki -->|"Raw Article HTML & Infobox"| System

    System -->|"Compiled Character Prompt +\nMemory Context + History"| LLM
    LLM -->|"Extracted JSON Profile /\nIn-Character Roleplay Response"| System
```

### 4.2 DFD Level 1 — Core System Processes

```mermaid
flowchart TB
    User(["👤 User"])
    Wiki(["🌐 Fandom / Wikipedia"])
    LLM(["🤖 Gemini / Ollama"])

    P1(("1.0\nCharacterController\n& WikiScraperService"))
    P2(("2.0\nChatController &\nSession Management"))
    P3(("3.0\nAIOrchestrator &\nProvider Strategies"))
    P4(("4.0\nSemanticMemoryService\n& MemoryController"))
    P5(("5.0\nPersonaController\n& PersonaManager"))

    D1[("SQL Table:\ncharacters")]
    D2[("SQL Tables:\nchat_sessions,\nchat_messages,\nmessage_variants")]
    D3[("SQL Table:\ncharacter_memories")]
    D4[("SQL Table:\nuser_personas")]

    User -->|"Create / Edit / Search / Like\nCharacter or Wiki URL"| P1
    P1 -->|"Fetch HTML"| Wiki
    Wiki -->|"Article DOM + Avatar"| P1
    P1 <-->|"Extract Structured Lore JSON"| LLM
    P1 <-->|"SQL SELECT / INSERT / UPDATE"| D1
    P1 -->|"Seed Initial Memories"| P4
    P1 -->|"Character List & Profile"| User

    User -->|"Create / Update / Select Persona"| P5
    P5 <-->|"SQL SELECT / UPSERT"| D4
    P5 -->|"Active Persona Profile"| User

    User -->|"Start Chat, Edit/Pin/Rewind Msg,\n/update Command"| P2
    P2 <-->|"SQL Transactions"| D2
    P2 <-->|"Load Character / Apply /update"| D1
    P2 -->|"Updated Chat State"| User

    User -->|"Send Message / Swipe Variant /\nEmpty-Enter Continue"| P3
    D1 -->|"Character System Prompt & Lore"| P3
    D2 -->|"Recent History & Pinned Msgs"| P3
    D4 -->|"Active User Persona"| P3
    P3 -->|"Query Relevant Memories"| P4
    P4 -->|"Top-K Relevant Memories"| P3
    P3 <-->|"Roleplay Prompt / Response"| LLM
    P3 -->|"INSERT New Message or Variant"| D2
    P3 -->|"Analyze Turn for New Facts"| P4
    P3 -->|"Formatted Reply & Variants"| User

    User -->|"Add / View / Delete Memories"| P4
    P4 <-->|"SQL SELECT / INSERT / DELETE"| D3
```
