# Master Test Infrastructure Specification: "My C.AI Universe"
**Document ID**: `TEST_INFRA-v2.6.1`  
**Target Architecture**: Next.js App Router Frontend (`localhost:3001`) ↔ Express v5.2 Backend & SQLite/Turso Database (`localhost:3000`)  
**Scope**: Full 32-Feature Inventory (`PROJECT.md § Feature Inventory`) across 4 Testing Tiers + Tier 5 Hardening  
**Integrity Level**: Production / Strict Determinism  

---

## 1. Executive Summary & Testing Philosophy

This document defines the comprehensive test infrastructure, methodology, and verification contracts for the Next.js migration of **My C.AI Universe**. Testing adheres to **black-box / opaque-box principles** operating exclusively against public software seams:
1. **Public HTTP Interface**: REST endpoints (`/api/*`) and Server-Sent Events (`/api/chat?stream=true`), accessible directly on port `3000` or through Next.js proxy rewrites on port `3001`.
2. **Synchronized State Seams**: Authentication tokens stored in `localStorage.cai_auth_token` and synchronized `cai_auth_token` cookies.
3. **Public Component & Route Contracts**: URL query-parameter deep linking, Suspense boundary isolation, and DOM accessibility cues.

### Core Testing Axioms
- **Zero Facade Tests**: Every test exercises real server, database, or client logic; no tautological assertions where expected values mirror output formulas.
- **Strict Independence & Self-Contained Isolation**: Every test scenario provisions its own ephemeral user, persona, character, or session fixture. No test relies on mutable state created by earlier tests.
- **Authoritative Expected Output Derivation**: Expected outputs are derived directly from the canonical backend implementation (`server.js`, `backend/controllers/`, `backend/models/`), SQL constraints, and documented HTTP contracts.
- **Progressive Testability**: Tests are designed to run against the backend standalone during early implementation milestones, and against the Next.js reverse proxy (`localhost:3001`) once the frontend is live.

---

## 2. Four-Tier Testing Methodology

Our testing framework applies a disciplined 4-Tier test engineering hierarchy:

```
┌─────────────────────────────────────────────────────────────────┐
│               Tier 4: Real-World Workloads                      │
│   (End-to-End User Journeys, Multi-Step Narrative Lifecycles)   │
├─────────────────────────────────────────────────────────────────┤
│            Tier 3: Cross-Feature Interactions                   │
│   (Pairwise Combinatorial, State Synchronization, Cascades)     │
├─────────────────────────────────────────────────────────────────┤
│         Tier 2: Boundary Value Analysis (BVA)                   │
│   (Length Extremes, Numeric Clamps, Unicode, Timing, Corner)    │
├─────────────────────────────────────────────────────────────────┤
│            Tier 1: Feature Coverage (TSL / CP)                  │
│   (Category-Partition Method: Positive & Negative Semantics)    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Tier 1: Feature Coverage via Category-Partition Method (TSL)
Every feature is decomposed into functional units, identifying parameter categories, equivalence classes, and environmental states. Each feature must have **at least 5 primary behavioral tests** covering the positive path and core expected rejection paths.

### 2.2 Tier 2: Boundary Value Analysis (BVA) & Corner Cases
Every feature is subjected to **at least 5 boundary/corner test cases**:
- Numeric limits (affinity `-100`, `0`, `+100`; strain `0`, `65`, `100`; rating `1..5`; take variants `0..N`).
- String limits (names `0`, `1`, `50`, `100`, `101` chars; taglines `300` chars; persona names `100` chars; chat messages `4000` chars).
- Format and character set corners (emojis, control characters, null bytes, HTML tags, unescaped quotes).
- Identity & state collisions (expired tokens, duplicate unique keys, non-existent foreign keys).

### 2.3 Tier 3: Pairwise Combinatorial & Cross-Feature Interactions
Validates state propagation across multiple interacting subsystems:
- Auth + Persona + Chat (Changing active default persona reflects immediately in narrative generation).
- Wiki Parser + Character Studio + Like + Chat (Scraped character is persisted, liked, chatted with, and maintains stats).
- Demeanor Engine + Takes Swiper + In-Chat `/update` (Switching message variants updates relationship trajectory without corrupting history).
- OTP Password Reset + Deep Link + Authentication (Reset token consumed via deep-link invalidates existing session and enforces re-login).

### 2.4 Tier 4: Real-World Workflows
End-to-end holistic scenarios exercising complete user journeys across multiple pages and state changes:
- **Workflow A (Full Onboarding to Live Stream)**: Sign-up → Profile setup → Custom Persona creation → Character creation → Chat initiation → SSE streaming token reception.
- **Workflow B (Emotional Dynamics & Director Override)**: Casual dialogue → Provocation / Strain accumulation → Breaking point threshold → Sincere apology & repair → Director manual override → Scene resume.
- **Workflow C (Complete Password Recovery Turnover)**: Forgot password request → 6-digit OTP issue → Deep-link code verification → Password reset → Immediate sign-in → Verification of previous password rejection.
- **Workflow D (Branching Storylines & Narrative Rewind)**: Multi-turn session → Alternate take generation → Turn editing → Turn pinning → Narrative rewind → Multi-thread history management.

---

## 3. The 32-Feature Testing Specification Matrix

Below is the exhaustive specification of all 32 features from `PROJECT.md § Feature Inventory`. Each feature specifies its public seam, Tier 1 test cases (≥5), and Tier 2 boundary test cases (≥5).

---

### Feature 1: Next.js App Router Scaffolding
- **Public Seam**: HTTP GET `/`, HTTP GET `/_next/*`, DOM root elements (`<html lang="en">`, `<body class="bg-canvas">`).
- **Tier 1 Tests**:
  1. `T1-F01-01`: GET `/` returns HTTP 200 with HTML document containing root layout container.
  2. `T1-F01-02`: App Router head metadata emits `<meta name="viewport" content="...">` and charset UTF-8.
  3. `T1-F01-03`: Global `Toaster` and notification mount points exist in root DOM structure.
  4. `T1-F01-04`: Client component boundary renders without React hydration mismatches on desktop viewports.
  5. `T1-F01-05`: Direct navigation to non-existent route returns 404 with custom dark-themed Not Found UI.
- **Tier 2 Boundary Cases**:
  1. `T2-F01-01`: Viewport resize to extreme mobile (320px width) maintains horizontal layout without overflow.
  2. `T2-F01-02`: Prerender behavior when JavaScript is disabled displays fallback semantic HTML.
  3. `T2-F01-03`: Rapid consecutive client-side router pushes (`router.push`) do not leak unhandled promises.
  4. `T2-F01-04`: Navigation with malformed URL characters (e.g. `/%c0%ae`) resolves cleanly to 400 or 404 without crashing.
  5. `T2-F01-05`: Concurrent route transitions during active background fetch cancel obsolete pending requests.

---

### Feature 2: Vanguard Dark Design Tokens
- **Public Seam**: CSS custom property evaluation, computed styles on `.double-bezel-shell`, `.double-bezel-core`, `data-theme`.
- **Tier 1 Tests**:
  1. `T1-F02-01`: Root CSS defines `--bg-canvas` (`#07070b`), `--bg-core` (`#0e0d16`), and `--accent` (`#8b5cf6`).
  2. `T1-F02-02`: `.double-bezel-shell` applies double-bezel concentric chassis with 1px border hairline.
  3. `T1-F02-03`: Interactive cursor spotlight tracks `--mouse-x` and `--mouse-y` coordinates on hover.
  4. `T1-F02-04`: Theme switcher updates `data-theme` attribute between `vanguard`, `higgsfield`, `editorial`, and `telemetry`.
  5. `T1-F02-05`: High-contrast elements meet WCAG AA contrast ratio (≥ 4.5:1) for primary text on core background.
- **Tier 2 Boundary Cases**:
  1. `T2-F02-01`: Pointer coordinates off-screen or negative do not throw runtime exceptions.
  2. `T2-F02-02`: Rapid theme cycling across 4 themes in <100ms transitions smoothly without CSS layout thrashing.
  3. `T2-F02-03`: Fallback fonts (`-apple-system, sans-serif`) activate if Google Fonts fail or are blocked.
  4. `T2-F02-04`: Ambient radial gradient mesh handles extreme aspect ratios (32:9 ultra-wide and 9:16 mobile).
  5. `T2-F02-05`: `prefers-reduced-motion` media query disables kinetic aurora background animations.

---

### Feature 3: API Proxy & CORS Configuration
- **Public Seam**: `http://localhost:3001/api/*` and `http://localhost:3001/assets/avatars/*`.
- **Tier 1 Tests**:
  1. `T1-F03-01`: GET `/api/system/ping` through port 3001 proxies to Express and returns `{ status: "ok" }`.
  2. `T1-F03-02`: GET `/assets/avatars/default.png` proxies seamlessly to Express media asset server.
  3. `T1-F03-03`: Client-injected `Authorization: Bearer <token>` header passes unmutated through the proxy.
  4. `T1-F03-04`: Next.js proxy preserves `Content-Type: application/json` on POST request bodies.
  5. `T1-F03-05`: Next.js proxy passes through `Accept: text/event-stream` without response buffering.
- **Tier 2 Boundary Cases**:
  1. `T2-F03-01`: Large POST payload (9.9MB, below 10MB limit) proxies successfully without socket truncation.
  2. `T2-F03-02`: Payload exceeding 10MB returns HTTP 413 Payload Too Large from backend.
  3. `T2-F03-03`: Deeply nested query parameters (e.g. `/api/characters?search=a%26b%3Dc`) proxy without double-encoding.
  4. `T2-F03-04`: Request to backend when Express server is down returns 502 Bad Gateway gracefully.
  5. `T2-F03-05`: CORS preflight `OPTIONS` requests from allowed origins return correct Access-Control headers.

---

### Feature 4: Typed API Client & Token Storage
- **Public Seam**: `lib/api.ts`, `lib/auth.ts`, `localStorage.getItem('cai_auth_token')`, cookie `cai_auth_token`.
- **Tier 1 Tests**:
  1. `T1-F04-01`: `setAuthToken(token)` stores token in `localStorage` and synchronizes browser cookie.
  2. `T1-F04-02`: `getAuthToken()` extracts token with preference for `localStorage`.
  3. `T1-F04-03`: `clearAuthToken()` purges token from both `localStorage` and cookie.
  4. `T1-F04-04`: `api.get()` automatically attaches `Authorization: Bearer <token>` when token is present.
  5. `T1-F04-05`: API client throws typed `ApiError` with status code and error message on HTTP error responses.
- **Tier 2 Boundary Cases**:
  1. `T2-F04-01`: Storage operations succeed when `localStorage` is disabled or throws `SecurityError` (SSR/private mode).
  2. `T2-F04-02`: Token containing special base64url characters (`-`, `_`) persists without corruption.
  3. `T2-F04-03`: Malformed or expired JWT token is cleanly caught and triggers automatic auth reset.
  4. `T2-F04-04`: Handling concurrent API requests during token invalidation prevents unhandled promise rejections.
  5. `T2-F04-05`: API request timeout handling aborts fetch via `AbortController` after deadline.

---

### Feature 5: Global Auth Context & Layout
- **Public Seam**: `context/auth-context.tsx`, `useAuth()`, navbar user pill rendering, session hydration.
- **Tier 1 Tests**:
  1. `T1-F05-01`: Initial mount with no token renders layout in guest state with "Sign In" button.
  2. `T1-F05-02`: Initial mount with valid token initiates `GET /api/auth/me` and hydrates `user` object.
  3. `T1-F05-03`: `login(credentials)` updates context state `isAuthenticated: true` and renders user avatar.
  4. `T1-F05-04`: `logout()` dispatches state clear, redirects to `/auth`, and resets user state to `null`.
  5. `T1-F05-05`: Protected route wrapper blocks unauthenticated clients and redirects to `/auth?return=...`.
- **Tier 2 Boundary Cases**:
  1. `T2-F05-01`: `GET /api/auth/me` returning 401 triggers clean logout without redirect loops.
  2. `T2-F05-02`: User with missing optional fields (`displayName`, `avatar`) renders fallback initials monogram.
  3. `T2-F05-03`: Multiple browser tabs open: token deletion in one tab reflects on next user action.
  4. `T2-F05-04`: Server latency on `/api/auth/me` renders subtle skeleton pulse without flash of unauthenticated content.
  5. `T2-F05-05`: Context hydration safely handles corrupted JSON in storage.

---

### Feature 6: User Registration
- **Public Seam**: `POST /api/auth/register`, payload `{ username, password, displayName, avatar }`.
- **Tier 1 Tests**:
  1. `T1-F06-01`: Valid registration returns HTTP 201 with `{ user, token }`.
  2. `T1-F06-02`: Registration automatically provisions a starter `UserPersona` marked `isDefault: true`.
  3. `T1-F06-03`: Registering with existing username (case-insensitive) returns HTTP 409 Conflict.
  4. `T1-F06-04`: Registering with reserved handles (`admin`, `community`, `system`) returns HTTP 400.
  5. `T1-F06-05`: Stored user password in SQL is hashed with scrypt (`salt:hex`) and never stored in plain text.
- **Tier 2 Boundary Cases**:
  1. `T2-F06-01`: Username boundary: minimum 3 chars accepted, 2 chars rejected with HTTP 400.
  2. `T2-F06-02`: Username boundary: 30 chars accepted, 31 chars rejected with HTTP 400.
  3. `T2-F06-03`: Password boundary: 6 chars accepted, 5 chars rejected with HTTP 400.
  4. `T2-F06-04`: Username containing special characters (`<script>`, spaces, punctuation) is rejected with HTTP 400.
  5. `T2-F06-05`: Unicode display name (e.g. Japanese kanji, emojis `✨Hero✨`) registers and persists verbatim.

---

### Feature 7: User Sign-In
- **Public Seam**: `POST /api/auth/login`, payload `{ username, password }`.
- **Tier 1 Tests**:
  1. `T1-F07-01`: Correct credentials return HTTP 200 with user profile and valid JWT token.
  2. `T1-F07-02`: Incorrect password returns HTTP 401 with generic error message.
  3. `T1-F07-03`: Non-existent username returns HTTP 401 with timing-safe error response.
  4. `T1-F07-04`: Missing password or username field returns HTTP 400 Bad Request.
  5. `T1-F07-05`: Successful login preserves return URL and initiates client redirection.
- **Tier 2 Boundary Cases**:
  1. `T2-F07-01`: Case insensitivity: registering as `PilotUser` allows login as `pilotuser`.
  2. `T2-F07-02`: Password containing leading/trailing whitespace is preserved accurately by the scrypt verifier.
  3. `T2-F07-03`: SQL injection payloads in username/password field return 401 without SQL errors.
  4. `T2-F07-04`: Brute-force rate limiting triggers HTTP 429 Too Many Requests after threshold.
  5. `T2-F07-05`: Password with maximum supported length (1024 chars) completes hashing without timing out.

---

### Feature 8: Password Reset: OTP Request
- **Public Seam**: `POST /api/auth/forgot-password`, payload `{ email }`.
- **Tier 1 Tests**:
  1. `T1-F08-01`: Request with registered email generates 6-digit numeric OTP and returns `{ success: true }`.
  2. `T1-F08-02`: OTP record is inserted into `password_resets` table with 15-minute TTL expiration.
  3. `T1-F08-03`: In development mode, response includes `previewCode` field for verification.
  4. `T1-F08-04`: Request with unregistered email returns HTTP 404 with "No user found with this email".
  5. `T1-F08-05`: Request with malformed email format returns HTTP 400 Validation Error.
- **Tier 2 Boundary Cases**:
  1. `T2-F08-01`: Email with mixed casing (`User@Universe.AI`) matches stored lowercase email.
  2. `T2-F08-02`: Multiple reset requests in rapid succession invalidate previous OTPs, leaving only newest active.
  3. `T2-F08-03`: Email address at max boundary length (254 chars) processes correctly.
  4. `T2-F08-04`: Sensitive endpoint rate limiter throttles repeated requests from same IP.
  5. `T2-F08-05`: Email with plus-addressing (e.g. `user+reset@domain.com`) matches exact stored address.

---

### Feature 9: Password Reset: Code Verification & Update
- **Public Seam**: `POST /api/auth/verify-code` and `POST /api/auth/reset-password`.
- **Tier 1 Tests**:
  1. `T1-F09-01`: `POST /api/auth/verify-code` with valid 6-digit OTP returns `{ valid: true }`.
  2. `T1-F09-02`: `POST /api/auth/reset-password` updates password and invalidates used OTP record.
  3. `T1-F09-03`: Submitting incorrect 6-digit code returns HTTP 400 "Invalid or expired code".
  4. `T1-F09-04`: Submitting an expired OTP (>15 minutes) returns HTTP 400.
  5. `T1-F09-05`: Logging in with old password fails (401), while new password succeeds (200).
- **Tier 2 Boundary Cases**:
  1. `T2-F09-01`: Submitting non-numeric code (e.g. `ABC123`) returns HTTP 400.
  2. `T2-F09-02`: Submitting code with length != 6 (e.g. 5 digits or 7 digits) returns HTTP 400.
  3. `T2-F09-03`: Re-using the same OTP a second time returns HTTP 400 "Invalid or expired code".
  4. `T2-F09-04`: New password boundary: 6 chars succeeds, 5 chars returns HTTP 400.
  5. `T2-F09-05`: Resetting password for an account that does not exist returns HTTP 404.

---

### Feature 10: Password Reset: Deep Link Support
- **Public Seam**: App route `/reset-password?email=...&code=...`, Suspense boundary.
- **Tier 1 Tests**:
  1. `T1-F10-01`: Visiting `/reset-password` without query params renders Step 1 (Request Code form).
  2. `T1-F10-02`: Visiting `/reset-password?email=test%40universe.ai&code=123456` automatically opens Step 2.
  3. `T1-F10-03`: Deep-link pre-populates email input and 6-digit code input in the DOM.
  4. `T1-F10-04`: Component is wrapped in React `<Suspense>` boundary to prevent App Router SSR prerender failure.
  5. `T1-F10-05`: User can immediately type new password and click submit without re-requesting code.
- **Tier 2 Boundary Cases**:
  1. `T2-F10-01`: URL contains email only: renders Step 1 with email pre-filled.
  2. `T2-F10-02`: URL contains code only: renders Step 2 with code pre-filled and email empty.
  3. `T2-F10-03`: URL contains encoded special characters in email (`%2B`, `%40`) decoded cleanly.
  4. `T2-F10-04`: Deep link with invalid OTP displays inline error on Step 2 with link to re-request code.
  5. `T2-F10-05`: Deep-link navigation during active login session displays modal confirmation.

---

### Feature 11: User Profile Management
- **Public Seam**: `PUT /api/auth/profile`, payload `{ displayName, username, avatar }`.
- **Tier 1 Tests**:
  1. `T1-F11-01`: Authenticated user updates `displayName` successfully and receives updated user JSON.
  2. `T1-F11-02`: Authenticated user updates `username` and updates session reference.
  3. `T1-F11-03`: Updating username to one already claimed by another user returns HTTP 409 Conflict.
  4. `T1-F11-04`: Request without authentication token returns HTTP 401 Unauthorized.
  5. `T1-F11-05`: Updated profile data persists in SQLite and is reflected in subsequent `GET /api/auth/me`.
- **Tier 2 Boundary Cases**:
  1. `T2-F11-01`: `displayName` at boundary length: 50 chars accepted, 51 chars returns HTTP 400.
  2. `T2-F11-02`: `username` at boundary length: 30 chars accepted, 31 chars returns HTTP 400.
  3. `T2-F11-03`: Empty or whitespace-only `displayName` is rejected with HTTP 400.
  4. `T2-F11-04`: Modifying read-only fields (`role`, `id`, `createdAt`) via mass-assignment is ignored by server.
  5. `T2-F11-05`: Unicode emojis in display name (`Commander 🛡️`) update and render accurately.

---

### Feature 12: Avatar Upload & Storage
- **Public Seam**: `POST /api/auth/upload-avatar` (or `/api/upload/avatar`), payload `{ image: "data:image/png;base64,..." }`.
- **Tier 1 Tests**:
  1. `T1-F12-01`: Valid PNG data URL upload returns HTTP 200 with `{ url, filename, size }`.
  2. `T1-F12-02`: Uploaded file is written to `frontend/assets/avatars/` and persisted to `media_assets` SQL table.
  3. `T1-F12-03`: Requesting uploaded avatar via `GET /assets/avatars/:filename` returns binary image data.
  4. `T1-F12-04`: Invalid image format (e.g. `data:text/plain;base64,...`) returns HTTP 400.
  5. `T1-F12-05`: Non-base64 payload returns HTTP 400 Bad Request.
- **Tier 2 Boundary Cases**:
  1. `T2-F12-01`: Payload exceeding 5MB returns HTTP 400 or 413.
  2. `T2-F12-02`: Corrupted base64 payload returns HTTP 400 without crashing Node process.
  3. `T2-F12-03`: Supported formats: PNG, JPEG, WebP, GIF all succeed with correct MIME types.
  4. `T2-F12-04`: Image with 1x1 pixel boundary dimension processes and stores correctly.
  5. `T2-F12-05`: Dynamic media fallback route serves avatar from SQL table if local file was deleted from disk.

---

### Feature 13: Roleplay Persona Roster
- **Public Seam**: `GET /api/personas`, `POST /api/personas`, `PUT /api/personas/:id`, `DELETE /api/personas/:id`.
- **Tier 1 Tests**:
  1. `T1-F13-01`: GET `/api/personas` lists all custom personas belonging to the current user.
  2. `T1-F13-02`: POST `/api/personas` creates new persona with name, description, avatar.
  3. `T1-F13-03`: PUT `/api/personas/:id` modifies persona details.
  4. `T1-F13-04`: DELETE `/api/personas/:id` removes persona from database.
  5. `T1-F13-05`: Multi-tenant isolation: User B cannot view, edit, or delete User A's personas (HTTP 403/404).
- **Tier 2 Boundary Cases**:
  1. `T2-F13-01`: Persona name boundary: 100 chars accepted, 101 chars returns HTTP 400.
  2. `T2-F13-02`: Persona description boundary: 2000 chars accepted, 2001 chars returns HTTP 400.
  3. `T2-F13-03`: Deleting the last remaining persona for a user is blocked with HTTP 400.
  4. `T2-F13-04`: Attempting to create persona with empty name returns HTTP 400.
  5. `T2-F13-05`: Creating persona with emoji avatar monogram persists accurately.

---

### Feature 14: Default Persona Assignment
- **Public Seam**: `PUT /api/personas/:id` `{ isDefault: true }`, session prompt injection verification.
- **Tier 1 Tests**:
  1. `T1-F14-01`: Marking Persona X as default sets `isDefault: 1` on X and clears `isDefault: 0` on other user personas.
  2. `T1-F14-02`: Creating the first persona for a user automatically assigns `isDefault: true`.
  3. `T1-F14-03`: Active default persona is pre-selected in chat interface persona dropdown.
  4. `T1-F14-04`: In-chat prompt compiler incorporates default persona's name and description into system instruction.
  5. `T1-F14-05`: Deleting active default persona automatically promotes the oldest remaining persona to default.
- **Tier 2 Boundary Cases**:
  1. `T2-F14-01`: Setting `isDefault: true` on an already default persona is idempotent.
  2. `T2-F14-02`: Setting default persona when user has 20+ personas executes atomic SQL transaction.
  3. `T2-F14-03`: Guest / unauthenticated user falls back to guest starter persona.
  4. `T2-F14-04`: Inactive persona can be explicitly selected per chat session without altering global default.
  5. `T2-F14-05`: Modifying default persona mid-session updates prompt context on subsequent turn.

---

### Feature 15: Character Discovery Catalog
- **Public Seam**: `GET /api/characters?search=...&category=...&sort=...`, directory page UI.
- **Tier 1 Tests**:
  1. `T1-F15-01`: GET `/api/characters` returns array of public character summaries with status 200.
  2. `T1-F15-02`: `?search=Gojo` filters characters matching name, tagline, or personality.
  3. `T1-F15-03`: `?category=Anime` filters characters containing category 'Anime' (case-insensitive).
  4. `T1-F15-04`: `?sort=popular` orders characters by interactions descending.
  5. `T1-F15-05`: `?sort=likes` orders characters by like count descending.
- **Tier 2 Boundary Cases**:
  1. `T2-F15-01`: Search query with no matches returns empty array `[]` with status 200 (not 404).
  2. `T2-F15-02`: Search query containing regex meta-characters (`.*`, `[`, `(`, `\`) executes literal search.
  3. `T2-F15-03`: Empty search string `?search=` returns all characters without error.
  4. `T2-F15-04`: Filtering by multiple categories or unknown category returns empty array gracefully.
  5. `T2-F15-05`: Catalog pagination / slicing handles large character catalogs (>100 characters).

---

### Feature 16: Asymmetric Bento Character Grid
- **Public Seam**: `.bento-character-grid`, `getBentoSpanClass()`, DOM card structure.
- **Tier 1 Tests**:
  1. `T1-F16-01`: Bento grid renders cards inside 12-column CSS grid container.
  2. `T1-F16-02`: Leading card (index 0) receives 8-column wide span class (`col-span-12 lg:col-span-8`).
  3. `T1-F16-03`: Standard cards receive 4-column span classes (`col-span-12 sm:col-span-6 lg:col-span-4`).
  4. `T1-F16-04`: Character card displays avatar image, character name, creator handle, and top category badges.
  5. `T1-F16-05`: Clicking card "Enter Scene" navigates to `/chat/[id]`.
- **Tier 2 Boundary Cases**:
  1. `T2-F16-01`: Grid with single character (count = 1) renders wide card cleanly without layout collapse.
  2. `T2-F16-02`: Character with long name (>50 chars) truncates with ellipsis without overflowing card boundary.
  3. `T2-F16-03`: Character with 0 categories renders card without empty badge container.
  4. `T2-F16-04`: Missing avatar URL gracefully falls back to DiceBear identicon or default SVG avatar.
  5. `T2-F16-05`: Mobile viewport (375px width) stacks all cards full-width (`col-span-12`).

---

### Feature 17: Character Like Interaction
- **Public Seam**: `POST /api/character/:id/like`.
- **Tier 1 Tests**:
  1. `T1-F17-01`: POST `/api/character/:id/like` toggles character like from unliked to liked (`isLiked: true`).
  2. `T1-F17-02`: Liking character increments character's `likes` counter by 1.
  3. `T1-F17-03`: Second POST `/api/character/:id/like` unlikes character (`isLiked: false`) and decrements counter by 1.
  4. `T1-F17-04`: Heart icon in UI updates fill state (`ph-fill` vs `ph-light` or `fill-accent`).
  5. `T1-F17-05`: Liking a non-existent character ID returns HTTP 404 Not Found.
- **Tier 2 Boundary Cases**:
  1. `T2-F17-01`: Rapid consecutive clicks (<200ms) debounce requests or maintain consistent counter state.
  2. `T2-F17-02`: Counter decrement is clamped at 0 and can never become negative.
  3. `T2-F17-03`: Like state persists across page reload when authenticated.
  4. `T2-F17-04`: Unauthenticated client toggling like stores temporary like state in client session.
  5. `T2-F17-05`: Updated like count is immediately reflected in `GET /api/characters?sort=likes`.

---

### Feature 18: Character Studio Editor
- **Public Seam**: `POST /api/character`, `PUT /api/character/:id`, `DELETE /api/character/:id`.
- **Tier 1 Tests**:
  1. `T1-F18-01`: POST `/api/character` with 15 schema fields creates character and returns HTTP 201.
  2. `T1-F18-02`: Created character assigns creator handle and `ownerUserId` to authenticated user.
  3. `T1-F18-03`: PUT `/api/character/:id` updates character fields when invoked by owner.
  4. `T1-F18-04`: PUT `/api/character/:id` by non-owner returns HTTP 403 Forbidden.
  5. `T1-F18-05`: DELETE `/api/character/:id` deletes character and cascades related sessions and memories.
- **Tier 2 Boundary Cases**:
  1. `T2-F18-01`: Field length boundaries: name max 100, tagline max 300; payloads exceeding limits return 400.
  2. `T2-F18-02`: Personality and background fields accept up to 5000 chars; 5001 chars returns HTTP 400.
  3. `T2-F18-03`: Initial affinity accepts integer between -100 and +100; out-of-range value returns 400.
  4. `T2-F18-04`: Creating character with empty name returns HTTP 400.
  5. `T2-F18-05`: Admin user can update or delete characters owned by any user (RBAC verification).

---

### Feature 19: Wiki Lore Auto-Extraction
- **Public Seam**: `POST /api/character/parse-wiki`, payload `{ url }`.
- **Tier 1 Tests**:
  1. `T1-F19-01`: Submitting valid Fandom/Wikipedia URL extracts character name, background, personality.
  2. `T1-F19-02`: Extracted data populates Character Studio form inputs automatically.
  3. `T1-F19-03`: Submitting local IP address (`http://127.0.0.1:3000/secret`) returns HTTP 400 (SSRF defense).
  4. `T1-F19-04`: Submitting private network IP (`http://192.168.1.1` or `http://10.0.0.1`) returns HTTP 400.
  5. `T1-F19-05`: Submitting non-HTTP protocol (`file:///etc/passwd`, `gopher://...`) returns HTTP 400.
- **Tier 2 Boundary Cases**:
  1. `T2-F19-01`: Submitting domain with spoofed substring (`http://fandom.com.attacker.com`) returns HTTP 400.
  2. `T2-F19-02`: Target page returning 404 or 500 returns clean HTTP 400 error message without crash.
  3. `T2-F19-03`: Wiki article with large DOM tree parses within 10-second timeout.
  4. `T2-F19-04`: Wiki article with unicode Japanese/accented characters decodes with UTF-8 fidelity.
  5. `T2-F19-05`: Empty URL parameter returns HTTP 400 Validation Error.

---

### Feature 20: AI Character Concept Synthesizer
- **Public Seam**: `POST /api/character/generate`, payload `{ concept }`.
- **Tier 1 Tests**:
  1. `T1-F20-01`: Submitting brief concept (e.g. "Cynical cyberpunk detective in Neo Tokyo") returns full profile JSON.
  2. `T1-F20-02`: Response includes generated name, tagline, greeting, personality, abilities, and speaking style.
  3. `T1-F20-03`: Generated profile includes automatic avatar seed URL (DiceBear or preset).
  4. `T1-F20-04`: Submitting concept < 3 characters returns HTTP 400 Bad Request.
  5. `T1-F20-05`: Generated profile passes character creation schema validation.
- **Tier 2 Boundary Cases**:
  1. `T2-F20-01`: Very long concept prompt (2000 chars) handles input truncation gracefully.
  2. `T2-F20-02`: Handling AI provider failure or rate limit returns graceful HTTP 500/503 with fallback template.
  3. `T2-F20-03`: Generated greeting includes scene-setting asterisks `*action*` and spoken dialogue.
  4. `T2-F20-04`: Generated categories array contains valid, non-empty category strings.
  5. `T2-F20-05`: Keystroke synthesizes concept without locking UI thread.

---

### Feature 21: Sticky Live Dossier Preview
- **Public Seam**: `.sticky-preview-shell`, reactive DOM updates on form input events.
- **Tier 1 Tests**:
  1. `T1-F21-01`: Typing into Character Name input immediately updates preview title text.
  2. `T1-F21-02`: Typing into Tagline input immediately updates preview tagline text.
  3. `T1-F21-03`: Updating avatar URL updates preview image src attribute.
  4. `T1-F21-04`: Selecting categories updates preview category pills.
  5. `T1-F21-05`: Updating starting affinity updates preview relationship badge and progress track.
- **Tier 2 Boundary Cases**:
  1. `T2-F21-01`: Rapid typing (keystrokes < 50ms) updates preview without memory leaks.
  2. `T2-F21-02`: Clearing all input fields reverts preview to placeholder states.
  3. `T2-F21-03`: Preview container stays fixed/sticky in desktop viewport during form scroll.
  4. `T2-F21-04`: Mobile view collapses preview into collapsible drawer or bottom sheet.
  5. `T2-F21-05`: XSS injection strings in name/tagline (`<img src=x onerror=alert(1)>`) render escaped as plain text.

---

### Feature 22: Narrative Chat Session Management
- **Public Seam**: `POST /api/chats`, `GET /api/chats`, `GET /api/chats/:id`, `DELETE /api/chats/:id`.
- **Tier 1 Tests**:
  1. `T1-F22-01`: POST `/api/chats` with `{ characterId }` creates new session seeded with character greeting.
  2. `T1-F22-02`: Created session initializes default relationship metrics matching character configuration.
  3. `T1-F22-03`: GET `/api/chats/:id` returns complete conversation history with messages and variants.
  4. `T1-F22-04`: DELETE `/api/chats/:id` deletes session and cascades messages.
  5. `T1-F22-05`: User isolation: accessing another user's private session returns HTTP 404/403.
- **Tier 2 Boundary Cases**:
  1. `T2-F22-01`: Creating chat session with non-existent `characterId` returns HTTP 404.
  2. `T2-F22-02`: Unauthenticated request to `/api/chats` returns HTTP 401 Unauthorized.
  3. `T2-F22-03`: Session with >100 messages hydrates without payload truncation.
  4. `T2-F22-04`: Creating session with explicit `personaId` binds persona to session.
  5. `T2-F22-05`: Deleting non-existent session ID returns HTTP 404.

---

### Feature 23: Real-Time SSE Token Streaming
- **Public Seam**: `POST /api/chat?stream=true` (or `Accept: text/event-stream`), Server-Sent Events stream.
- **Tier 1 Tests**:
  1. `T1-F23-01`: Request with `stream=true` returns response header `Content-Type: text/event-stream`.
  2. `T1-F23-02`: Emits incremental token chunks formatted as `data: {"token": "..."}\n\n`.
  3. `T1-F23-03`: Emits final completion event formatted as `data: {"done": true, "sessionId": ...}\n\n`.
  4. `T1-F23-04`: Client renders live pulsing cursor (`▌`) during token generation.
  5. `T1-F23-05`: Completed stream closes connection cleanly with `res.end()`.
- **Tier 2 Boundary Cases**:
  1. `T2-F23-01`: Stream tail holdback filter buffers potential `[[REL_STATE:` tag beginnings and strips them cleanly.
  2. `T2-F23-02`: Client abort (`AbortController.abort()`) terminates upstream AI generation.
  3. `T2-F23-03`: Sending message exceeding 4000 chars returns HTTP 400 before stream initiation.
  4. `T2-F23-04`: Empty prompt string returns HTTP 400 Bad Request.
  5. `T2-F23-05`: Network disconnect during streaming triggers client error toast and retry prompt.

---

### Feature 24: Demeanor Bar & Relationship Dynamics
- **Public Seam**: `#chatRelationshipBar`, `ChatMessage.relationship`, `RelationshipMetrics`.
- **Tier 1 Tests**:
  1. `T1-F24-01`: Relationship bar displays affinity score (-100 to +100), trust score, and conflict strain.
  2. `T1-F24-02`: Relationship stage resolves to one of 11 distinct canonical stages.
  3. `T1-F24-03`: Relationship mood displays emotional weather pill (e.g. "Calm", "Warm", "Flustered").
  4. `T1-F24-04`: Emotional inertia protects established affinity against sudden swings from small talk.
  5. `T1-F24-05`: Stage hysteresis: Lovers maintain 'Deep Love' stage even when affinity temporarily dips.
- **Tier 2 Boundary Cases**:
  1. `T2-F24-01`: Strain threshold: accumulated strain ≥ 65 breaches breaking point dynamics.
  2. `T2-F24-02`: Sincere apology after high strain discharges conflict with Catharsis bonus and "Tender / Reconciled" mood.
  3. `T2-F24-03`: Anti-inflation clamp prevents passive small talk from exceeding stage ceilings without milestone breakthrough.
  4. `T2-F24-04`: Trust-gated slow burn holds affinity at 58 until trust reaches ≥ 50 before unlocking Crush.
  5. `T2-F24-05`: Negative trust integrity: abusive messages decrement trust score.

---

### Feature 25: Relationship Director Popover
- **Public Seam**: `#chatRelationshipPopover`, `PUT /api/chats/:sessionId/relationship`.
- **Tier 1 Tests**:
  1. `T1-F25-01`: Clicking demeanor bar opens Director Popover displaying sliders and controls.
  2. `T1-F25-02`: Selecting a stage preset (e.g. 'Crush (+65)', 'Nemesis (-85)') updates slider values.
  3. `T1-F25-03`: Clicking "Repair Strain" resets conflict strain to 0.
  4. `T1-F25-04`: Submitting `PUT /api/chats/:sessionId/relationship` persists updated metrics to SQL database.
  5. `T1-F25-05`: Next narrative turn incorporates overridden relationship stage into prompt mandate.
- **Tier 2 Boundary Cases**:
  1. `T2-F25-01`: Slider boundary values: affinity clamps strictly between -100 and +100.
  2. `T2-F25-02`: Strain slider clamps strictly between 0 and 100.
  3. `T2-F25-03`: Custom mood input with special characters is sanitized before database write.
  4. `T2-F25-04`: Non-owner attempting to modify session relationship returns HTTP 403/404.
  5. `T2-F25-05`: Closing popover without clicking "Apply" discards uncommitted slider changes.

---

### Feature 26: Takes Variant Swiper
- **Public Seam**: `.variant-swiper`, `[data-regen-msg]`, `PUT /api/chats/:sessionId/messages/:messageId`.
- **Tier 1 Tests**:
  1. `T1-F26-01`: Character response renders pagination indicator (`Take 1/1`).
  2. `T1-F26-02`: Clicking Reshoot button calls `POST /api/chat` with `regenerate: true` and appends new variant.
  3. `T1-F26-03`: Indicator increments to `Take 2/2` upon completion of reshoot.
  4. `T1-F26-04`: Clicking "Previous Take" switches visible message text to Take 1.
  5. `T1-F26-05`: Selected variant index syncs to server via `PUT /api/chats/:sessionId/messages/:messageId`.
- **Tier 2 Boundary Cases**:
  1. `T2-F26-01`: Reshoot prompt passes `excludeVariants` list to ensure alternative take is meaningfully distinct.
  2. `T2-F26-02`: Swiping past boundary (Previous on Take 1, or Next on Take N) is disabled.
  3. `T2-F26-03`: Rapid take switching debounces API PUT calls to prevent race conditions.
  4. `T2-F26-04`: Keyboard arrow navigation (Left/Right) operates variant swiper when focused.
  5. `T2-F26-05`: Message with 10+ variants swiper pages smoothly without DOM memory leaks.

---

### Feature 27: Message Interaction Tools
- **Public Seam**: `[data-pin-msg]`, `[data-edit-msg]`, `[data-rewind-msg]`, `[data-tts-msg]`, `POST /api/chats/:sessionId/rewind`.
- **Tier 1 Tests**:
  1. `T1-F27-01`: Clicking pin icon toggles `isPinned: true` and adds message to pinned context list.
  2. `T1-F27-02`: Inline edit opens textarea, updates content, and persists edit via PUT request.
  3. `T1-F27-03`: Clicking rewind prompts confirmation, calls `/rewind`, and slices history back to target turn.
  4. `T1-F27-04`: TTS button activates `window.speechSynthesis` and animates voice wave visualizer.
  5. `T1-F27-05`: Copy button copies plain dialogue text to system clipboard.
- **Tier 2 Boundary Cases**:
  1. `T2-F27-01`: Rewinding to the very first opening greeting preserves greeting without clearing entire chat.
  2. `T2-F27-02`: Pinned turns are prioritized in LLM context assembly during long conversations.
  3. `T2-F27-03`: Inline edit rejecting empty message content.
  4. `T2-F27-04`: Rewinding with non-existent message ID returns HTTP 404.
  5. `T2-F27-05`: Speech synthesis handles roleplay text by speaking only dialogue and omitting asterisk stage directions.

---

### Feature 28: Autonomous Scene Continuation
- **Public Seam**: `#continueBtn`, `POST /api/chat` with `{ continue: true }`.
- **Tier 1 Tests**:
  1. `T1-F28-01`: Clicking "Continue" button prompts character to advance narrative without user text input.
  2. `T1-F28-02`: Pressing Enter on empty message composer triggers scene continuation.
  3. `T1-F28-03`: Server receives `{ continue: true, lastMessage: ... }` and synthesizes seamless narrative progression.
  4. `T1-F28-04`: Consecutive model messages are merged cleanly in session history or presented as continuous scene.
  5. `T1-F28-05`: Demeanor appraisal evaluates character's autonomous narrative progression.
- **Tier 2 Boundary Cases**:
  1. `T2-F28-01`: Invoking continue on newly created session (only opening greeting exists) advances scene logically.
  2. `T2-F28-02`: Multiple rapid continue clicks disable button while generation is in flight.
  3. `T2-F28-03`: Scene continuation respects active demeanor stage mandates (e.g. Hostile character maintains distance).
  4. `T2-F28-04`: Continue action when AI provider is rate-limited presents retry option.
  5. `T2-F28-05`: Continue action works identically in SSE streaming mode.

---

### Feature 29: Memory Notebook & Dossier Drawer
- **Public Seam**: `GET /api/memories`, `POST /api/memories`, `DELETE /api/memories/:id`, `#chat-right-drawer`.
- **Tier 1 Tests**:
  1. `T1-F29-01`: Opening right drawer displays character lore dossier, personality, and abilities.
  2. `T1-F29-02`: Memory pane lists storyline chronicle and long-term memories retrieved from SQL.
  3. `T1-F29-03`: Submitting "Add Memory" form creates new memory record via `POST /api/memories`.
  4. `T1-F29-04`: Pinned dialogue turns are highlighted in memory notebook.
  5. `T1-F29-05`: Context-aware short-query memory enrichment injects relevant memories into LLM prompt.
- **Tier 2 Boundary Cases**:
  1. `T2-F29-01`: Adding memory with content > 2000 chars returns HTTP 400.
  2. `T2-F29-02`: Deleting character cascades and purges all associated long-term memories from SQL.
  3. `T2-F29-03`: Non-owner attempting to insert memory for private character returns HTTP 403.
  4. `T2-F29-04`: Empty memory content submission is blocked with HTTP 400.
  5. `T2-F29-05`: Memory drawer tab switching between Lore, Memories, and Threads preserves scroll position.

---

### Feature 30: Saved Storyline Threads Page
- **Public Seam**: `/chats`, `GET /api/chats`, thread cards, resume button, delete thread button.
- **Tier 1 Tests**:
  1. `T1-F30-01`: Navigating to `/chats` displays all persisted chat sessions belonging to the user.
  2. `T1-F30-02`: Thread card displays character avatar, character name, last message snippet, and relative timestamp.
  3. `T1-F30-03`: Card displays message turn count badge.
  4. `T1-F30-04`: Clicking "Resume Scene" navigates to `/chat/[id]?session=[sessionId]`.
  5. `T1-F30-05`: Clicking delete thread icon removes session and refreshes thread roster.
- **Tier 2 Boundary Cases**:
  1. `T2-F30-01`: User with zero saved threads displays empty state with "Browse Characters" CTA.
  2. `T2-F30-02`: Relative time formatting displays accurate strings ("just now", "5m ago", "2h ago", "yesterday").
  3. `T2-F30-03`: Thread with 500+ turns renders summary badge without slowing page render.
  4. `T2-F30-04`: Deleted thread is immediately excluded from sidebar recent threads list.
  5. `T2-F30-05`: Unauthenticated visit to `/chats` redirects to `/auth`.

---

### Feature 31: Full E2E Test Suite Execution
- **Public Seam**: Test runner entry point, exit code, structured JSON/TAP report.
- **Tier 1 Tests**:
  1. `T1-F31-01`: Test runner executes all Tier 1-4 suites against active server.
  2. `T1-F31-02`: Test runner exits with status code 0 on complete suite success.
  3. `T1-F31-03`: Test runner logs total executed assertions and timing breakdown per suite.
  4. `T1-F31-04`: Automatic ephemeral test fixture cleanup runs in `finally` block even on test failure.
  5. `T1-F31-05`: Test runner supports `TEST_BASE_URL` override targeting either port 3000 or port 3001.
- **Tier 2 Boundary Cases**:
  1. `T2-F31-01`: Running test suite when server is stopped automatically spawns in-process server or emits clear error.
  2. `T2-F31-02`: Individual test assertion failure halts affected scenario without aborting entire test runner.
  3. `T2-F31-03`: Concurrent test execution with unique test tenant prefixes (`spec_user_...`) avoids database collision.
  4. `T2-F31-04`: Test execution in restricted CI environment without internet access utilizes mock/local AI fallback.
  5. `T2-F31-05`: Zero memory leaks during execution of 200+ consecutive HTTP/SSE assertions.

---

### Feature 32: Adversarial Hardening (Tier 5)
- **Public Seam**: Security middlewares, input sanitizers, RBAC interceptors, rate limiters.
- **Tier 1 Tests**:
  1. `T1-F32-01`: Security headers active: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
  2. `T1-F32-02`: Rate limiting active: exceeding 15 req/min on `/api/auth/*` triggers HTTP 429.
  3. `T1-F32-03`: Admin Web Gatekeeper blocks unauthenticated access to `/admin` with 302/403.
  4. `T1-F32-04`: IDOR defense: User A cannot mutate User B's character, persona, or memory (HTTP 403).
  5. `T1-F32-05`: Mass assignment defense: client-injected `role: "admin"` in register/profile payload is discarded.
- **Tier 2 Boundary Cases**:
  1. `T2-F32-01`: Forged or tampering with JWT signature returns HTTP 401.
  2. `T2-F32-02`: Cross-site scripting (XSS) polyglot payloads in chat messages render safely escaped.
  3. `T2-F32-03`: In-chat `/update` command by non-owner is rejected with HTTP 403.
  4. `T2-F32-04`: Protection of last admin: removing role from the only remaining admin user is blocked with HTTP 400.
  5. `T2-F32-05`: Sensitive endpoint limiter prevents automated OTP brute-forcing.

---

## 4. Tier 3: Pairwise Combinatorial & Cross-Feature Interactions

The following interaction suites validate multi-module seams:

| Interaction ID | Primary Features | Cross-Feature Scenario Description | Expected Observable Outcome |
|---|---|---|---|
| `T3-INT-01` | F06, F13, F14 | User registration provisions starter persona and sets `isDefault: true`. | Querying `/api/personas` immediately after registration returns exactly 1 default persona. |
| `T3-INT-02` | F14, F22, F23 | Changing active default persona mid-session updates prompt injection. | Character's next SSE streaming response references the new persona's identity. |
| `T3-INT-03` | F19, F18, F17, F15 | Wiki lore extraction -> Character creation -> Catalog search -> Like toggle. | Extracted character is persisted, discoverable in catalog via search, and like counter increments. |
| `T3-INT-04` | F23, F24, F25 | SSE streaming chat -> Conflict strain buildup -> Director override. | Manual relationship override halts strain escalation and resets demeanor bar indicators. |
| `T3-INT-05` | F26, F27, F22 | Takes variant swiping -> Message inline edit -> Narrative rewind. | Rewinding slices history cleanly to target turn; re-hydrated session reflects edited variant text. |
| `T3-INT-06` | F08, F09, F10, F07 | 6-Digit OTP request -> Deep link form load -> Reset password -> Immediate login. | Old password returns 401; new password returns 200 with fresh JWT. |
| `T3-INT-07` | F11, F12, F05 | Base64 avatar upload -> Profile update -> Global AuthContext hydration. | Nav bar and profile view immediately reflect new avatar image URL without page reload. |
| `T3-INT-08` | F18, F22, F29, F30 | Character deletion -> Cascaded sessions and memories cleanup. | Deleting character cascades and purges all associated threads from `/chats` and memories from SQL. |

---

## 5. Tier 4: Real-World Workflow Specifications

### Workflow 1: Complete New User Onboarding to Live Chat Stream
1. **Action**: `POST /api/auth/register` with `{ username, password, displayName }`.
2. **Action**: `POST /api/auth/upload-avatar` with base64 PNG data.
3. **Action**: `PUT /api/auth/profile` assigning uploaded avatar.
4. **Action**: `POST /api/personas` creating custom RP identity "Cyber Mercenary".
5. **Action**: `POST /api/character` creating custom character "Aria the Rogue AI".
6. **Action**: `POST /api/chats` initializing session with Aria.
7. **Action**: `POST /api/chat?stream=true` sending opening prompt "Status report, Aria."
8. **Verification**: Receive token stream, verify `[Scene Start]`, verify demeanor bar initialized, verify session persisted in `/chats`.

### Workflow 2: Psychological Demeanor Progression & Conflict Repair
1. **Setup**: Active session with character initialized at Affinity 0 ("Stranger / Neutral").
2. **Turn 1-2**: Friendly dialogue -> Emotional inertia checks, gradual affinity increase (+5).
3. **Turn 3-4**: Provocative / toxic inputs -> Conflict strain increases past threshold (strain ≥ 65).
4. **Verification**: Demeanor stage shifts to "Hostile / Rival" or "Quarreling / Heated".
5. **Turn 5**: Sincere apology and reconciliation dialogue.
6. **Verification**: Conflict strain discharges, Catharsis bonus triggers, stage transitions to "Tender / Reconciled".
7. **Turn 6**: Relationship Director override (`PUT /api/chats/:sessionId/relationship`) locks Affinity at +85 ("Deep Love / Devoted").

### Workflow 3: Full Account Recovery & Credential Turnover
1. **Action**: `POST /api/auth/forgot-password` with user email.
2. **Verification**: 6-digit OTP generated and stored in SQL `password_resets`.
3. **Action**: Parse deep-link URL `/reset-password?email=...&code=...`.
4. **Action**: `POST /api/auth/verify-code` verifying OTP validity.
5. **Action**: `POST /api/auth/reset-password` submitting new password.
6. **Verification**: Attempt login with old password -> Expect HTTP 401.
7. **Verification**: Attempt login with new password -> Expect HTTP 200 with valid JWT.

---

## 6. Execution Architecture & Tooling

### Test Runners
1. **Integrated E2E Suite (`tests/e2e/runner.js`)**:
   - Zero external dependency execution using Node.js native test runner and ESM modules.
   - Dual-target routing: automatically tests Express backend (`3000`) and Next.js reverse proxy (`3001`).
   - Self-bootstrapping: automatically starts the backend server in-process if not already running.
2. **Vitest / Playwright Integration**:
   - Ready for headless browser test execution in Next.js test runner (`npm run test:e2e`).

### Verification Command
```bash
# Execute complete E2E test track
node tests/e2e/runner.js
```
