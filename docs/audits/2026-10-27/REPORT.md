# Production audit — 27 October 2026

**Recommendation: fix the privacy and shared-queue defects before expanding real-user use.** The code has a useful structure and working CI, but several failure paths can leak retained data, lose changes, or report success when work failed.

This is a saved review and implementation handoff. No application code, repository settings, production data, or deployment was changed. Only this audit folder was created.

## Version and scope

- GitHub main reviewed: **84f39dfb7899abe802a4805e4fc9532f87afdd46**.
- Local HEAD: **133d7e484b31ec56c11db40f8df7b1950a8918e1**, with pre-existing uncommitted UI and CI work.
- Source-content hashes confirm that the backend, server, memory service, scripts, and cited Next.js chat/API/auth files used for findings match the published snapshot. Local layout/design files differ; the inventory records this.
- Inventoried 305 files, including 276 text files, excluding local agent state, QA output, ignored dependencies, and this new folder. The inventory includes 137 first-party runtime files in the principal application directories; this is an inventory count, not a coverage percentage.
- Reviewed architecture, auth and authorization, database boundaries and migrations, chat and memory lifecycles, both browser clients, operational scripts, dependencies, tests, CI, GitHub protection information, documentation, and agent instructions. Inspection was risk-focused; generated/binary assets and every visual interaction were not exhaustively examined.
- Executed isolated probes against extracted source classes and the real SQL schema in an in-memory database. **Nine issue mechanisms were reproduced (A01–A09)**; some wider consequences below are source-derived interleavings, explicitly distinguished from full integration tests.
- Did not launch the application, load real .env values, access a real database, send email, call paid AI services, install dependencies, or run production migration scripts. Did not run a full new application test/build suite; the live GitHub results below are evidence for the published commit only.
- No claim of a complete CVE inventory, absence of secrets in historical Git objects, or absence of all remaining bugs. Production configuration, database contents, backups, deployment SHA, and private security alerts remain unverified.

## Architecture and existing strengths

Express serves a vanilla browser UI and API. A separate Next.js UI proxies API requests to the backend. Controllers coordinate domain models, repositories, auth/wiki/memory/relationship services, and Gemini/Ollama providers. Persistence is SQLite/libSQL, optionally Turso. The optional Python service keeps a second memory copy in a JSON file with embeddings.

Useful controls already exist: parameterized SQL, ownership/admin checks on sensitive mutations, rejection of missing OAuth tokens, scoped memory lookups, safe avatar formats, redirect-aware wiki URL allowlisting, rate limits, isolated HTTP/SQLite tests, lockfiles, and commit-pinned GitHub Actions with read-only workflow permissions. The main architectural problem is coordination: slow AI requests, mutable chat snapshots, duplicate memory stores, and optimistic clients lack a shared consistency contract.

## Severity and evidence

- **P0 / High:** fix first; cross-user privacy or broad service availability.
- **P1 / High or Medium:** fix before wider release; serious conditional security, integrity, or reliability problems.
- **P2 / Medium or Low:** next hardening batch; maintenance and workflow gaps.
- **Reproduced** means the stated mechanism occurred in an isolated probe, not that a live exploit was performed.
- **Source verified** means the implementation and a concrete triggering sequence establish the concern; a regression test is still required.

## Findings

### A01 — Deleting a private chat or account promotes its memories to public lore
**High · P0 · Reproduced with the real schema.**

The session foreign key uses ON DELETE SET NULL. Context queries treat a null session as public character lore; the memories endpoint permits unauthenticated character-scoped reads. Deleting a session, or deleting its user and cascading the sessions, therefore makes ordinary conversation memories eligible for public retrieval. Story-summary rows are excluded from that public query, but ordinary conversation memories are not.

Evidence: [backend/db/schema.sql:128](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/db/schema.sql#L128), [backend/repositories/MemoryRepository.js:28](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/MemoryRepository.js#L28), [backend/controllers/memory.controller.js:22](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/memory.controller.js#L22), [backend/routes/memory.route.js:12](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/routes/memory.route.js#L12), [backend/controllers/chat.controller.js:186](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L186).

Probe: zero public fixture memories before deletion, one afterward, for both session and account deletion.

Fix: model visibility/ownership explicitly; private memories must never become public because a parent disappears. Use appropriate cascading deletion or retained private tombstones. Review already orphaned records before repair; null alone no longer proves that a row was intentionally public. Include the Python copy in the deletion design.

Acceptance: public requests and another user's prompts cannot retrieve private content before or after chat/account deletion. Existing intentional global lore remains intact. Test database migration and rollback on a disposable copy.

### A02 — A malformed provider can permanently stall the shared AI queue
**High · P0 · Reproduced against the exact orchestrator class.**

An authenticated request with a valid existing session and a truthy non-string provider reaches .toLowerCase() outside the queue's try block. The queue processing promise rejects without resetting isProcessing or settling the current request. Later queued requests remain pending. Streaming paths that fall back to this queue can also be affected; this is not a claim that every native stream stops.

Evidence: [backend/ai/index.js:27](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/index.js#L27), [backend/ai/index.js:53](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/index.js#L53), [backend/controllers/chat.controller.js:275](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L275), [backend/controllers/chat.controller.js:373](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L373), [backend/controllers/chat.controller.js:405](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L405).

Probe: provider={} caused an unhandled TypeError, isProcessing stayed true, and a subsequent valid request remained queued.

Fix: validate provider type and allowed values at the HTTP boundary; ensure every queue item settles and processing state resets in finally. Add queue limits and deadlines.

Acceptance: malformed requests return 400, the next valid request completes, and thrown provider errors cannot poison the worker.

### A03 — Retrying an ambiguous database write can apply it twice
**Medium · P1 · Reproduced with a fault-injected executor.**

The common statement wrapper retries network failures for reads and writes alike. A server can commit a mutation before its response is lost. Replaying an increment applies it twice; replaying a toggle can reverse it. The failure is conditional on an ambiguous remote result, not every network error.

Evidence: [backend/db/database.js:42](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/db/database.js#L42), [backend/repositories/CharacterRepository.js:160](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/CharacterRepository.js#L160), [backend/repositories/CharacterRepository.js:176](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/CharacterRepository.js#L176).

Probe: an executor applied a write and then raised ECONNRESET; the wrapper applied the operation twice.

Fix: distinguish safe reads from writes; use idempotency keys/unique operation records for replayable mutations, and explicit transaction-retry semantics.

Acceptance: loss of the response after commit cannot double a turn, counter, or other mutation.

### A04 — Message edits update content but leave the active variant stale
**Medium · P1 · Reproduced at the persistence boundary.**

The model edits both message content and the selected variant, but the controller passes only content to updateMessageFields. That repository method never writes message_variants. Reloaded clients and summary code prefer the selected variant text, so an apparently saved edit can revert or the AI can consume the old wording.

Evidence: [backend/models/ChatSession.js:103](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/models/ChatSession.js#L103), [backend/controllers/chat.controller.js:223](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L223), [backend/repositories/ChatSessionRepository.js:411](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/ChatSessionRepository.js#L411), [backend/services/memory.service.js:243](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/memory.service.js#L243).

Probe: the exact edit repository method emitted only chat_messages and chat_sessions updates, no variant update.

Fix: atomically persist the active variant and its denormalized content, or establish one canonical text source.

Acceptance: edit, reload, switch variants away and back, and generate the next turn; all use the edited text.

### A05 — Concurrent session mutations can overwrite, delete, or resurrect data
**High · P1 · Variant collision reproduced; broader races source verified.**

Two requests load session snapshots before waiting for AI. Variant IDs use the old array length, so concurrent regeneration produces identical IDs; the upsert overwrites the earlier result. Append uses snapshot-derived positions and absolute relationship values. Rewind deletes messages outside its stale list. Append also upserts the session itself, so a send that finishes after deletion can recreate that deleted session.

Evidence: [backend/models/ChatSession.js:76](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/models/ChatSession.js#L76), [backend/repositories/ChatSessionRepository.js:162](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/ChatSessionRepository.js#L162), [backend/repositories/ChatSessionRepository.js:204](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/ChatSessionRepository.js#L204), [backend/repositories/ChatSessionRepository.js:275](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/ChatSessionRepository.js#L275), [backend/repositories/ChatSessionRepository.js:337](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/ChatSessionRepository.js#L337), [backend/repositories/ChatSessionRepository.js:376](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/ChatSessionRepository.js#L376), [backend/controllers/chat.controller.js:317](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L317).

Probe: two copies of the same message generated msg_fixture_v2 with different text. The complete HTTP interleavings were not executed.

Fix: introduce session revisions and conditional mutations, collision-safe variant IDs, transactional ordering, and a deletion policy that late generation cannot bypass. In-process locks alone do not cover multiple app instances.

Acceptance: deterministic races for send/send, regenerate/regenerate, rewind/send, delete/send, and relationship-edit/send preserve data or return an explicit conflict.

### A06 — Normal greeting-based chats never reach the rolling-summary trigger
**Medium · P2 · Reproduced using the message model.**

A greeting starts the session at one message. Ordinary turns add two. The summary service only proceeds at 24 or multiples of 12, which those odd counts never reach. This undermines long-chat continuity as older history falls outside the context window.

Evidence: [backend/controllers/chat.controller.js:64](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L64), [backend/services/memory.service.js:228](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/memory.service.js#L228).

Probe: 60 ordinary turns ended at 121 messages with zero eligible summary counts.

Fix: record a last-summarized position and trigger when enough new eligible messages accumulate, without depending on total-count parity.

Acceptance: greeting and non-greeting sessions both summarize; retries do not duplicate summaries; continue/regenerate/rewind are handled deliberately.

### A07 — Stream interruption can look successful or cause a duplicate POST
**Medium · P1 · Premature EOF reproduced; recovery consequences source verified.**

Both clients resolve when the reader reaches EOF without requiring a terminal done event. Their broad parse catch also swallows callback exceptions. The server saves partial text after some generation failures; errors after headers are sent reach a JSON-oriented error handler. The Next.js client retries with an ordinary POST on stream failure without an idempotency key, even when the first request might already have committed.

Evidence: [frontend/js/api.js:275](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/frontend/js/api.js#L275), [nextjs-frontend/lib/api.ts:330](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/lib/api.ts#L330), [backend/controllers/chat.controller.js:592](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L592), [backend/controllers/chat.controller.js:618](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L618), [backend/controllers/BaseController.js:41](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/BaseController.js#L41), [nextjs-frontend/components/chat/chat-view.tsx:340](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/components/chat/chat-view.tsx#L340).

Probe: a stream containing only a partial token and EOF resolved successfully without onDone.

Fix: define explicit done/error terminal events, distinguish incomplete from saved responses, propagate callback failures, and reconcile using an operation ID before retrying. Add disconnect cancellation.

Acceptance: disconnect before generation, mid-token, during save, and after commit never silently loses or duplicates a turn.

### A08 — Cloud migration has an invalid import order and incomplete data coverage
**High · P1 · Foreign-key failure reproduced using the real schema.**

The documented db:turso:push script imports character_memories before chat_sessions even though memories reference sessions. Fresh targets with session-scoped memories fail with foreign-key enforcement. Earlier table writes are already committed. The copy list also omits users.role and media_assets, so a successful copy is not a complete restoration of the current data model.

Evidence: [scripts/migrate-to-turso.js:54](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/scripts/migrate-to-turso.js#L54), [backend/db/schema.sql:128](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/db/schema.sql#L128), [backend/db/schema.sql:140](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/db/schema.sql#L140).

Probe: inserting a session-scoped memory before its session produced FOREIGN KEY constraint failed.

Fix: correct dependency order, maintain an explicit complete schema mapping, verify counts and representative relationships/assets/roles, and provide a dry run, backup requirement, target selection, and resumable or transactional strategy.

Acceptance: a fresh populated fixture with private memories, roles, and uploads migrates completely; injected failures leave a recoverable, clearly reported state. Do not test on live Turso.

### A09 — Migration failure is logged and cached as successful initialization
**High · P1 · Reproduced against the exact database class.**

ensureReady caches the migration promise. The migration routine catches errors without rejecting, including its outer initialization failure. Later callers therefore proceed as though initialization succeeded and do not retry. An incomplete schema can persist for the lifetime of the process.

Evidence: [backend/db/database.js:184](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/db/database.js#L184), [backend/db/database.js:191](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/db/database.js#L191), [backend/db/database.js:279](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/db/database.js#L279).

Probe: forced schema failure; two ensureReady calls both resolved and only one migration attempt occurred.

Fix: fail readiness/startup on required migration failures; use versioned migrations, explicit expected exceptions, and controlled retry/rollback. Health should demonstrate the required schema, not just connection/table counts.

Acceptance: injected migration failure prevents readiness; a recovered dependency permits an explicit safe retry; upgrade fixtures cover supported prior schemas.

### A10 — Chat/session association and UI request identity are not enforced
**High · P1 · Source verified.**

The API independently loads charId and the user's sessionId without checking their association. It can generate character B's reply into character A's session. It also assigns a raw personaId even when the scoped lookup failed. In the Next.js UI, history/new-session actions can change the active session while an older stream finishes; its callback updates whichever session is current and can overwrite its ID with the older one.

Evidence: [backend/controllers/chat.controller.js:317](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L317), [backend/controllers/chat.controller.js:350](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L350), [backend/controllers/chat.controller.js:372](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L372), [nextjs-frontend/components/chat/chat-view.tsx:196](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/components/chat/chat-view.tsx#L196), [nextjs-frontend/components/chat/chat-view.tsx:315](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/components/chat/chat-view.tsx#L315), [nextjs-frontend/components/chat/chat-view.tsx:710](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/components/chat/chat-view.tsx#L710).

This establishes contamination within a user's conversations; it is not proof of arbitrary cross-user session access.

Fix: validate character/session/persona association and use the successfully authorized entity ID. Reject mismatches. Bind client callbacks to session + request IDs and cancel or ignore stale responses.

Acceptance: mismatched inputs fail; switching chats during streaming never moves messages or identity into the newly selected chat.

### A11 — Deleted memories can survive in the optional Python copy
**Medium · P1 · Source verified.**

SQL deletion succeeds before a best-effort asynchronous Python delete. Failures/false results are not reconciled. Retrieval returns nonempty Python results before consulting SQL, so a deleted memory can reappear in that same active conversation. Parent deletion paths also lack coordinated vector-store purging.

Evidence: [backend/services/memory.service.js:130](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/memory.service.js#L130), [backend/services/memory.service.js:141](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/memory.service.js#L141), [backend/ai/memory/memoryClient.js:210](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/memory/memoryClient.js#L210), [backend/controllers/chat.controller.js:186](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/chat.controller.js#L186).

Fix: use deletion tombstones/outbox retries and validate retrieved IDs against authoritative ownership/existence; reconcile stores at startup. Do not make privacy depend on best-effort delivery.

Acceptance: delete while Python is unavailable, restart it, and retrieve; the deleted fact stays deleted.

### A12 — Password recovery logs codes when mail is unavailable and claims delivery
**High · P1 · Source verified; configuration-dependent.**

Without an SMTP transporter, the service logs the OTP and reset URL before checking test mode. The auth service ignores delivered=false and reports that a code was sent. SMTP failures also return a failure flag that the caller does not honor. Logs then become an additional source of usable recovery credentials, and users cannot recover their accounts as promised.

Evidence: [backend/services/email.service.js:119](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/email.service.js#L119), [backend/services/email.service.js:130](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/email.service.js#L130), [backend/services/auth.service.js:544](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L544).

Fix: never log usable recovery secrets outside isolated tests; validate production mail setup and report operational failure without enabling account enumeration.

Acceptance: missing/broken mail yields no OTP in logs or public responses, produces an operational alert, and does not falsely assert delivery.

### A13 — Social login does not consistently bind provider tokens to this app
**High · P1 · Source verified; no live token replay performed.**

Google's audience comparison is conditional on both an aud field and configured client ID. Access tokens use userinfo, bypassing that audience check. Facebook calls /me without checking the token's issuing app. A real token issued for another application can therefore lack the required binding to this application. Tokenless impersonation was not found; provider tokens are required.

Evidence: [backend/services/auth.service.js:324](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L324), [backend/services/auth.service.js:355](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L355), [backend/services/auth.service.js:364](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L364). [Google's server verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) explicitly requires the intended audience.

Fix: choose a documented token flow, require configured app IDs, verify signature/issuer/audience/expiry and stable provider identity, and validate Facebook app binding if Facebook remains supported.

Acceptance: missing or wrong audience/app, expired tokens, malformed claims, and unverified email fail; valid intended-client tokens succeed.

### A14 — Password reset is not atomic and existing tokens remain valid
**Medium · P1 · Source verified.**

The code verifies the OTP, changes the password, then separately marks the OTP used. Two concurrent requests can both pass verification; a failure after the password write can leave the code reusable. Tokens have a 14-day lifetime and no password-change/session-version revocation check. The logout endpoint returns a response without revoking a token.

Evidence: [backend/services/auth.service.js:14](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L14), [backend/services/auth.service.js:603](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L603), [backend/services/auth.service.js:750](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L750), [backend/repositories/PasswordResetRepository.js:65](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/PasswordResetRepository.js#L65), [backend/controllers/auth.controller.js:131](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/auth.controller.js#L131).

Fix: atomically consume the code and change the password; revoke existing sessions through a stored session/token version or equivalent mechanism. Store reset-secret hashes where practical.

Acceptance: exactly one concurrent redemption succeeds; injected failures roll back; a pre-reset token cannot access the account afterward.

### A15 — Avatar upload can return success when neither storage write succeeded
**Medium · P1 · Source verified.**

Both the local-cache write and SQL asset write catch and suppress errors. The method still returns an avatar URL. A local-only success is also temporary on ephemeral hosting if SQL persistence failed.

Evidence: [backend/services/auth.service.js:706](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L706).

Fix: define the durable success requirement, return a failure when it is not met, and clean up/track partial success.

Acceptance: simulate both stores failing and SQL-only failure on ephemeral hosting; never report a durable uploaded asset that will disappear.

### A16 — Optional Python persistence is unsafe under concurrent writes/failure
**Medium · P2 · Source verified.**

All saves use the same .tmp filename without a lock around the shared memory list and file replacement. Concurrent request threads can interfere. Persistence exceptions are logged and suppressed, while callers return IDs/success. Failed loads replace the in-memory store with an empty list, allowing later writes to overwrite recoverable data.

Evidence: [memory-service/memory_service.py:47](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/memory-service/memory_service.py#L47), [memory-service/memory_service.py:62](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/memory-service/memory_service.py#L62), [memory-service/memory_service.py:112](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/memory-service/memory_service.py#L112), [memory-service/memory_service.py:202](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/memory-service/memory_service.py#L202), [memory-service/memory_service.py:345](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/memory-service/memory_service.py#L345).

Fix: use a transactional store or lock the full mutation/snapshot/save operation, with unique temp files and explicit failure results. Preserve/quarantine corrupt stores. Keep the service private; its default localhost binding is not itself a public unauthenticated exposure.

Acceptance: concurrent add/delete and disk-full/rename/load failure tests preserve records and accurately report failure.

### A17 — AI requests lack a reliable end-to-end deadline and failure contract
**Medium · P1 · Source verified.**

BaseAIProvider clears its timer as soon as fetch returns headers, before Ollama reads the body. A stalled body can outlive the configured deadline. Gemini creates a client without wiring config.AI_TIMEOUT into these calls. The serial queue has no backlog bound; fallback failures are converted to canned roleplay replies with no failure metadata.

Evidence: [backend/ai/providers/BaseAIProvider.js:47](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/providers/BaseAIProvider.js#L47), [backend/ai/providers/ollama.js:17](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/providers/ollama.js#L17), [backend/ai/providers/gemini.js:35](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/providers/gemini.js#L35), [backend/ai/index.js:27](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/index.js#L27), [backend/ai/index.js:61](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/ai/index.js#L61).

Fix: enforce a total request budget across queueing, headers, body, retries, and fallbacks; propagate cancellation; bound per-user/global concurrency; distinguish unavailable AI from actual generated content.

Acceptance: headers-then-stall, offline providers, full queue, and disconnected clients all terminate within budget and expose truthful status.

### A18 — Framework support and dependency verification need an upgrade path
**Medium · P1 · Versions source verified; support status checked live.**

The Next.js dependency is 14.2.35 in the reviewed lockfile and ^14.2.35 in the manifest. The vendor lists 14.x as unsupported. The optional Python requirements pin old direct packages but do not lock the transitive environment or specify a tested interpreter. There is no Dependabot configuration in the reviewed tree. This does not establish that GitHub dependency alerts are disabled.

Evidence: [nextjs-frontend/package.json:19](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/package.json#L19), [nextjs-frontend/package-lock.json:1](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/package-lock.json#L1), [memory-service/requirements.txt:1](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/memory-service/requirements.txt#L1), [Next.js support policy](https://nextjs.org/support-policy).

Fix: choose a currently supported stable Next.js line after compatibility review; migrate lint/build tooling with it. Establish dependency-update PRs for both npm workspaces, Actions, and Python, and run current advisory checks in a controlled environment. Pin and smoke-test a compatible Python environment.

Acceptance: supported framework, documented runtime, reproducible installs, full build and auth/chat regression checks. Do not use a blanket forced dependency upgrade.

### A19 — Green CI omits important suites and failure scenarios
**Medium · P1 · Workflow/source verified.**

The root runner discovers only top-level tests/*.test.js or .test.mjs. Nested tests/e2e and manual scripts are explicitly excluded. Next.js npm test names only core.test.mjs despite three additional unit files. Python CI parses syntax and checks source regressions; it does not execute the embedding service. Existing green checks did not catch A01–A09.

Evidence: [scripts/run-tests.js:10](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/scripts/run-tests.js#L10), [nextjs-frontend/package.json:10](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/package.json#L10), [.github/workflows/ci-cd.yml:48](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/.github/workflows/ci-cd.yml#L48), [docs/CI.md:24](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/docs/CI.md#L24).

Fix: convert the reproduced mechanisms into behavioral regressions. Audit excluded suites for live-service assumptions before enabling them; isolate them first. Make each suite included or explicitly quarantined with a reason. Add browser-level edit/reload, session-switch, and stream-failure tests.

Acceptance: CI demonstrably fails on each original bug and passes after the intended repair. Source regex checks alone are not proof of correct runtime behavior.

### A20 — Main is unprotected and agent guidance requires direct pushes
**High · P1 · Live GitHub state and source verified.**

GitHub reported protected=false, protection.enabled=false, no required checks, and an empty rulesets list. Agent instructions explicitly tell tools to push origin main. Consequently successful CI is informational, not a merge gate, and automated edits can bypass review.

Evidence: [main branch API](https://api.github.com/repos/Kazuken123/My-C.AI-Universe/branches/main), [rulesets API](https://api.github.com/repos/Kazuken123/My-C.AI-Universe/rulesets), [.github/copilot-instructions.md:27](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/.github/copilot-instructions.md#L27), [.agents/rules/project_workflow.md:8](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/.agents/rules/project_workflow.md#L8).

Fix: protect main with PRs, the actual CI status check, resolved conversations, and blocked force pushes/deletion; restrict bypass. A solo maintainer can start with PRs/checks without requiring a second human approval. Align agent rules with scoped branches, reviewed diffs, and no automatic publishing.

Acceptance: an ordinary direct push and a PR with failing required checks are blocked. Settings changes require their own authorized execution; none were made during this audit. [GitHub ruleset guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

### A21 — Successful CI is not evidence of a successful deployment
**Medium · P2 · Live job results verified.**

At the reviewed SHA, CI succeeded. The deployment job also shows success, but both the current-head check and deployment-request steps were skipped. The workflow condition indicates the deploy hook was unavailable to this run. Even when configured, the workflow only requests deployment; it does not verify completion, the serving SHA, or application health. Render's separate auto-deploy settings were not inspected.

Evidence: [CI run 40368515279](https://github.com/Kazuken123/My-C.AI-Universe/actions/runs/40368515279), [.github/workflows/ci-cd.yml:88](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/.github/workflows/ci-cd.yml#L88).

Fix: choose one intentional deployment path, expose requested/skipped/healthy states separately, record the running revision, and verify readiness after deployment with a rollback procedure.

Acceptance: a broken or skipped deployment cannot be mistaken for a healthy release; deployed revision and smoke checks are recorded.

### A22 — Runtime-data exclusion and onboarding instructions leave avoidable traps
**Medium · P2 · Source/tree verified.**

.gitignore excludes .env, .env.local, and .env.*.local, but not general .env.production/.env.staging files. The Python service's default memories.json is not covered by the runtime-data ignore rules. README quick start omits preparing environment configuration despite required JWT_SECRET, and does not explain running the separate Next.js frontend. SECURITY.md, CONTRIBUTING.md, CODEOWNERS, and a PR template are absent from the reviewed tree.

Evidence: [.gitignore:9](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/.gitignore#L9), [memory-service/memory_service.py:22](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/memory-service/memory_service.py#L22), [README.md:116](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/README.md#L116), [backend/config/index.js:67](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/config/index.js#L67).

Fix: exclude runtime data/secrets with explicit safe-template exceptions; verify using git check-ignore. Write one tested onboarding path for each supported UI, environment setup, production dependencies, backup/restore, and reporting security issues.

Acceptance: a fresh checkout follows the docs successfully; sample secrets/runtime memory files remain untracked; no real secrets are placed in examples. This is an exclusion gap, not a finding that a live secret was committed.

## Additional bounded follow-ups

These are lower-priority improvements, not reasons to delay the privacy fix:

| Issue | Evidence and practical action |
| --- | --- |
| Likes are one shared toggle, not per-user likes | [backend/repositories/CharacterRepository.js:176](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/repositories/CharacterRepository.js#L176) and [backend/routes/character.route.js:33](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/routes/character.route.js#L33). Introduce a unique user/character relation if the UI intends user-specific likes; anonymous toggles currently change shared state. |
| Auth attempts are counted twice | [server.js:78](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/server.js#L78) and [backend/routes/auth.route.js:8](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/routes/auth.route.js#L8) install the same limiter on overlapping routes. Keep one registration and test the documented allowance. |
| Transient network errors log users out | [nextjs-frontend/context/auth-context.tsx:32](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/context/auth-context.tsx#L32) clears stored credentials after any getMe failure. Only invalidate on an authentication response; keep a retryable offline state for network/5xx failures. |
| Registration can leave a half-created account | [backend/services/auth.service.js:203](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/services/auth.service.js#L203) persists the user before the starter persona without one transaction. Roll back or repair deterministically on persona failure. |
| Browser token and script hardening | [nextjs-frontend/lib/auth.ts:34](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/nextjs-frontend/lib/auth.ts#L34), [backend/middlewares/security.js:135](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/middlewares/security.js#L135). Tokens are readable by JavaScript; inline scripts are allowed. Consider server-set HttpOnly cookies plus appropriate CSRF protection and a stricter CSP. No complete XSS exploit was demonstrated. |
| Destructive maintenance scripts are easy to run accidentally | [scripts/sync-real-stats.js:11](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/scripts/sync-real-stats.js#L11) resets all likes and automatically targets configured cloud storage; [scripts/prepare-audit.js:44](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/scripts/prepare-audit.js#L44) executes unpinned npx code. Add explicit targets/dry runs/backups and pin audit tooling. These scripts were not executed. |
| Small validation gaps become 500 errors | [backend/models/ChatSession.js:93](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/models/ChatSession.js#L93) accepts a fractional variant index; [backend/controllers/persona.controller.js:82](https://github.com/Kazuken123/My-C.AI-Universe/blob/84f39dfb7899abe802a4805e4fc9532f87afdd46/backend/controllers/persona.controller.js#L82) calls trim on unchecked values. Validate types/ranges and return 400. |

## GitHub and delivery evidence

- [CI run](https://github.com/Kazuken123/My-C.AI-Universe/actions/runs/40368515279): success at the exact reviewed SHA; backend tests, frontend unit command, lint, typecheck, and build succeeded.
- [CodeQL run](https://github.com/Kazuken123/My-C.AI-Universe/actions/runs/40368514889): success at the same SHA. A successful run is not a statement that there are no open security alerts.
- Branch/ruleset state: unprotected, no rulesets, as described in A20.
- The connected GitHub tool cannot inspect all administration/security endpoint families. Detailed branch-protection access was restricted; basic branch metadata still reported protection disabled. Private Dependabot/secret/code-scanning alerts, secret values, deployment environments, Actions defaults, token scopes, and account 2FA were not verified.
- No live production load, penetration, backup-restore, or migration test was performed.

## Remediation roadmap

| Order | Work | Done when |
| --- | --- | --- |
| 1 — immediate | A01 + A02 | Privacy survives parent deletion; malformed input cannot stall subsequent chat. Targeted regressions pass. Review existing orphaned memory data separately before any cleanup. |
| 2 — integrity | A04 + A05 + A10, then A03 | Edits persist; concurrent operations are versioned/idempotent; session identity is enforced in API and UI. |
| 3 — reliable failure | A07 + A09 + A15 + A17 | Disconnects, failed persistence, failed migrations, and unavailable AI report truthful outcomes within bounded time. |
| 4 — account and memory lifecycle | A11–A14 + A16 + A06 | Deletion propagates, recovery is atomic and private, intended-client OAuth is enforced, and summaries actually trigger. |
| 5 — delivery discipline | A08 + A18–A22 | Migration works on fixtures, supported dependencies, meaningful required CI, protected main, verified deploys, and reproducible onboarding. |

For a GitHub beginner, the highest-value habits are small feature branches, one focused PR at a time, reading the diff, waiting for meaningful checks, and knowing how to revert. Add 2FA/passkeys and recovery-code storage at the account level, then branch protection and dependency alerts. You do not need every GitHub feature or a paid plan merely to establish this workflow in a public repository.

## Reproduce and continue

See [HANDOFF.md](HANDOFF.md) for the next model's exact first batch and constraints.

Run the saved probes from the repository root:

```powershell
node docs/audits/2026-10-27/verify-findings.mjs
python docs/audits/2026-10-27/verify-schema.py
```

These scripts assert that the reviewed bugs exist. A passing probe run therefore means reproduction succeeded, not that the app passed a safety test. After fixes, preserve this snapshot and add proper positive regression tests under the normal test suite.

[evidence.json](evidence.json) stores the concise observations. [inventory.json](inventory.json) records paths and content hashes; inventory membership does not claim line-by-line review.
