# 📈 Project Progress & Architecture Log — My C.AI Universe

> **Current Version:** `v2.3.0`  
> **Status:** Production-Ready & Tested  
> **Automated Test Coverage:** 21/21 E2E tests passing (`npm test`)  
> **Primary Database:** Turso Cloud (LibSQL `@libsql/client`, AWS Tokyo `ap-northeast-1`)  
> **Primary AI Engine:** Google Gemini (`gemini-3.5-flash-lite`) with `BLOCK_NONE` creative roleplay configuration  
> **Last Updated:** October 2026

---

## 📌 Executive Summary

**My C.AI Universe** is a full-stack, object-oriented Character.AI (`c.ai`) web application. It features relational SQL persistence, swipeable response takes, scene continuation, inline turn editing, message rewinding, context pinning, multi-persona user profiles, and hybrid long-term character memory.

This document serves as the **single source of truth** for project history, recent milestones, architectural decisions, solved issues, and roadmap items so that any developer or AI coding agent can immediately get up to speed.

---

## 🚀 Version History & Milestones

### 🏷️ `v2.3.1` (Current) — Public Open-Source Hardening & Security Audit
- **Authentication & Secret Hardening**:
  - Wired `JWT_SECRET` through central `config` and added strict validation in `validateEnvironment()` to warn against insecure fallbacks in production (`NODE_ENV === 'production'`).
  - Updated `.env.example` with clear `JWT_SECRET` instructions for cloners and self-hosters.
- **Open-Source Licensing**:
  - Added official `LICENSE` file (MIT License, Copyright 2026 Kazuken).
- **Git History & Deployment Audit**:
  - Audited commit diffs and verified zero leaks of live `GEMINI_API_KEY` or `TURSO_AUTH_TOKEN`.
  - Passing 21/21 E2E automated test suite.

### 🏷️ `v2.3.0` — Performance, Continuity & Reliability
- **Instant Message Variant Swiping (`<-` / `->`)**:
  - Converted swipe buttons from blocking network awaits to **0ms instantaneous in-place DOM updates**.
  - Implemented debounced background synchronization (`queueVariantSync`, 250ms) to update `chat_messages.selected_variant_index` in Turso without freezing the UI.
- **High-Performance Targeted SQL Message Updates**:
  - Created `ChatSessionRepository.updateMessageFields(sessionId, messageId, fields)`.
  - Replaced legacy destructive `DELETE FROM chat_messages` (which previously deleted all messages and cascade-deleted all variants on every take switch) with a single 1ms parameterized `UPDATE` statement.
  - Optimized `ChatSessionRepository.save()` to use safe `INSERT ... ON CONFLICT(id) DO UPDATE` upserts.
- **Scene Continuation Context Repair**:
  - Fixed context loss where clicking *Continue* or regenerating continuation takes caused characters to re-reply to older user messages.
  - Implemented `[Scene Continuation Directive]` and `[Scene Continuation - Alternative Take Directive]` to instruct Gemini that the user remains quiet/silent, ensuring natural forward story progression.
  - Preserved the character's anchor turn in the conversation memory slice instead of stripping it.
- **Gemini Safety Filter Configuration**:
  - Configured `safetySettings` with `BLOCK_NONE` across all categories in `GeminiProvider` to prevent false-positive `PROHIBITED_CONTENT` blocks on harmless roleplay dialogue.
  - Sanitized `AIOrchestrator.#buildInCharacterFallback()` to ensure system directives are never echoed into character speech if a fallback occurs.
- **Automated Verification**:
  - Added test step `7b` in `tests/api.test.js` validating targeted message updates and variant index persistence.

### 🏷️ `v2.2.0` — Turso Cloud libSQL & Cloud Media Storage
- **Turso Cloud Persistence**:
  - Migrated local SQLite to shared cloud database via Turso LibSQL (`@libsql/client`).
  - Added transaction rollback wrappers and automatic schema initialization scripts.
- **Cloud Media Assets**:
  - Stored user-uploaded character avatars and profile pictures with fallback URLs.
  - Automated sync scripts: `migrate-to-turso.js`, `migrate-media-assets.js`.
- **Multi-Tenant Authentication**:
  - User registration, timing-safe scrypt password hashing, JWT sessions, and Google OAuth 2.0 social login.
  - Multi-tenant data isolation per user.

### 🏷️ `v2.1.0` — Object-Oriented Programming (OOP) & Relational SQL
- **OOP Domain Model Hierarchy**:
  - `BaseEntity` $\rightarrow$ `Character`, `UserPersona`, `ChatSession`, `ChatMessage`, `MessageVariant`, `CharacterMemory`.
- **Repository Pattern**:
  - `BaseRepository` $\rightarrow$ `CharacterRepository`, `ChatSessionRepository`, `PersonaRepository`, `MemoryRepository`.
- **Strategy Pattern for AI**:
  - `BaseAIProvider` $\rightarrow$ `GeminiProvider`, `OllamaProvider` managed by `AIOrchestrator`.

### 🏷️ `v2.0.0` — Core Roleplay Features
- Character web scraping & Fandom/Wikipedia lore parser.
- Light-novel formatting (*italic narration* and `Name: "Dialogue"`).
- Multi-take variant synthesis and regeneration.
- Pinned messages and long-term memory retrieval.

---

## 🏛️ System Architecture Cheat Sheet

### 1. Database Schema (6 Relational Tables)
| Table | Description | Key Relationships |
|---|---|---|
| `users` | User accounts & credentials | PK: `id`, unique `username`, `email` |
| `characters` | Roleplay characters & lore | FK to creator; CASCADE to sessions, memories |
| `user_personas` | User display personas | PK: `id`, FK: `user_id` |
| `chat_sessions` | Conversation sessions | FK: `character_id`, `persona_id`, `user_id` |
| `chat_messages` | Individual turns (user/model) | FK: `session_id` (CASCADE) |
| `message_variants` | Swiped takes / alternative text | FK: `message_id` (CASCADE) |
| `character_memories` | Long-term episodic memory | FK: `character_id`, `session_id` |

### 2. Fast Mutation vs Full Sync
- **Single message changes** (swiping takes, inline editing, pinning, rating):  
  👉 **Always use** `ChatSessionRepository.updateMessageFields(sessionId, messageId, fields)`.  
  *Never invoke `save(session)` for simple take swiping or message property edits.*
- **Full session updates** (creating a session, adding new turn, rewinding thread):  
  👉 Use `ChatSessionRepository.save(session)` (uses `ON CONFLICT` upserts).

### 3. AI Generation Conventions
- **System Prompts**: Built polymorphically via `BaseAIProvider.buildSystemPrompt(character, options)`.
- **Turn Alternation**: Gemini multiturn requires alternating `user` and `model` roles.
- **Scene Continuations**: Keep preceding model turn in memory; pass strict non-speaking user directive to prevent repetitive dialogue.
- **Directives & Fallbacks**: Directives must never be exposed to users; `#buildInCharacterFallback()` must handle directive inputs with natural in-character pauses.

---

## 🧪 Verification & Health Check

Run the full automated E2E test suite:
```bash
npm test
```
The test suite validates:
1. Health check & database connection
2. Character discovery & filtering
3. Character creation with lore compilation
4. In-chat `/update` commands
5. Fast message updates & variant switching (`7b`)
6. Long-term memory CRUD
7. Rate limiting & security headers (`X-Frame-Options: DENY`, `nosniff`)
8. SSRF protection against loopback/subdomain attacks
9. Input boundaries & payload validation
10. Multi-tenant user auth & profile editing
11. Static storage & avatar uploads

---

## ⚙️ Mandatory Agent Workflow Rule

For any task performed in this project:
1. **Push to GitHub**: Always commit and execute `git push origin main`.
2. **Update PROGRESS.md**: Record newly delivered fixes, architectural milestones, and solved issues.
3. **Update Graphify**: Run `graphify update .` to keep knowledge graph current.
4. **Pass All Tests**: Verify zero regressions via `npm test` (21/21 passing).

---

## 📋 Ongoing Backlog & Next Steps

- [ ] **Voice / Audio TTS**: Expand browser Web Speech API with optional high-fidelity server-side neural TTS (e.g. Edge TTS / ElevenLabs).
- [ ] **Streaming Responses (SSE)**: Implement Server-Sent Events for progressive token streaming during character generation.
- [ ] **Export & Import Chat Threads**: Provide JSON and Markdown export options for completed storylines.
- [ ] **Vector Database Support**: Optional integration with ChromaDB or pgvector for semantic memory scaling beyond SQL keyword retrieval.
