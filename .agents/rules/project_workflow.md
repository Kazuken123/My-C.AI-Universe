---
trigger: always_on
description: Core workflow rules for My C.AI Universe: Git sync, PROGRESS.md updates, graphify maintenance, and test verification.
---

# 🚀 My C.AI Universe — Mandatory Project Workflow Rules

Whenever working on this codebase in any session, you **MUST ALWAYS** follow these steps before concluding any task:

---

### 1. 🔄 Always Push Changes to GitHub
- After finishing work (bug fix, new feature, UI tweak, or documentation update), stage all modified files:
  ```bash
  git add <files>
  git commit -m "<type>: <concise description>"
  git push origin main
  ```
- **Strict Rule**: Never commit `.env`, SQLite binaries (`.sqlite`), private tokens, or user-uploaded media files to Git. The database is hosted entirely on **Turso Cloud**, and GitHub must only hold application code.

---

### 2. 📈 Always Update `PROGRESS.md`
- Maintain [`PROGRESS.md`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/PROGRESS.md) as the persistent, living source of truth for the project.
- For every completed task:
  - Record the version / milestone, what changed, the root cause (if debugging), and the architectural rationale.
  - Update any status changes in the backlog or infrastructure reference.

---

### 3. 🕸️ Always Update Graphify Knowledge Graph
- After editing code files (`.js`, `.html`, `.css`), keep the AST knowledge graph up to date:
  ```bash
  graphify update .
  ```
- For architectural queries or understanding symbol relationships, consult `graphify-out/` (`graphify query "<topic>"`) before inspecting raw files.

---

### 4. 🧪 Always Verify with the Automated Test Suite
- Run the full end-to-end API & security test suite before pushing:
  ```bash
  npm test
  ```
- All 21+ automated tests must pass with exit code 0. Never push code that breaks existing tests.

---

### 5. 🏛️ Architectural & LLM Invariant Rules
- **Database Mutations**: Simple turn updates (swiping takes, editing, pinning) **must** use `ChatSessionRepository.updateMessageFields()` for 1ms single-row updates. Never invoke `.save(session)` for simple take swiping.
- **Optimistic UI**: Message variant switching (`<-` / `->`) must update the DOM in-place immediately (0ms latency) and debounce database sync (`queueVariantSync`, 250ms).
- **Gemini Safety Settings**: Always maintain `safetySettings: BLOCK_NONE` in `GeminiProvider` to prevent false-positive `PROHIBITED_CONTENT` blocks on creative roleplay.
- **Prompt Isolation**: Internal system directives (`[...]`, `[Scene Continuation Directive]`, etc.) must never be echoed or leaked in character speech or fallback handlers.
