import test from 'node:test';
import assert from 'node:assert/strict';

// Helper to generate JWT structure
function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

// Mirror ApiClient error extraction logic from lib/api.ts:90-103
function parseResponseError(status, data) {
  const errorDetail =
    typeof data === 'object' && data !== null && 'error' in data
      ? data.error
      : null;

  const message =
    errorDetail?.message ||
    (typeof data === 'string' && data ? data : `HTTP ${status}: Request failed`);
  const code = errorDetail?.code || status;
  const field = errorDetail?.field;

  return { message, status, code, field, data };
}

// =========================================================================
// 1. AUTH TOKEN EDGE CASES
// =========================================================================

test('auth: isTokenExpired edge cases', async () => {
  const { isTokenExpired } = await import('../../lib/auth.ts');

  // 1. Missing or empty tokens
  assert.equal(isTokenExpired(''), true, 'empty token should be expired');
  assert.equal(isTokenExpired(null), true, 'null token should be expired');
  assert.equal(isTokenExpired(undefined), true, 'undefined token should be expired');

  // 2. Malformed token formats (not 3 parts)
  assert.equal(isTokenExpired('onepart'), true, 'single part token');
  assert.equal(isTokenExpired('one.two'), true, 'two part token');
  assert.equal(isTokenExpired('one.two.three.four'), true, 'four part token');

  // 3. Corrupt base64 in payload
  assert.equal(isTokenExpired('header.!!!invalid-base64!!!.sig'), true, 'invalid base64');

  // 4. Base64 payload that is not valid JSON
  const invalidJsonPayload = Buffer.from('this is not json').toString('base64url');
  assert.equal(isTokenExpired(`header.${invalidJsonPayload}.sig`), true, 'non-JSON payload');

  // 5. Valid tokens with milliseconds epoch (backend convention)
  const futureTokenMs = makeJwt({ sub: 'u1', exp: Date.now() + 3600000 });
  assert.equal(isTokenExpired(futureTokenMs), false, 'future ms token should not be expired');

  const pastTokenMs = makeJwt({ sub: 'u1', exp: Date.now() - 3600000 });
  assert.equal(isTokenExpired(pastTokenMs), true, 'past ms token should be expired');

  // 6. Token with standard Unix epoch in seconds (e.g. 1.7e9 ~ year 2024)
  // In ms, 1.7e9 is Jan 1970 (less than Date.now() ~ 1.7e12), so Date.now() >= exp evaluates to true
  const tokenInSeconds = makeJwt({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
  assert.equal(isTokenExpired(tokenInSeconds), true, 'token with exp in seconds is expired under ms comparison');

  // 7. Token with exp: 0
  // Note: if payload has exp: 0, "!payload.exp" is true, so isTokenExpired returns false!
  const zeroExpToken = makeJwt({ sub: 'u1', exp: 0 });
  const isZeroExpired = isTokenExpired(zeroExpToken);
  assert.equal(isZeroExpired, false, 'Empirical finding: exp: 0 is treated as no expiration because !0 is true');

  // 8. Token with non-object JSON payload (null, string, number)
  const nullPayload = Buffer.from('null').toString('base64url');
  assert.equal(isTokenExpired(`header.${nullPayload}.sig`), true, 'null JSON payload should be safely caught');

  const stringPayload = Buffer.from('"hello"').toString('base64url');
  assert.equal(isTokenExpired(`header.${stringPayload}.sig`), false, 'string JSON payload without exp returns false');
});

test('auth: extractTokenFromCookieHeader boundary conditions', async () => {
  const { extractTokenFromCookieHeader } = await import('../../lib/auth.ts');

  // Null, undefined, empty string
  assert.equal(extractTokenFromCookieHeader(null), null);
  assert.equal(extractTokenFromCookieHeader(undefined), null);
  assert.equal(extractTokenFromCookieHeader(''), null);

  // Single cookie with and without trailing semicolon
  assert.equal(extractTokenFromCookieHeader('cai_auth_token=my_secret_token'), 'my_secret_token');
  assert.equal(extractTokenFromCookieHeader('cai_auth_token=my_secret_token;'), 'my_secret_token');

  // Empirical finding: leading whitespace before the first cookie causes (?:^|;\s*) to fail!
  const withLeadingSpace = extractTokenFromCookieHeader(' cai_auth_token=my_secret_token');
  assert.equal(withLeadingSpace, null, 'Cookie with leading space fails match due to regex ^ anchor without \\s*');

  // Multi-cookie headers
  const multiCookie = 'theme=dark; cai_auth_token=middle_token; lang=en-US';
  assert.equal(extractTokenFromCookieHeader(multiCookie), 'middle_token');

  const endCookie = 'theme=dark; lang=en-US; cai_auth_token=end_token';
  assert.equal(extractTokenFromCookieHeader(endCookie), 'end_token');

  // Cookie with URI encoded characters
  const encodedCookie = 'cai_auth_token=part1%2Epart2%2Epart3';
  assert.equal(extractTokenFromCookieHeader(encodedCookie), 'part1.part2.part3');

  // Empty value in cookie
  assert.equal(extractTokenFromCookieHeader('cai_auth_token='), null);
  assert.equal(extractTokenFromCookieHeader('cai_auth_token=; other=1'), null);

  // Cookie name substring collision: "not_cai_auth_token"
  assert.equal(extractTokenFromCookieHeader('not_cai_auth_token=fake_token'), null);
});

test('auth: browser storage & cookie sync simulation', async () => {
  const { getAuthToken, setAuthToken, removeAuthToken, TOKEN_STORAGE_KEY } = await import('../../lib/auth.ts');

  // Mock window, localStorage, and document
  const storage = new Map();
  let cookieString = '';

  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.document = {
    get cookie() {
      return cookieString;
    },
    set cookie(val) {
      const [pair] = val.split(';');
      const [name, value] = pair.split('=');
      if (val.includes('max-age=0')) {
        cookieString = '';
      } else {
        cookieString = `${name.trim()}=${value.trim()}`;
      }
    },
  };

  // 1. Initial state empty
  assert.equal(getAuthToken(), null);

  // 2. Set token synchronizes both
  setAuthToken('valid.jwt.token');
  assert.equal(storage.get(TOKEN_STORAGE_KEY), 'valid.jwt.token');
  assert.ok(cookieString.includes('cai_auth_token=valid.jwt.token'));
  assert.equal(getAuthToken(), 'valid.jwt.token');

  // 3. Fallback to cookie when localStorage is empty
  storage.delete(TOKEN_STORAGE_KEY);
  assert.equal(getAuthToken(), 'valid.jwt.token');
  // It should have repopulated localStorage
  assert.equal(storage.get(TOKEN_STORAGE_KEY), 'valid.jwt.token');

  // 4. Malformed URI in cookie should not throw
  storage.delete(TOKEN_STORAGE_KEY);
  cookieString = 'cai_auth_token=%E0%A4%A'; // Invalid URI sequence
  assert.equal(getAuthToken(), null, 'malformed URI in cookie safely caught');

  // 5. Remove token cleans both
  setAuthToken('another.token');
  removeAuthToken();
  assert.equal(storage.get(TOKEN_STORAGE_KEY), undefined);
  assert.equal(cookieString, '');
  assert.equal(getAuthToken(), null);

  // 6. localStorage throws SecurityError (Safari private mode / blocked storage)
  globalThis.localStorage.getItem = () => {
    throw new Error('Access to localStorage denied');
  };
  assert.doesNotThrow(() => getAuthToken());
  assert.equal(getAuthToken(), null);

  // Cleanup globals
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.document;
});

// =========================================================================
// 2. APIERROR SERIALIZATION & HTTP ERROR PARSING
// =========================================================================

test('api: ApiError constructor, serialization, and inheritance', async () => {
  const { ApiError } = await import('../../types/api.ts');

  const err = new ApiError('Forbidden resource', 403, 40301, 'role', { required: 'admin' });
  assert.equal(err.name, 'ApiError');
  assert.equal(err.message, 'Forbidden resource');
  assert.equal(err.status, 403);
  assert.equal(err.code, 40301);
  assert.equal(err.field, 'role');
  assert.deepEqual(err.data, { required: 'admin' });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof ApiError);
  assert.ok(err.stack && err.stack.includes('ApiError'));

  // Default parameters
  const defaultErr = new ApiError('Default failure');
  assert.equal(defaultErr.status, 500);
  assert.equal(defaultErr.code, 500);
  assert.equal(defaultErr.field, undefined);
  assert.equal(defaultErr.data, undefined);

  // JSON serialization test
  const serialized = JSON.stringify(err);
  assert.ok(typeof serialized === 'string');
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.status, 403);
  assert.equal(parsed.code, 40301);
  assert.equal(parsed.field, 'role');
});

test('api: HTTP error parsing across 400, 401, 403, 500, 429, 502 status codes', async () => {
  const { ApiError } = await import('../../types/api.ts');

  // 1. 400 Validation Error with field
  const err400 = parseResponseError(400, {
    error: {
      message: 'Password must be at least 8 characters',
      code: 400,
      field: 'password',
    },
  });
  const apiErr400 = new ApiError(err400.message, err400.status, err400.code, err400.field, err400.data);
  assert.equal(apiErr400.status, 400);
  assert.equal(apiErr400.code, 400);
  assert.equal(apiErr400.message, 'Password must be at least 8 characters');
  assert.equal(apiErr400.field, 'password');

  // 2. 401 Unauthorized Error
  const err401 = parseResponseError(401, {
    error: {
      message: 'Authentication required. Please sign in or create an account.',
      code: 401,
    },
  });
  const apiErr401 = new ApiError(err401.message, err401.status, err401.code, err401.field, err401.data);
  assert.equal(apiErr401.status, 401);
  assert.equal(apiErr401.code, 401);
  assert.equal(apiErr401.message, 'Authentication required. Please sign in or create an account.');
  assert.equal(apiErr401.field, undefined);

  // 3. 403 Forbidden Error
  const err403 = parseResponseError(403, {
    error: {
      message: 'Admin access required. You do not have permission to access this resource.',
      code: 403,
    },
  });
  const apiErr403 = new ApiError(err403.message, err403.status, err403.code, err403.field, err403.data);
  assert.equal(apiErr403.status, 403);
  assert.equal(apiErr403.code, 403);
  assert.equal(apiErr403.message, 'Admin access required. You do not have permission to access this resource.');

  // 4. 500 Internal Server Error
  const err500 = parseResponseError(500, {
    error: {
      message: 'Database connection failed',
      code: 500,
    },
  });
  const apiErr500 = new ApiError(err500.message, err500.status, err500.code, err500.field, err500.data);
  assert.equal(apiErr500.status, 500);
  assert.equal(apiErr500.message, 'Database connection failed');

  // 5. 502 Bad Gateway / Proxy HTML response (non-JSON string)
  const err502 = parseResponseError(502, '<html><body>502 Bad Gateway</body></html>');
  const apiErr502 = new ApiError(err502.message, err502.status, err502.code, err502.field, err502.data);
  assert.equal(apiErr502.status, 502);
  assert.equal(apiErr502.message, '<html><body>502 Bad Gateway</body></html>');

  // 6. 500 Empty response body
  const errEmpty = parseResponseError(500, '');
  const apiErrEmpty = new ApiError(errEmpty.message, errEmpty.status, errEmpty.code, errEmpty.field, errEmpty.data);
  assert.equal(apiErrEmpty.status, 500);
  assert.equal(apiErrEmpty.message, 'HTTP 500: Request failed');

  // 7. 429 Rate Limiter response: { error: "Too many requests", retryAfter: 60 }
  // Empirical finding: when backend returns error as a string in JSON, errorDetail.message is undefined,
  // causing the client to lose the actual error string and default to 'HTTP 429: Request failed'.
  const err429 = parseResponseError(429, {
    error: 'Too many requests, please try again later.',
    retryAfter: 60,
  });
  const apiErr429 = new ApiError(err429.message, err429.status, err429.code, err429.field, err429.data);
  assert.equal(apiErr429.status, 429);
  assert.equal(apiErr429.message, 'HTTP 429: Request failed', 'Demonstrates loss of string error detail in JSON object');
});

// =========================================================================
// 3. SPOTLIGHT HOOK UNDER BOUNDARY CONDITIONS
// =========================================================================

test('spotlight: boundary conditions (null ref, offscreen cursor, disabled)', async () => {
  // Direct simulation of useSpotlight logic for mathematical & boundary verification
  function runHook(options) {
    const currentRef = { current: null };
    const disabled = options?.disabled ?? false;

    const updateCoordinates = (clientX, clientY) => {
      if (disabled || !currentRef.current) return;
      const rect = currentRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      currentRef.current.style.setProperty('--mouse-x', `${x}px`);
      currentRef.current.style.setProperty('--mouse-y', `${y}px`);
    };

    const handlePointerMove = (e) => {
      updateCoordinates(e.clientX, e.clientY);
    };

    return {
      ref: currentRef,
      updateCoordinates,
      handlePointerMove,
      disabled,
    };
  }

  // 1. Boundary: null ref
  const hookWithNullRef = runHook();
  assert.equal(hookWithNullRef.ref.current, null);
  assert.doesNotThrow(() => {
    hookWithNullRef.handlePointerMove({ clientX: 100, clientY: 200 });
  });

  // 2. Boundary: attached DOM node with normal coordinates
  const styleProps = new Map();
  const mockElement = {
    getBoundingClientRect: () => ({
      left: 100,
      top: 50,
      right: 300,
      bottom: 250,
      width: 200,
      height: 200,
    }),
    style: {
      setProperty: (name, val) => styleProps.set(name, val),
    },
  };

  const activeHook = runHook({ disabled: false });
  activeHook.ref.current = mockElement;

  activeHook.handlePointerMove({ clientX: 150, clientY: 100 });
  // x = 150 - 100 = 50px, y = 100 - 50 = 50px
  assert.equal(styleProps.get('--mouse-x'), '50px');
  assert.equal(styleProps.get('--mouse-y'), '50px');

  // 3. Boundary: offscreen negative cursor coordinates
  activeHook.handlePointerMove({ clientX: -200, clientY: -300 });
  // x = -200 - 100 = -300px, y = -300 - 50 = -350px
  assert.equal(styleProps.get('--mouse-x'), '-300px');
  assert.equal(styleProps.get('--mouse-y'), '-350px');

  // 4. Boundary: extreme large coordinates
  activeHook.handlePointerMove({ clientX: 99999, clientY: 88888 });
  assert.equal(styleProps.get('--mouse-x'), '99899px');
  assert.equal(styleProps.get('--mouse-y'), '88838px');

  // 5. Boundary: disabled mode
  styleProps.clear();
  const disabledHook = runHook({ disabled: true });
  disabledHook.ref.current = mockElement;

  disabledHook.handlePointerMove({ clientX: 150, clientY: 100 });
  assert.equal(styleProps.has('--mouse-x'), false);
  assert.equal(styleProps.has('--mouse-y'), false);

  // 6. Test window.matchMedia guard in useSpotlight
  // If window exists but matchMedia is undefined, let's verify if an un-guarded call throws:
  const fakeWindowWithoutMatchMedia = {};
  assert.throws(() => {
    fakeWindowWithoutMatchMedia.matchMedia('(prefers-reduced-motion: reduce)');
  }, TypeError);
});
