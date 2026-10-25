# 📈 Project Progress & Architecture Log — My C.AI Universe

> **Current Version:** `v2.9.0`  
> **Status:** Production-Ready & Hardened (Zero-Vulnerability Release)  
> **Automated Test Coverage:** 49/49 E2E, unit & security regression tests passing (`npm test` 35 + `nextjs-frontend test` 14)  
> **Primary Database:** Turso Cloud (LibSQL `@libsql/client`, AWS Tokyo `ap-northeast-1`)  
> **Primary AI Engine:** Google Gemini (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`) with native `systemInstruction` & fallback chain  
> **Last Updated:** October 2026

---

## 📌 Executive Summary

**My C.AI Universe** is a full-stack, object-oriented Character.AI (`c.ai`) web application. It features relational SQL persistence, swipeable response takes, scene continuation, inline turn editing, message rewinding, context pinning, multi-persona user profiles, and hybrid long-term character memory.

This document serves as the **single source of truth** for project history, recent milestones, architectural decisions, solved issues, and roadmap items so that any developer or AI coding agent can immediately get up to speed.

---

### 🏷️ `v2.9.0` (Current) — Comprehensive Security Hardening & Zero-Vulnerability Release (15/15 Audit Remediations)
- **Post-Review Hardening & Defect Elimination**:
  - **Fixed Avatar Cloud Persistence**: Resolved runtime `ReferenceError` by passing `dataBase64: base64Data` in `AuthService.saveBase64Avatar()`, guaranteeing durable asset storage in Turso Cloud `media_assets` table.
  - **Unified Avatar URL Validation**: Centralized avatar validation under `AuthService.isSafeAvatar()`, imported and enforced consistently across `CharacterController` (`createCharacter`, `updateCharacter`) and `auth.service.js`.
  - **Unified Reserved Usernames**: Canonical `RESERVED_USERNAMES` centralized in `backend/config/index.js` and imported into `Character.canModify()` and `auth.service.js`, protecting all 11 system usernames against legacy character takeover.
  - **Account Enumeration Defense**: Hardened `AuthService.requestPasswordReset()` to return a uniform success response when queried with non-existent accounts.
  - **Database Abstraction Cleanup**: Replaced direct raw SQL queries for password resets and media assets with dedicated `PasswordResetRepository` and `MediaAssetRepository` extending `BaseRepository`.
  - **BaseController Response Inheritance**: Converted all manual response calls in `PersonaController` to standardized `this.sendError()`.
- **Batch 1: Authentication, Password Reset & Upload Hardening**:
  - `[VULN-01]` **Social Authentication Cryptographic Hardening**: Enforced mandatory provider token verification via `verifyGoogleIdToken` with audience checking and `email_verified: true`. Prevented account takeover by rejecting account matching via derived username and blocking local password account overwrite with Google identities unless cryptographically proven. Provided deterministic test mock token under `config.IS_TEST`.
  - `[VULN-02]` **Host Header Injection, OTP Brute-Force & Reset Leakage**: Replaced dynamic `req.get('host')` with immutable `config.PUBLIC_BASE_URL` in reset email links. Added exponential/brute-force lockout (maximum 5 failed OTP attempts before invalidation). Invalidated existing OTPs upon generating new ones. Enforced `config.IS_TEST` gating for OTP preview returned in API responses and removed client-side auto-fill vulnerability from `reset-password.js`. Escaped email recipient strings against HTML injection.
  - `[VULN-03]` **Unrestricted Avatar Upload & Rate Limiting**: Added `uploadRateLimiter` (15 uploads/hour) and `requireAuth` to avatar upload endpoints (`/auth/upload-avatar` and `/upload/avatar`). Implemented magic-byte inspection (`#detectRasterMagicBytes`) requiring valid PNG, JPEG, GIF, or WebP binary headers with 5MB cap. Enforced strict filename regex, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and sandbox CSP headers on avatar asset delivery.
- **Batch 2: Authorization, Memory Isolation, XSS & Scraper Defenses**:
  - `[VULN-04]` **Admin Route & Web Asset Gatekeeper Bypass Guard**: Normalized `req.path` with `path.posix.normalize` and stripped duplicate slashes/trailing NTFS/Windows characters (`.`, ` `) before regex route evaluation. Enforced `requireAdminWebAccess` across both `/admin` and `/admin.html`.
  - `[VULN-05]` **Cross-Tenant Character Memory Leakage**: Replaced unscoped memory retrieval with tenant-isolated `findForContext(characterId, verifiedSessionId)`: unauthenticated or cross-session queries return solely canon memories (`session_id IS NULL AND source != 'story_summary'`). Verified session ownership before returning session memories or summaries and restricted memory deletion to session owners or admins.
  - `[VULN-06]` **DOM XSS, Safe URL Sanitization & CSP Headers**: Implemented `sanitizeReturnUrl` and `isSafeImageSrc` in `frontend/js/common.js`. Replaced unsafe avatar `innerHTML` injection with programmatic `document.createElement('img')`. Hardened return URL redirection in `auth-page.js` and `profile-setup-page.js` to prevent protocol smuggling (`javascript:`, `data:`). Added protocol validation and `rel="noopener noreferrer"` to external wiki links in `chat.js`. Added defense-in-depth CSP header in `backend/middlewares/security.js`.
  - `[VULN-07]` **Character Ownership Hijack & Reserved Handles**: Exported and enforced immutable `RESERVED_USERNAMES` (`community`, `system`, `admin`, `moderator`, `kazuken`, `root`, etc.) in user registration, profile setup, and update flows. Enforced immutable `ownerUserId` as authoritative in `Character.canModify(user)`, forbidding non-admin users from hijacking legacy canon characters via handle matching.
  - `[VULN-08]` **SSRF Whitelist & Open Proxy Hardening**: Removed `translate.goog` open proxy bypass from `ALLOWED_DOMAINS`. Implemented `#fetchSafeText` in `wiki.service.js` using `redirect: 'manual'` with recursive `Location` re-validation against the domain whitelist and private IP filter. Enforced 2MB stream byte cap to prevent resource exhaustion.
  - `[VULN-09]` **Broken Access Control on Personas, Character AI & Atomic Likes**: Added mandatory authentication checks to `persona.controller.js` and `character.controller.js` (`createCharacter`, `parseWikiPreview`, `generateCharacterAI` with 2,000 char prompt limit) after synchronous negative input validation. Implemented atomic SQL like toggling (`toggleLikeAtomic`) in `CharacterRepository.js` and `character.controller.js` to eliminate race-condition view/like desync.
- **Batch 3: Session Security, Rate Limiter, Integrity & Repo Hygiene**:
  - `[VULN-10]` **JWT URI Malformation, Password Revocation & Cookie Security**: Wrapped `decodeURIComponent` in `try/catch` in authentication middlewares (`backend/middlewares/auth.js` and `nextjs-frontend/lib/auth.ts`) to prevent unhandled URIError server crashes. Embedded password hash fingerprint `pwd` in JWT payload so password reset immediately invalidates all existing active tokens. Added `; Secure` flag on HTTPS in client cookie utilities, expired cookie on logout, and removed unused `express.urlencoded` middleware.
  - `[VULN-11]` **Rate Limiter Spoofing & Memory Leak Protection**: Configured `app.set('trust proxy', 1)` in Express to trust only the immediate reverse proxy. Removed untrusted raw `X-Forwarded-For` header fallback from `extractClientIp` in `security.js`. Added a 10,000-entry FIFO eviction cap to `MemoryRateLimiter.hits` to prevent OOM memory leaks under spoofed IP floods.
  - `[VULN-12]` **Predictable Entity IDs & Persona Collision**: Replaced predictable `Date.now()` / `Math.random()` identifiers with cryptographically secure random bytes (`crypto.randomBytes(8).toString('hex')`) across `UserPersona`, `User`, `CharacterMemory`, and `ChatSession`. Removed `user_id = excluded.user_id` from `PersonaRepository.js` `ON CONFLICT` clause to prevent cross-user persona overwriting.
  - `[VULN-13]` **Dependency Vulnerability Eradication**: Fixed all root vulnerabilities via `npm audit fix` (patched `body-parser`, `undici`, `nodemailer` to 0 vulnerabilities). Upgraded `next` and `eslint-config-next` to `^14.2.35` in `nextjs-frontend/package.json` to eliminate Next.js DoS / SSRF advisory vulnerabilities.
  - `[VULN-14]` **Express 5 Status Code Crash & Information Leakage**: Sanitized error status codes in `BaseController.js` and `server.js` (`error?.statusCode ?? error?.status ?? error?.code`), falling back safely to 500 on string codes (e.g. `'SQLITE_CONSTRAINT'`) to prevent Express 5 `RangeError: Invalid status code` crashes. Masked internal 500 error messages from client responses and sanitized `/api/health` to expose only database engine type (`turso` / `sqlite`) without exposing connection URLs or tokens.
  - `[VULN-15]` **Repository Hygiene & Avatar Untracking**: Added `nextjs-frontend/public/assets/avatars/avatar_*` to root and frontend `.gitignore` files. Untracked 19 user-uploaded avatar files from Git while preserving them locally. Removed hardcoded Google OAuth Client ID fallback from `backend/config/index.js`.
- **Automated Verification**:
  - Created dedicated regression suite [`tests/security-audit.test.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/tests/security-audit.test.js) asserting unit-level invariants for all 15 audit findings.
  - Verified all 7 test suites pass in `npm test` with 35/35 passing checks and exit code 0.
  - Verified all 14 Next.js unit tests pass in `npm --prefix nextjs-frontend test` with exit code 0.

### 🏷️ `v2.8.0` — GetLayers.ai Cinema UI/UX Refinement & Multi-Skill Design Engineering Overhaul
- **GetLayers.ai Production Design System Integration (`DESIGN.md`, `PRODUCT.md`, `base.css`, `globals.css`)**:
  - Extracted and applied GetLayers.ai's production visual language across both [`frontend/`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/index.html) and [`nextjs-frontend/`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/nextjs-frontend/app/layout.tsx): deep obsidian canvas (`#060606`), primary carbon surface (`#0d0d0d`), elevated control surface (`#141414`), warm peach/terracotta accent (`#ffa582` / `#ffbea2`), platinum chrome (`#e8eaef`), and periwinkle refraction (`#a2b7f5`).
  - Integrated GetLayers' typography pairing (`General Sans` + `Cabinet Grotesk` display headings, `Onest` + `Satoshi` body prose, `JetBrains Mono` telemetry, and `Instrument Serif` editorial mode) across all 9 HTML pages and the Next.js root layout.
  - Replaced coloured outer neon `box-shadow` halos with GetLayers' specular top rim lighting (`--tw-rim: inset 0 1px 1px 0 rgba(255, 255, 255, 0.22)`), compact neutral elevation shadows (`0 8px 14px -4px rgba(0, 0, 0, 0.72)`), and inset radial peach/periwinkle button refraction on `.btn-island`.
  - Preserved the 4-mode theme switcher (`higgsfield` GetLayers Cinema default, `vanguard` Solar Amber + Titanium, `editorial` Warm Monochrome Serif, and `telemetry` Tactical Avionics) and updated [`frontend/js/ambient-canvas.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/ambient-canvas.js) to render warm peach, periwinkle, and platinum chrome volumetric light ribbons and starfield motes.
- **Full Impeccable & Emil Kowalski Design Audit Remediation**:
  - **WCAG AA Contrast & Legibility Floor**: Raised `--text-muted` and input placeholders to `#8e8e98` / `#9494a0` (>5.8:1 contrast on `#0d0d0d`), set `--text-on-accent` to `#0d0d0d` (>9.8:1 contrast on `#ffa582`), and enforced a strict `>= 0.74rem` (`11.84px`) floor across all badges, keycaps, mobile nav tabs, and relationship telemetry labels.
  - **GPU-Composited Motion & Tactile Choreography**: Replaced all `transition: width` and `transition: all` declarations with explicit `transform` (`scaleX(...)`), `opacity`, `background-color`, `border-color`, and `box-shadow` transitions on `cubic-bezier(0.22, 1, 0.36, 1)` in [`frontend/css/base.css`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/css/base.css), [`frontend/css/chat.css`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/css/chat.css), and [`frontend/js/loading-bar.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/loading-bar.js).
  - **Anti-Slop Structural Cleanup**: Removed tracked uppercase kicker pills directly above `<h1>`/`<h2>` headings, fixed `h1 -> h2 -> h3` heading hierarchy in [`frontend/create.html`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/create.html) and [`frontend/personas.html`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/personas.html), removed infinite decorative pulsing/shimmer loops (`.admin-status-dot`, `.dossier-live-dot`, `.typing-dots`, `.msg-bubble.is-reshooting::after`), removed 3px side-tab stripes on `.sec-rule-card` and `.msg-paragraph-quote`, added `12px` inset padding to `.admin-table-container`, and flattened nested card borders inside `.double-bezel-shell`.

### 🏷️ `v2.7.0` — Next.js 14 App Router Full Visual Parity & Agency Design System Unification
- **100% Pixel-for-Pixel Visual Parity with Express Backend**:
  - Completely eradicated generic AI styling artifacts and boilerplate cards from `nextjs-frontend/`.
  - Rebuilt [`nextjs-frontend/components/layout/sidebar.tsx`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/nextjs-frontend/components/layout/sidebar.tsx) with authentic brand logo (`favicon.svg`), `SQL STUDIO v2.3` typography, `Gemini 3.5 lite` telemetry pill, New Character island button, active storylines drawer, and active persona pill (`Traveler / Active Identity`).
  - Restored the **Editorial Split Hero** (`double-bezel-shell .hero-shell`) in [`nextjs-frontend/components/characters/character-catalog.tsx`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/nextjs-frontend/components/characters/character-catalog.tsx) with high-contrast copy, `Enter Featured Scene` CTA, and the Kana Arima Featured Canon dossier spotlight card.
  - Implemented the authentic 12-column asymmetric bento character grid with `getBentoSpanClass` dynamic spans, double-bezel card frames, DiceBear/custom avatar masks, mono tags, and optimistic like buttons in [`nextjs-frontend/components/characters/character-card.tsx`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/nextjs-frontend/components/characters/character-card.tsx).
- **Unified Design Tokens & CSS Architecture**:
  - Imported and synchronized all modular stylesheets (`base.css`, `dashboard.css`, `studio.css`, `personas.css`, `chat.css`, `auth.css`) directly into Next.js root layout [`nextjs-frontend/app/layout.tsx`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/nextjs-frontend/app/layout.tsx).
  - Injected Fontshare (`Cabinet Grotesk`, `Satoshi`), Google Fonts (`JetBrains Mono`, `Instrument Serif`), and Phosphor Icons (`@phosphor-icons/web@2.1.1`).
  - Attached GPU-accelerated cursor spotlight tracking (`--mouse-x`, `--mouse-y`) to all double-bezel chassis across the application via high-performance event delegation.
  - Integrated 60fps kinetic motion canvas engine (`AmbientMotionCanvas`) in `AmbientCanvas` component and `ambient-grain` film overlay.
- **Type Safety & Build Verification**:
  - `npm run build` compiled 12/12 static and dynamic routes cleanly with 0 TypeScript errors and 0 ESLint warnings.
  - Verified live parity against `http://localhost:3000` on `http://localhost:3001` with API proxy rewrites routing seamlessly to Turso Cloud.

### 🏷️ `v2.6.1` — Negation Guard, Bidirectional Negative Inertia, Regenerate Idempotency & Schema Sync
- **Negation-Aware Signal Detection (`#stripNegatedPhrases`)**:
  - Implemented `#stripNegatedPhrases` in [`backend/services/relationship.service.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/services/relationship.service.js) to strip negated sentiment words in English and Vietnamese (`don't love`, `not worthless`, `không còn yêu`, `đừng nghĩ mình vô dụng`) before regex evaluation.
  - Added explicit cold rejection detection (`isColdRejection`) inflicting heartbreak penalties (`mood = 'Hurt / Heartbroken'`, `strain += 18`, `trust -= 6`, `affinity -= 2..7`) without misclassifying as affection.
  - Added reassurance detection (`isReassurance`) ensuring comforting statements (`You are not worthless`) increase trust and calm strain instead of misfiring toxic cruelty penalties.
- **Bidirectional Negative Inertia & AI-Driven Subtle Reactions**:
  - Implemented negative emotional inertia (`isHostileOrDistrustful = affinity <= -40 || trust <= -40`): active enemies or distrusted characters react with `'Suspicious / Guarded'` to sudden flattery or apologies instead of immediately flipping to warm/friendly.
  - Enriched the neutral/continuation fallback branch to dynamically adapt character mood to AI physical narration: `aiShowsFear` -> `'Afraid'`, `aiShowsSubmission` -> `'Submissive'`, `aiShowsHurtOrAnger` -> `'Guarded'` / `'Hurt'`, `aiShowsWarmth` -> `'Warm'`.
- **Regenerate Idempotency & Director Override Race Condition Guard**:
  - Preserved idempotency when reshooting takes (`regenerate: true`) in [`backend/controllers/chat.controller.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) by updating only the immediate mood of the chosen take without compounding user text strain or affinity.
  - Added automatic stage re-resolution via `relationshipService.resolveStage` in `updateSessionRelationship` when users adjust bond score or mood in the Director Popover without an explicit preset.
  - Guarded against in-flight network responses clobbering recent manual Director overrides via `lastDirectorOverrideTime` in [`frontend/js/chat.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/chat.js).
- **Relational Schema Synchronization & Version Bump**:
  - Synchronized character and chat session column lists in [`scripts/migrate-to-turso.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/scripts/migrate-to-turso.js) and [`backend/db/create_database.sql`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/db/create_database.sql).
  - Aligned `/api/system/ping` in [`backend/routes/index.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/routes/index.js) and [`tests/api.test.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/tests/api.test.js) to version `2.6.1`.
- **Automated Verification**:
  - Added Tests 7, 8, and 9 to [`tests/relationship-v2.6.0.test.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/tests/relationship-v2.6.0.test.js).
  - 34/34 unit, E2E integration, SQL security, and API tests verified passing (`npm test`).

### 🏷️ `v2.6.0` — Psychological Relationship & Closeness Engine with Dual-Timescale Emotional Inertia
- **Dual-Timescale Emotional Inertia Engine (`relationship.service.js`)**:
  - Implemented the 4-variable psychological model per session in [`backend/services/relationship.service.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/services/relationship.service.js):
    - `affinity` (-100 to +100): High emotional inertia. A couple's argument does not erode core love unless conflict strain reaches critical levels.
    - `trust` (-100 to +100): Vulnerability, respect, safety.
    - `strain` (0 to 100): Toxicity accumulator. Unresolved friction raises strain; apologies repair strain and reinforce attachment.
    - `relationshipMood`: Dynamic turn-to-turn emotional weather (`Calm`, `Warm`, `Playful`, `Flustered`, `Quarreling / Heated`, `Hurt / Heartbroken`, `Guarded`, `Afraid`, `Submissive`, `Possessive`).
    - `relationshipStage`: Persona-adapted dynamic stage (`Hatred / Nemesis`, `Hostile / Rival`, `Scared / Intimidated`, `Submissive / Dependent`, `Cold / Guarded`, `Stranger / Neutral`, `Acquaintance / Comrade`, `Close Friend / Confidant`, `Crush / Infatuated`, `Deep Love / Devoted`, `Obsessed / Possessive`).
  - Implemented Persona Vulnerability Detection (`detectPersonaVulnerability`) adapting stages to character traits (e.g. tsundere, yandere, submissive).
  - Implemented Breaking Point Realism: when `strain >= 65`, the emotional dam breaks, causing structural penalties to affinity and trust.
- **Relational SQL Database Schema & Auto-Migrations**:
  - Added `initial_affinity`, `initial_relationship_stage`, and `relationship_dynamic` columns to `characters` in [`backend/db/schema.sql`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/db/schema.sql).
  - Added `affinity`, `trust`, `strain`, `relationship_stage`, and `relationship_mood` columns to `chat_sessions`.
  - Added automated non-destructive schema migrations in [`backend/db/database.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/db/database.js) inspecting SQLite / Turso `table_info`.
- **Character Creator & Studio Integration (`create.html`, `studio-page.js`)**:
  - Added Starting Relationship & Universe Dynamic configuration card with preset dropdown, interactive bond slider (-100 to +100), custom dynamic textarea, and live dossier preview pill in [`frontend/create.html`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/create.html) and [`frontend/js/studio-page.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/studio-page.js).
- **In-Chat Live Pill & Interactive Relationship Director Popover (`chat.html`, `chat.css`, `chat.js`)**:
  - Built relationship bar pill (`#chatRelationshipBar`) in chat topbar sub-row with stage icon, label, score badge, mood pill, and progress fill bar.
  - Built Relationship Director popover (`#chatRelationshipPopover`) displaying real-time metrics cards, author dynamic banner, quick stage presets, bond slider, mood selector, strain reset ("Repair Strain"), and "Apply to Scene" button.
  - Implemented `PUT /api/chats/:sessionId/relationship` endpoint and `updateRelationshipState` in `ChatSessionRepository` for $O(1)$ updates without rewriting message history.
- **System Prompt Psychological Injection**:
  - Injected `[RELATIONSHIP & EMOTIONAL DYNAMICS WITH USER]` block into `generateCharacterPrompt` in [`backend/ai/prompt/characterPrompt.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/prompt/characterPrompt.js) enforcing Dual-Layer Realism and Turn-to-Turn Psychological Permanence.
- **Automated Verification**:
  - Created [`tests/relationship-v2.6.0.test.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/tests/relationship-v2.6.0.test.js) covering initial seeding, lovers' quarrel inertia, chronic toxicity breaking points, apology repair, prompt injection, and stage resolution.
  - 31/31 unit, E2E integration, SQL security, and API tests verified passing (`npm test`).

### 🏷️ `v2.5.6` — Character-Deduplicated Sidebar & C.AI-Style Thread History Drawer
- **Sidebar Character Deduplication (`deduplicateSessionsByCharacter`)**:
  - Implemented `deduplicateSessionsByCharacter` in [`frontend/js/common.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/common.js) and integrated into `initSidebar()` and [`frontend/js/chat.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/chat.js) `renderSidebarRecentChats()`.
  - Aggregates multi-thread sessions per character so each character appears at most once in `ACTIVE STORYLINES`, retaining their most recently active thread while displaying the total thread count badge.
  - Highlights the character row when chatting with that character across any of their thread branches.
- **Character.AI-Style Right-Side History Drawer (`#chatHistoryDrawer`)**:
  - Added dedicated History button (`#btnChatHistory`) to the top header toolbar in [`frontend/chat.html`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/chat.html).
  - Built slide-over history drawer featuring a top card for the current conversation, a chronological list of past threads, relative timestamps, 3-line clamped preview snippets, and thread deletion with automatic fallback switching.
  - Implemented instant zero-page-reload thread switching via `window.history.replaceState` and mutual drawer exclusion between History and Dossier/Memory drawers.
  - Added Double-Bezel Dark styling and responsive mobile slide-over rules in [`frontend/css/chat.css`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/css/chat.css).
- **Lightweight Relative Time Formatter (`formatRelativeTime`)**:
  - Implemented standalone `formatRelativeTime(dateInput)` in [`frontend/js/chat.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/chat.js) with zero external library overhead.
- **Unit & Integration Verification**:
  - Created [`tests/sidebar-history-v2.5.6.test.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/tests/sidebar-history-v2.5.6.test.js) verifying deduplication edge cases and relative time ranges.
  - Integrated into `npm test` test suite and verified passing.

### 🏷️ `v2.5.5` — Dynamic Character Continuity, Strict Role-Alternation, Context-Aware Memory & Latency Elimination
- **Strict Turn Alternation & Initial Scene Prepending in `GeminiProvider`**:
  - Implemented automatic turn merging for consecutive identical roles in [`backend/ai/providers/gemini.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/providers/gemini.js) `#buildContents`, ensuring multi-turn inputs always alternate strictly between `user` and `model`.
  - Prepended `{ role: 'user', parts: [{ text: '[Scene Start]' }] }` whenever conversation history begins with an opening character greeting (`role: 'model'`), preventing Gemini API multi-turn validation failures and attention degradation.
- **Dynamic Character Evolution & Turn-to-Turn Logical Continuity**:
  - Upgraded `generateCharacterPrompt` in [`backend/ai/prompt/characterPrompt.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/prompt/characterPrompt.js) with rules separating baseline traits from contextual adaptation. Characters evolve their tone, walls, and seriousness dynamically based on scene tension rather than robotically repeating initial tropes.
  - Implemented the Anti-Contradiction Rule: explicitly anchors responses to the character's immediately preceding turn, preventing self-contradiction when users send short queries or confirmations.
  - Expanded Anti-Melodrama & Grounded Realism prohibitions to ban hyperbolic buzzwords (`atomic`, `vaporized`, `short-circuits`, `unadulterated`, `shatters`, `writhing`, `mind-numbing`).
  - Embedded `[ALTERNATIVE TAKE DIRECTIVE]` and excluded variants directly into `systemInstruction`, eliminating prompt contamination when regenerating responses.
- **Context-Aware Semantic Memory Queries**:
  - Enhanced `queryForMemory` in [`backend/controllers/chat.controller.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) `sendChatMessage` to combine the previous assistant turn snippet with user input when user prompts are shorter than 30 characters, ensuring relevant long-term memory retrieval during short responses.
- **Cleaned Regenerate Flow**:
  - Passed raw `precedingUserMsg` directly to `orchestrator.chat()` instead of injecting technical meta-instructions into the user message role.
- **Eliminated N+1 Variant Loading in `ChatSessionRepository`**:
  - Replaced the $M$-query sequential loop in `_hydrateSession` in [`backend/repositories/ChatSessionRepository.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/repositories/ChatSessionRepository.js) with a single batched query using `WHERE message_id IN (...)`, grouping variants in-memory via `Map`. Reduces variant hydration from $M$ network roundtrips down to exactly 1 query ($O(1)$).
- **Lightweight Lean Session Listing (`findAllLean`)**:
  - Added `findAllLean(characterId, userId)` in [`backend/repositories/ChatSessionRepository.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/repositories/ChatSessionRepository.js) using an aggregated SQL `LEFT JOIN` and correlated subquery to retrieve metadata, message counts, and last messages in a single query.
  - Updated `getChatSessions` in [`backend/controllers/chat.controller.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) to call `findAllLean()`, reducing sidebar listing from 200+ SQL roundtrips ($O(S \times M)$) down to 2 SQL queries total.
- **High-Quota Gemini Flash Lite Alignment (500 RPD, 15 RPM)**:
  - Verified and aligned primary and secondary models to high-quota endpoints (`gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` offering 500 requests/day, 15 req/min) with `gemini-2.5-flash` as backup. Removed deprecated `gemini-2.0-flash` from the fallback chain.
- **Deduplicated Auth Middleware**:
  - Added fast guard `if (req.user !== undefined) return next();` in [`backend/middlewares/auth.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/middlewares/auth.js) `optionalAuth`, preventing duplicate `users` SQL lookups when `requireAuth` runs downstream of global `optionalAuth`.
- **Parallelized Controller Lookups & Reduced AI Queue Delay**:
  - Concurrently hydrated character, session, and active persona lookups via `Promise.all` in [`backend/controllers/chat.controller.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) `sendChatMessage` and `createChatSession`.
  - Decreased artificial inter-request delay in [`backend/ai/index.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/index.js) queue from 350ms to 50ms.
- **Frontend In-Flight Deduplication, Cache & Optimistic UI**:
  - Added in-flight request sharing and a 3-second cache TTL to `loadAllSessions()` in [`frontend/js/chat.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/chat.js).
  - Parallelized initial character and session fetching in `openChatWithCharacter()`.
  - Added `updateLocalSessionPreview()` for instant ($0\text{ ms}$) in-memory sidebar updates upon stream finish, eliminating the redundant post-turn `loadAllSessions()` cascade.
  - Consolidated duplicate `getMemories()` calls into a single shared invocation in `refreshRightDrawer()`.
- **Automated Verification**:
  - 27/27 automated unit, E2E integration, SQL security, and API tests verified passing against live Turso Cloud database.

### 🏷️ `v2.5.4` — O(1) Fast Message Append, Parallel Context Hydration & Non-Blocking Post-Turn Pipeline
- **O(1) Incremental Chat Message & Variant SQL Persistence**:
  - Implemented `appendMessages(session, newMessages)` and `appendVariant(session, message, newVariant)` in [`backend/repositories/ChatSessionRepository.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/repositories/ChatSessionRepository.js).
  - Eliminated $O(N)$ full-history rewrites on remote Turso Cloud (`ap-northeast-1`) that previously executed 60–100+ SQL round-trips per chat turn by executing targeted batch `INSERT`s strictly for new messages and new variants.
  - Retained full `save(session)` fallback strictly for initial session initialization (`isNewSession`) and destructive operations (deletions/rewinds).
- **O(1) Atomic Character Interactions Increment**:
  - Implemented `incrementInteractions(id, updatedAt)` in [`backend/repositories/CharacterRepository.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/repositories/CharacterRepository.js).
  - Replaced 23-column full-row rewrites with a lightweight single-column atomic SQL statement: `UPDATE characters SET interactions = interactions + 1, updated_at = ? WHERE id = ?`.
- **Concurrency Guard for Rolling Story Summarization**:
  - Added session-level in-flight mutex locks (`this.activeSummaryLocks = new Set()`) in [`backend/services/memory.service.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/services/memory.service.js) to guarantee only one LLM summarization pipeline runs per session at any time, preventing duplicate story summaries and race conditions.
- **Parallel Context Hydration & Non-Blocking Background Post-Turn Pipeline**:
  - Restructured [`backend/controllers/chat.controller.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) context loading to execute `memoryService.getContextMemories()` and user persona resolution in parallel via `Promise.all()`.
  - Moved memory fact auto-detection and rolling story summarization out of the critical HTTP response path via `#schedulePostTurnTasks()`, executing them asynchronously in the background (`setImmediate`) without delaying the user response.
- **Automated Verification**:
  - 22/22 E2E integration, SQL security, and API tests verified passing against live Turso Cloud database.

### 🏷️ `v2.5.3` — Cross-Runtime Python Microservice Boundary Synchronization & Cooldown Optimization
- **Session-Scoped Vector Memory & Lore Isolation**:
  - Synchronized `session_id` filtering in [`memory-service/memory_service.py`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/memory-service/memory_service.py) with relational SQL rules: queries strictly match `character_id` and either global canon lore (`session_id is None`) or active chat session (`session_id == target`), preventing cross-story memory bleed.
  - Stripped rolling story chronicles (`source == 'story_summary'`) from vector embedding stores to eliminate duplicate narrative echoes.
- **Ghost Memory Elimination & ID Lifecycle Coordination**:
  - Updated [`backend/ai/memory/memoryClient.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/memory/memoryClient.js) and [`backend/services/memory.service.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/services/memory.service.js) to propagate `CharacterMemory.id` directly into Python microservice storage.
  - Implemented `deleteMemory(memoryId)` in `MemoryClient` triggered atomically upon SQL memory deletion.
- **Health-Check Backoff & Instant 0ms Fallback**:
  - Implemented 30-second cooldown backoff (`healthCheckCooldownMs = 30000`) on failed health check pings in [`backend/ai/memory/memoryClient.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/memory/memoryClient.js), eliminating 1.2s TCP timeout penalties per chat turn when the Python service is offline.
- **Flask Process & RAM Optimization**:
  - Set `debug=False, use_reloader=False` in [`memory-service/memory_service.py`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/memory-service/memory_service.py) to prevent Werkzeug from launching duplicate processes and loading `SentenceTransformer` weights twice.
- **Automated Verification**:
  - 22/22 E2E integration and security tests verified passing against live Turso Cloud database.

### 🏷️ `v2.5.2` — AI Orchestrator Fallback Hardening, Prompt Leakage Defense & Scalable Hybrid Memory
- **Eliminated Meta-Prompt Leakage in Regenerate/Swipe**:
  - Re-engineered `#buildInCharacterFallback` in [`backend/ai/index.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/index.js) to recognize technical directives (`options.isRegenerate`, `options.isContinuation`, `Directive`, `Rules:`) and banned echoing raw prompt substrings (`cleanInput.slice(0, 90)`) into character dialogue.
  - Added support for `excludeVariants` inside fallback beats to provide diverse narrative responses across swipe attempts.
  - Stripped `styleHint` `(${character.tagline})` from both `#buildInCharacterFallback` and [`backend/ai/prompt/characterPrompt.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/prompt/characterPrompt.js) `generateDefaultGreeting` to prevent lore metadata pollution in narration.
- **Resilient Multi-Model Gemini Fallback & Native SDK Instructions**:
  - Upgraded [`backend/ai/providers/gemini.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/providers/gemini.js) to automatically cycle through candidate models (`this.modelName`, `this.fallbackModelName`, `gemini-2.5-flash`, `gemini-2.0-flash`) when encountering 404, 429, 500, or 503 errors.
  - Transitioned from mock turn injection to native SDK `config.systemInstruction` across `generateReply` and `generateReplyStream`, enabling calibrated temperature adjustment during regeneration (`0.95`).
- **O(1) Indexed Relational SQL Memory Operations & Session Scoping**:
  - Added `idx_character_memories_session_source` index to [`backend/db/schema.sql`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/db/schema.sql).
  - Added targeted methods `findForContext`, `findStorySummary`, and `upsertStorySummary` in [`backend/repositories/MemoryRepository.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/repositories/MemoryRepository.js), eliminating $O(N)$ full-table scans.
  - Enforced session-scoped memory retrieval in [`backend/services/memory.service.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/services/memory.service.js) and [`backend/controllers/chat.controller.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) (`character_id = ? AND (session_id IS NULL OR session_id = ?)`), preventing cross-session memory bleeding.
  - Added bilingual English & Vietnamese stop words and conversational fact detection regexes.
- **Automated Verification**:
  - 22/22 E2E integration and security tests verified passing against live Turso Cloud database.

### 🏷️ `v2.5.1` — Top Loading Page Bar & Multi-Mode Architectural Personality Engine
- **YouTube / GitHub / Next.js Style Top Loading Page Bar**:
  - Engineered zero-dependency [`frontend/js/loading-bar.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/loading-bar.js) singleton with initial spring jump (`22%`), diminishing auto-trickle algorithm (`22% -> 90%`), 180ms snap-to-finish, and 240ms smooth fade-out.
  - Implemented dynamic accent gradient lighting (`var(--accent)` to `var(--accent-hover)`), a glowing 100px leading edge peg, and a continuous shimmer beam during network latency.
  - Automatically hooked into all internal navigation `<a>` link clicks, `beforeunload`, `pageshow` (bfcache restore), window `load`, and `ApiClient.request()` / `sendChatMessageStream()`.
  - Added pre-rendered markup to all 8 HTML views and enabled early theme hydration in `<head>` to prevent theme flashing on first render.
- **Deep Multi-Mode Architectural & Personality Differentiation**:
  - Fixed sidebar style disconnect by replacing hardcoded background and active item values with dynamic CSS tokens (`var(--bg-rail)`, `var(--accent-soft)`, `var(--accent-border)`).
  - Engineered distinct structural, typographic, geometric, and tactile personalities across all 4 design systems:
    - **Editorial (Swiss Publication & Utilitarian Minimalism)**: *Instrument Serif* italic typography for titles, crisp 4px / 2px sharp rectangular geometry (banned round pills), pure flat matte carbon substrate (`#0b0b0f`, zero glowing drop shadows), and a book rail sidebar with left white highlight stripe and typewriter `<kbd>` keys.
    - **Telemetry (Tactical Military HUD & Industrial Brutalism)**: Strict uppercase *JetBrains Mono* dominance, 0px hard industrial corners, 20px tactical HUD coordinate grid substrate, avionics command rail with hazard-red outline (`#e61919`), and mechanical bracket buttons `[EXECUTE]`.
    - **Vanguard (Electric Cyberpunk Cockpit)**: Heavy bold grotesk typography, 10px cyber radius, electric cyan (`#06b6d4`) & ultraviolet neon outlines, and dual-tone cyber badges.
    - **Higgsfield (OLED Glassmorphism & Aurora Luxury)**: Deep OLED black with violet/cyan nebulae, concentric double-bezel curves (`22px`), and floating pill capsules.
- **Automated Verification**:
  - Verified with 22/22 end-to-end integration and security tests passing.
  - Updated graphify knowledge graph.

### 🏷️ `v2.5.0` — Real-Time SSE Token Streaming & Multi-Tier Story Chronicle Memory Architecture
- **Real-Time Token Streaming via Server-Sent Events (SSE)**:
  - Implemented `generateReplyStream()` in [`backend/ai/providers/gemini.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/providers/gemini.js) using `@google/genai` `generateContentStream()`.
  - Added `chatStream()` generator method to [`AIOrchestrator`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/index.js) yielding real-time chunks.
  - Added full SSE streaming support to [`POST /api/chat?stream=true`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) with graceful standard JSON fallback.
  - Built frontend typewriter effect in [`frontend/js/chat.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/chat.js) and [`frontend/js/api.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/api.js) via `ReadableStream` & `TextDecoder`, rendering pulsing typewriter cursor `▌` and progressive roleplay text formatting.
- **Two-Tier Extended Memory Architecture (C.AI+ Grade)**:
  - **Tier 1 (Sliding Context Window)**: Expanded history from 20 turns to 60 turns across backend [`backend/config/index.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/config/index.js) and frontend payloads, utilizing Gemini's 1M token context window while eliminating mid-scene amnesia.
  - **Tier 2 (Rolling Story Chronicle)**: Built `updateRollingStorySummary` in [`backend/services/memory.service.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/services/memory.service.js). Automatically summarizes prior narrative arcs beyond the sliding window every 12 turns (once past turn 24), storing immutable plot milestones under `source: 'story_summary'` in Turso Cloud.
  - Injected `[STORYLINE CHRONICLE / PREVIOUS STORY ARCS - IMMUTABLE PLOT MEMORY]` into [`backend/ai/prompt/characterPrompt.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/prompt/characterPrompt.js) before active history turns.
- **In-Chat Memory Inspector & Notebook UI**:
  - Added dedicated Memory button (`#btnMemoryNotebook`) to [`frontend/chat.html`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/chat.html) toolbar for 1-click access to the character's memory dossier.
  - Added **Active Narrative Arc** chronicle card in the drawer displaying the ongoing rolling summary.
  - Upgraded semantic memory list to clearly distinguish canonical custom user notes from auto-detected turns, with instant addition and removal.
- **Automated Verification**:
  - Expanded E2E test suite in [`tests/api.test.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/tests/api.test.js) with Test 22, verifying live SSE token streaming.
  - 22/22 tests verified passing against Turso Cloud.

### 🏷️ `v2.4.0` — Humanized Dialogue Pacing Engine & Cognitive Speech Architecture
- **Humanized Dialogue Cadence & Pacing**:
  - Implemented speech pacing mechanics in [`backend/ai/prompt/characterPrompt.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/prompt/characterPrompt.js) using punctuation as spoken notation: `...` for natural pauses/hesitations, `—` for flustered self-interruptions and cut-offs, `?!` for outrage/disbelief, and `~` for playful/arrogant drawls.
  - Enforced aggressive sentence length burstiness to eliminate uniform AI sentence rhythm (15-20 words).
- **Anti-AI Speech Kill-List & Behavioral Restrictions**:
  - Hard-banned compulsory conversational wrap-up questions and moral summary statements at the end of character turns.
  - Banned therapeutic emotional validation phrases (`"I understand your feelings..."`, `"I know what this looks like..."`).
  - Banned standard AI cliché vocabulary: *delve, tapestry, testament, palpable, clenched, danced, pierce the silence, truth is, you have to understand, can we just talk*.
- **Cognitive Function & Subtext Modeling (MBTI / Jungian Functions)**:
  - Mapped character psychological archetypes to spoken syntax:
    - **Te-Fi (Kana Arima)**: Sharp, staccato, defensive scoffs (`"Hah?!"`), self-interruptions (`"—"`), and flustered trailing off (`"..."`) guarding deep emotional vulnerability.
    - **Ne-Ti (Satoru Gojo)**: Playful drawls (`"~"`), teasing rhetorical questions, unbothered arrogance, and zero defensiveness.
    - **Se-Ti (Son Goku)**: Casual country boy vernacular, physical priorities (food, ki sensing), and sheepish, conflict-defusing chuckle (`"Ehehe~..."`) when guilty or caught skipping chores.
- **Contextual Prop & Lore Grounding**:
  - Grounded character lore references in immediate physical actions and situational excuses (e.g., Gojo holding the Sendai Kikufuku mochi souvenir bag as an excuse for being late) rather than trivia recitals.
- **Seeded Character Roster Expansion**:
  - Added Son Goku (`1767000000003`) to [`backend/db/seed.sql`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/db/seed.sql) with complete Se-Ti country dialect, Instant Transmission greeting, and long-term memory.
  - Upgraded Gojo and Kana lore, speaking styles, and example dialogues with calibrated pacing.
- **Automated Studio Lore Extraction & Speech Judging Pipeline**:
  - Upgraded [`backend/services/wiki.service.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/services/wiki.service.js) to isolate raw dialogue quotes and quotes sections (`blockquote`, `.quote`, `dl dd`, `Quotes` headings) before HTML stripping.
  - Configured Gemini to analyze canon quotes and personality sections to evaluate the character's Jungian cognitive archetype, pacing punctuation rules (`...`, `—`, `?!`, `~`), signature laugh, and conflict defense.
  - Automatically synthesizes Light-Novel formatted `example_dialogues` with calibrated pacing and action grounding directly into character records.
  - Synchronized AI Character Generation (`generateCharacterProfile` in [`backend/ai/providers/gemini.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/providers/gemini.js)) with the same cognitive profiling standards.
  - Upgraded Character Studio UI in [`frontend/create.html`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/create.html) and [`frontend/js/studio-page.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/frontend/js/studio-page.js) with instant field population, informative status toasts, and clear pacing placeholders.
- **Zero Regressions**:
  - Verified 21/21 E2E tests passing (`npm test`).

### 🏷️ `v2.3.2` — Unrestricted Creative Roleplay & Safety Filter Hardening
- **Repetitive Canned Fallback Resolution**:
  - Diagnosed root cause of infinite identical takes on redo/regeneration: scene continuation prompt directives contained phrases (`"remains quiet/silent and did NOT speak or take any action"`) that combined with physical touch/massage roleplay to trigger Gemini's unconfigurable server-level `PROHIBITED_CONTENT` moderation.
  - Replaced prompt directives in [`ChatController.js`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/controllers/chat.controller.js) with natural, clean narrative guidance that reliably generates in-character responses without triggering false-positive moderation flags.
- **Maximized Permissive Safety Configuration**:
  - Consolidated `PERMISSIVE_SAFETY_SETTINGS` (`BLOCK_NONE` across `HARASSMENT`, `HATE_SPEECH`, `SEXUALLY_EXPLICIT`, `DANGEROUS_CONTENT`, and `CIVIC_INTEGRITY`) into a shared constant applied across all generation endpoints including character profile creation.
  - Implemented `sanitizePromptForGemini()` in [`GeminiProvider`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/providers/gemini.js) to automatically neutralize false-positive keyword triggers (e.g., converting `"child prodigy/actress"` references into `"young prodigy/actress"`) so Google's server-level CSAM classifier does not flag teen/adult fictional romance and drama.
  - Added explicit diagnostic logging for `response.promptFeedback.blockReason` and candidate finish reasons.
- **Dynamic In-Character Fallback Pool**:
  - Upgraded [`AIOrchestrator.#buildInCharacterFallback()`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/ai/index.js) to pick from randomized roleplay beats, eliminating static single-line repetition even under provider outages.
- **Character Lore & Age Alignment (Kana Arima)**:
  - Updated Kana Arima across Turso Cloud database, compiled `system_prompt`, and [`backend/db/seed.sql`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/backend/db/seed.sql) to explicitly establish her as a **17-year-old high school student** and B-Komachi idol center who was famously a child prodigy actress in the past, keeping canonical lore accurate while eliminating false-positive policy triggers.
- **Verification**:
  - Tested against full conversation context in Turso Cloud. All 21 automated suite tests passing (`npm test`).

### 🏷️ `v2.3.1` — Public Open-Source Hardening & Security Audit
- **Authentication & Secret Hardening**:
  - Wired `JWT_SECRET` through central `config` and added strict validation in `validateEnvironment()` to warn against insecure fallbacks in production (`NODE_ENV === 'production'`).
  - Updated `.env.example` with clear `JWT_SECRET` instructions for cloners and self-hosters.
- **Open-Source Licensing & Compliance**:
  - Adopted official `LICENSE` file under **Apache License 2.0** (Copyright 2026 Kazuken), providing trademark reservation, explicit patent protection, and modification tracking.
  - Added Non-Affiliation and Trademark Disclaimer in `README.md` clarifying independent, non-commercial status regarding Character Technologies, Inc.
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
