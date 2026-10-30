# 🛡️ Repository Audit & Verification History

This file is the **persistent, cross-session audit ledger** for **My C.AI Universe**.

Its purpose is to prevent AI coding and auditing agents from getting trapped in speculative re-auditing loops, reward-driven overproduction of false positives, or re-litigating previously verified design decisions.

---

## ⚖️ Governance Rules for Coding & Auditing Agents

1. **Read Before Auditing**: Every agent conducting a security review, bug hunt, architectural audit, or quality evaluation **must** inspect this ledger first.
2. **Accountability to Evidence**:
   - **Resolved Issues**: Do not reopen a resolved finding unless you demonstrate a new regression (via a failing test or concrete trace introduced by a subsequent commit).
   - **Dismissed Hypotheses / Intentional Invariants**: Do not re-flag a dismissed hypothesis or intentional architectural invariant unless you provide new, reachable proof of an exploit or failure that invalidates the recorded rationale.
   - **New Findings**: Discovering a genuine defect missed by an earlier audit is completely valid, provided it passes the **Evidence-Based Audit Protocol** (reproducible failure or complete source-to-sink attack path).
3. **Zero Verified Findings is a Valid Success State**: If all in-scope checks and tests pass and no demonstrable defects exist, record a clean sign-off (`0 confirmed findings`) and **stop**.

---

## 📜 Audit & Verification Ledger

| Date | Inspected Commit / Scope | Auditor / Harness | Executed Verification | Confirmed Actionable Findings | Outcome & Sign-Off |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **2026-10-27** | `84f39dfb` (local `133d7e48`) — Full repository (137 runtime files, SQL schema, Express API, Vanilla & Next.js UIs, Python memory service, CI/CD) | Production Audit (`docs/audits/2026-10-27/REPORT.md`) | 9 isolated reproduction probes (`verify-findings.mjs`, `verify-schema.py`) + source trace review | **A01–A22** (2 P0, 14 P1, 6 P2) | Baseline audit recorded; handed off for staged batch remediation |
| **2026-10-27** | Batch 1 Remediation (`A01`, `A02`, partial `A09`/`A11`) | Engineering Agent (`docs/audits/2026-10-27/BATCH1.md`) | `38/38` backend test files (`21` new privacy, migration & queue regression cases), `131/131` syntax checks | `0` regressions in remediated scope | **A01** & **A02** closed and verified |
| **2026-10-28** | Phase 1 Chat Turn-State & Integrity (`A04`, `A05`, `A06`, `A07`) | Engineering Agent (`docs/phase1-chat-implementation.md`) | `40/40` backend test files (`17` new Phase 1 state checks), `14/14` Next.js unit tests, `137/137` syntax checks | `0` regressions in remediated scope | **A04**, **A05**, **A06**, **A07** closed in core chat turn lifecycle |
| **2026-10-29** | Appraisal Grounding Boundary & Empirical Model Screen (`gemini-3.5-flash-lite` vs `gemini-3.1-flash-lite`) | Empirical Evaluator (`PROGRESS.md`, `docs/response-quality-tuning.md`) | `42/42` backend test files + `4` isolated 8-turn live runs (`32/32` replies, `0` HTTP errors, SHA-256 source manifest) | Upstream appraisal quote boundary fixed; stochastic generation grounding limits documented | Bounded comparison complete; halted further prompt churn |
| **2026-10-29** | Terminology Alignment (`Threads` -> `Chats`) & Character Session Deduplication (`5f7d2121`) | Engineering Agent (`PROGRESS.md`) | `42/42` backend test files (`0` failures) + `14/14` Next.js unit tests (`0` failures) | `0` confirmed defects during initial pass | Released (`5f7d2121`) |
| **2026-10-30** | `b1a95508` (`84f39dfb..b1a9550` window: Batch 1, Phase 1, Eval Harness, Deduplication, EBAP Tooling) | Independent Clean-Room EBAP Auditor + TDD Remediation | `42/42` backend test files, `16/16` Next.js unit tests, `tsc --noEmit` (`0` errors), `143/143` syntax checks (`0` failures) | `0` new security vulnerabilities; **3** functional/tooling bugs confirmed (`EBAP-01`, `EBAP-02`, `EBAP-03`) & remediated with Red-Green TDD | **EBAP-01**, **EBAP-02**, **EBAP-03** closed; scope verified clean |
| **2026-10-30** | Cloudflare R2 Media Storage Integration (`A15`) | Engineering Agent | `43/43` backend test files, `16/16` Next.js unit tests, `144/144` syntax checks | `0` regressions; **A15** storage durability closed | **A15** resolved and verified |

---

## ✅ Resolved Findings Registry (Do Not Reopen Without Regression Proof)

| ID | Original Mechanism | Resolution Summary | Verification & Regression Tests |
| :--- | :--- | :--- | :--- |
| **A01** | `ON DELETE SET NULL` on `character_memories.session_id` promoted private conversation memories to public lore upon session/account deletion. | Added explicit `visibility` (`global`, `session`, `quarantined`), cascading deletion triggers on session/user/character removal, transactional migration quarantining ambiguous legacy `NULL`-session rows, and SQL ownership validation of cached Python memory IDs. | `tests/batch1-memory-privacy.test.mjs`, `tests/batch1-memory-migration.test.mjs` (`16` focused cases) |
| **A02** | Malformed non-string `provider` reached `.toLowerCase()` outside the `try` block in `backend/ai/index.js`, permanently stalling `isProcessing` in the shared AI queue. | Validated `provider` type and enum at HTTP controller and orchestrator boundaries (`400 Bad Request`); guaranteed queue item settlement and `isProcessing` reset inside `finally`. | `tests/batch1-ai-queue.test.mjs` (`6` focused cases) |
| **A04** | Editing a message updated `chat_messages.content` via `updateMessageFields()` without updating the active `message_variants` row, causing reloads and summaries to revert to stale wording. | Synchronized active variant persistence with denormalized message content during edits and variant mutations. | `tests/phase1-turn-state.test.mjs` |
| **A05** | Concurrent session mutations used array-length variant IDs (`_vN`) and unversioned snapshots, risking variant overwrite or deleted-session resurrection. | Introduced revisioned turn commits (`claimRevision` / `prepareNarrativeState` returning `409 Conflict`) and collision-safe variant identifiers. | `tests/phase1-turn-state.test.mjs` |
| **A06** | Greeting-initialized chats started at 1 message and added 2 per turn (odd totals), never hitting the even-number `24` / multiple-of-`12` rolling summary trigger. | Replaced total-count parity check with checkpointed eligible message accumulation so both greeting and non-greeting sessions trigger summaries reliably. | `tests/phase1-turn-state.test.mjs` |
| **A07** | Interrupted SSE streams resolved cleanly on premature EOF without a terminal `done` event, and Next.js automatically re-POSTed on stream failure. | Enforced explicit terminal stream completion, prevented partial turn commits on interrupted generation, and removed automatic duplicate POST replay in `nextjs-frontend`. | `tests/phase1-turn-state.test.mjs`, `nextjs-frontend/tests/unit/core.test.mjs` |
| **Appraisal-01** | `validateAppraisal` checked quote substring presence but allowed paraphrased `reason`/`memory`/`scene` fields (e.g., turning `"I need to get going"` into a completed `"leaves"` action). | Restricted persisted appraisal reason and memory content to retain the verbatim user statement; required scene fields to appear in the evidence quote. | `tests/response-variety.test.mjs`, `tests/response-eval.test.mjs` |
| **EBAP-01** | `SavedChatsList` (`nextjs-frontend/components/chat/saved-chats-list.tsx`) stored already-deduplicated sessions in React state and filtered on delete, hiding remaining secondary chats for that character until a manual reload. | Retained `rawSessions` in component state, removed deleted session via `removeSessionById`, and derived `deduplicateSessionsByCharacter(rawSessions)` via `useMemo`. | `nextjs-frontend/tests/unit/core.test.mjs` (`EBAP-01`) |
| **EBAP-02** | Next.js `AI_PROVIDERS` exposed `'claude'` and `'groq'` options that failed `A02`'s strict `normalizeProviderName` (`400 Bad Request`), and resuming a legacy session with an unsupported stored `session.provider` threw `400` even when `req.body.provider` was omitted. | Aligned Next.js `AI_PROVIDERS` with `['gemini', 'ollama']`, sanitized session hydration via `resolveSupportedProvider`, and added `resolveStoredProviderName` fallback in `ChatController.sendChatMessage` while keeping explicit `req.body.provider` validation strict (`400`). | `nextjs-frontend/tests/unit/core.test.mjs`, `tests/batch1-ai-queue.test.mjs` (`EBAP-02`) |
| **EBAP-03** | `scripts/check-syntax.js` (`npm run check`) recursively traversed gitignored `scripts/eval/results/` scratch output directories, causing `npm run check` to fail (`exitCode = 1`) on retained evaluation debug artifacts. | Excluded `scripts/eval/results` inside `collectSyntaxFiles()` in `scripts/check-syntax.js`. | `tests/ci-runner.test.js` (`EBAP-03`) |
| **A15** | Avatar uploads on ephemeral cloud hosts (Render/Vercel) were at risk of disappearing after container restarts if local disk or SQL base64 storage failed. | Integrated Cloudflare R2 cloud object storage (`backend/services/r2.service.js`) via `@aws-sdk/client-s3` with 3-tier fallback (disk cache -> R2 bucket -> Turso SQL backup). | `tests/storage-service.test.mjs` (`4` focused cases) |

---

## 🚫 Dismissed Hypotheses & Intentional Architectural Invariants

Do **not** report the following items as bugs or vulnerabilities unless code changes break their underlying invariants or a complete, reachable exploit path is demonstrated:

1. **Intentional `safetySettings: BLOCK_NONE` in `GeminiProvider` (`backend/ai/providers/gemini.js`)**
   - *Classification*: Intentional Architectural Invariant (not a security misconfiguration).
   - *Rationale*: Required to prevent false-positive `PROHIBITED_CONTENT` blocks during fictional creative roleplay and dramatic character conflict.
2. **Single-Row `ChatSessionRepository.updateMessageFields()` for Take Swiping & Pinning**
   - *Classification*: Intentional Performance Invariant (not an incomplete save bug).
   - *Rationale*: Swiping between existing generated variants (`<-` / `->`) must execute in ~1ms via single-row SQL update paired with 250ms debounced client sync (`queueVariantSync`), rather than invoking full-session `.save(session)`. Active variant text edits are handled atomically (see **A04**).
3. **`memory-service` Default Localhost Binding (`127.0.0.1:8000`)**
   - *Classification*: Scoped Internal Sidecar (not an unauthenticated public exposure by itself).
   - *Rationale*: As documented in the 2026-10-27 audit (**A16**), the optional Python FastAPI embedding service binds to loopback by default and is not exposed directly to public traffic. Furthermore, authoritative privacy filtering occurs in SQL (`MemoryRepository`) before any Python-returned IDs are surfaced (**A01**).
4. **Parameterized SQL Queries Across Repositories (`@libsql/client`)**
   - *Classification*: Verified Control.
   - *Rationale*: Repository queries use positional `?` bindings via `@libsql/client`. Dynamic column updates in `updateMessageFields` use an explicit hardcoded property allowlist (`selectedVariantIndex`, `selected_variant_id`, `content`, `isPinned`, `is_pinned`). Do not flag speculative SQL injection without demonstrating untrusted input reaching raw SQL string interpolation.
5. **Wiki Scraper URL Validation (`backend/services/wiki.service.js`)**
   - *Classification*: Verified Control.
   - *Rationale*: Wiki ingestion enforces protocol/host allowlisting (`*.fandom.com`, `*.wikipedia.org`) and redirect validation. Do not flag generic SSRF unless demonstrating a concrete bypass of the allowlist and redirect validator.
6. **`MemoryController.deleteMemory` `state:<sessionId>:<memoryKey>` Parsing (`backend/controllers/memory.controller.js`)**
   - *Classification*: Dismissed Hypothesis (2026-10-30 EBAP Pass).
   - *Rationale*: `DELETE /api/memories/:id` enforces `requireAuth`, `ChatSessionRepository.findById(sessionId, req.user?.id)` enforces `WHERE id = ? AND user_id = ?`, and `memoryKey` is a SHA-256 hex digest. Cross-user mutation is unreachable.
7. **`ChatSessionRepository.writeState` Clearing `source IN ('conversation', 'story_summary')` on Swipe/Edit (`invalidateEventsFrom`)**
   - *Classification*: Intentional Phase 1 Design (2026-10-30 EBAP Pass).
   - *Rationale*: Phase 1 sessions (`narrativeState.version = 1`) persist turn-attributed memories inside `session.narrativeState` and skip legacy unattributed `detectAndStoreFromTurn` rows (`chat.controller.js:91`).

---

## 📋 Open Tracked Backlog (Known Limitations — No Need to Re-Discover)

The following items from `docs/audits/2026-10-27/REPORT.md` and `PROGRESS.md` are already documented and tracked for scheduled batches. An audit should reference their existing IDs rather than reporting them as newly discovered defects:

- **Batch 2 / Integrity Follow-ups**:
  - `A03`: Statement-level network retry in `backend/db/database.js` can replay non-idempotent counter increments (e.g., character likes/chats) on ambiguous `ECONNRESET` after remote commit.
  - `A10`: Cross-character `sessionId` mismatch on `/api/chat` is now rejected (`chat.controller.js:367`); remaining `personaId` ownership fallback (`chat.controller.js:158, 389`), `MemoryController` session-character check, and UI stream request-ID binding remain tracked here.
- **Batch 3 / Failure Contracts & Timeouts**:
  - `A09` (General): Startup migration readiness rejection is implemented for the memory privacy migration; broader schema migration versioning remains tracked.
  - `A15`: Avatar upload durability reporting when both local cache and SQL asset storage fail.
  - `A17`: End-to-end request deadline budget across queue wait, response body reading, and provider fallbacks.
- **Batch 4 / Auth & Secondary Store Lifecycle**:
  - `A11` (Physical Purge): Authoritative SQL validation prevents deleted Python memories from returning (fixed in Batch 1), while physical outbox purging of the optional Python JSON store remains tracked.
  - `A12`–`A14`: Production SMTP failure handling without logging recovery codes, strict OAuth audience/app binding across all flows, and atomic OTP consumption with session-version revocation on password reset.
  - `A16`: File-level locking and unique temp files in the optional Python `memory_service.py`.
- **Batch 5 / Delivery & Tooling**:
  - `A08`: `scripts/migrate-to-turso.js` foreign-key table order (`chat_sessions` before `character_memories`) and `users.role` / `media_assets` / `visibility` coverage.
  - `A18`–`A22`: Next.js framework upgrade path, CI coverage of isolated E2E/Python tests, GitHub branch protection rulesets, Render deployment health verification, and `.gitignore` / README onboarding polish.
- **LLM Stochastic Grounding (Phase 1 Quality Gate)**:
  - As documented in `PROGRESS.md` (2026-10-29), `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` can still stochastically invent prior shared history or narrate user exit completion during live roleplay generation despite strict prompt and appraisal guards.

---

## 🧾 Template for Recording Future Audits

When concluding any future audit, append a row to the **Audit & Verification Ledger** above and, if zero new actionable defects were confirmed, use this sign-off format in your report:

```markdown
### Audit Complete — No Confirmed Findings
- **Commit Inspected**: `<git-sha>`
- **Executed Tests**: `<X>/<X>` backend test files passed, `<Y>/<Y>` frontend tests passed.
- **Reviewed Scope**: `<explicit list of modules, routes, and invariants checked>`
- **Evaluated & Dismissed Hypotheses**: `<any suspicious patterns checked and why they were proven benign or unreachable>`
- **Result**: No actionable defects were confirmed within the defined scope. No code changes were made.
- **Disclosed Limitations**: `<untested external services, live cloud state, or out-of-scope modules>`
```
