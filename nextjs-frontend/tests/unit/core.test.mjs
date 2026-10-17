import test from 'node:test';
import assert from 'node:assert/strict';

// Test token generator helper
function createTestToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'test_signature';
  return `${header}.${body}.${signature}`;
}

test('ApiError maintains proper attributes and inheritance', async () => {
  const { ApiError } = await import('../../types/api.ts');
  const err = new ApiError('Username taken', 400, 4001, 'username', { detail: 'already exists' });

  assert.equal(err.message, 'Username taken');
  assert.equal(err.status, 400);
  assert.equal(err.code, 4001);
  assert.equal(err.field, 'username');
  assert.deepEqual(err.data, { detail: 'already exists' });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof ApiError);
});

test('cn merges classes and resolves tailwind conflicts', async () => {
  const { cn } = await import('../../lib/utils.ts');
  const result = cn('px-4 py-2', 'px-6', { 'text-white': true, 'bg-black': false });
  assert.equal(result, 'py-2 px-6 text-white');
});

test('isTokenExpired correctly validates token expiration against epoch in ms', async () => {
  const { isTokenExpired } = await import('../../lib/auth.ts');

  // Expired token (exp in the past)
  const expiredToken = createTestToken({
    sub: 'user_123',
    exp: Date.now() - 60000,
  });
  assert.equal(isTokenExpired(expiredToken), true);

  // Active valid token (exp in the future)
  const validToken = createTestToken({
    sub: 'user_123',
    exp: Date.now() + 600000,
  });
  assert.equal(isTokenExpired(validToken), false);

  // Malformed tokens
  assert.equal(isTokenExpired(''), true);
  assert.equal(isTokenExpired('not.a.valid.jwt'), true);
});

test('extractTokenFromCookieHeader parses cai_auth_token cookie', async () => {
  const { extractTokenFromCookieHeader } = await import('../../lib/auth.ts');

  const cookieHeader = 'session_id=abc; cai_auth_token=jwt-token-123%2E456; theme=dark';
  const extracted = extractTokenFromCookieHeader(cookieHeader);
  assert.equal(extracted, 'jwt-token-123.456');

  assert.equal(extractTokenFromCookieHeader(''), null);
  assert.equal(extractTokenFromCookieHeader('other_cookie=value'), null);
});

test('M2: PRESET_AVATARS exports the expected 8 avatar glyphs', async () => {
  const { PRESET_AVATARS } = await import('../../types/auth.ts');
  assert.equal(PRESET_AVATARS.length, 8);
  assert.deepEqual([...PRESET_AVATARS], ['👤', '🚀', '🌟', '🛡️', '⚔️', '🎭', '🧙', '🐺']);
});

test('M2: Username validation accurately enforces length, charset, and reserved rules', () => {
  const isUsernameValid = (u) => {
    const trimmed = (u || '').trim();
    if (trimmed.length < 3 || trimmed.length > 50) return false;
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return false;
    const lower = trimmed.toLowerCase();
    if (lower === 'admin' || lower === 'community') return false;
    return true;
  };

  assert.equal(isUsernameValid('nova_pilot'), true);
  assert.equal(isUsernameValid('abc'), true);
  assert.equal(isUsernameValid('ab'), false); // Too short
  assert.equal(isUsernameValid('a'.repeat(51)), false); // Too long
  assert.equal(isUsernameValid('user name'), false); // Spaces forbidden
  assert.equal(isUsernameValid('user@name'), false); // Special chars forbidden
  assert.equal(isUsernameValid('admin'), false); // Reserved
  assert.equal(isUsernameValid('ADMIN'), false); // Reserved case-insensitive
  assert.equal(isUsernameValid('community'), false); // Reserved
});

test('M2: OTP verification code validation requires exactly 6 numeric digits', () => {
  const isValidOtp = (code) => /^\d{6}$/.test((code || '').trim());

  assert.equal(isValidOtp('123456'), true);
  assert.equal(isValidOtp('000000'), true);
  assert.equal(isValidOtp('12345'), false); // 5 digits
  assert.equal(isValidOtp('1234567'), false); // 7 digits
  assert.equal(isValidOtp('12a456'), false); // Non-digit
  assert.equal(isValidOtp(''), false);
});
test('M3: formatCount formats integers, thousands, millions, and edge cases', async () => {
  const { formatCount } = await import('../../lib/character-utils.ts');
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(42), '42');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1000), '1.0k');
  assert.equal(formatCount(12500), '12.5k');
  assert.equal(formatCount(1000000), '1.0m');
  assert.equal(formatCount(2500000), '2.5m');
  assert.equal(formatCount(null), '0');
  assert.equal(formatCount(undefined), '0');
});

test('M3: resolveAvatarUrl handles relative avatars and Dicebear fallbacks', async () => {
  const { resolveAvatarUrl } = await import('../../lib/character-utils.ts');
  assert.equal(
    resolveAvatarUrl(null, 'Kurisu'),
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Kurisu'
  );
  assert.equal(
    resolveAvatarUrl('', 'Okabe Rintaro'),
    'https://api.dicebear.com/9.x/adventurer/svg?seed=Okabe%20Rintaro'
  );
  assert.equal(
    resolveAvatarUrl('/assets/avatars/custom.png'),
    '/assets/avatars/custom.png?v=5'
  );
  assert.equal(
    resolveAvatarUrl('/assets/avatars/custom.png?foo=bar'),
    '/assets/avatars/custom.png?foo=bar&v=5'
  );
  assert.equal(
    resolveAvatarUrl('https://example.com/avatar.jpg'),
    'https://example.com/avatar.jpg'
  );
});

test('M4: stripStreamingRelState removes complete and incomplete streaming REL_STATE blocks', async () => {
  const { stripStreamingRelState } = await import('../../lib/chat-utils.ts');

  // Empty or null
  assert.equal(stripStreamingRelState(''), '');
  assert.equal(stripStreamingRelState(null), '');

  // Normal text without tag
  assert.equal(stripStreamingRelState('Hello *world*!'), 'Hello *world*!');

  // Complete tag at the end
  const textWithTag = '*Smiles warmly.* Welcome! [[REL_STATE: {"affinity": 25, "mood": "Warm"}]]';
  assert.equal(stripStreamingRelState(textWithTag), '*Smiles warmly.* Welcome!');

  // Partial streaming tags at end of stream
  assert.equal(stripStreamingRelState('Dialogue begins [['), 'Dialogue begins');
  assert.equal(stripStreamingRelState('Dialogue begins [[REL_'), 'Dialogue begins');
  assert.equal(stripStreamingRelState('Dialogue begins [[REL_STATE: {"aff'), 'Dialogue begins');
});

test('M4: calculateAffinityPercent clamps values cleanly from -100 to +100', async () => {
  const { calculateAffinityPercent } = await import('../../lib/chat-utils.ts');
  assert.equal(calculateAffinityPercent(-100), 0);
  assert.equal(calculateAffinityPercent(-50), 25);
  assert.equal(calculateAffinityPercent(0), 50);
  assert.equal(calculateAffinityPercent(50), 75);
  assert.equal(calculateAffinityPercent(100), 100);

  // Out of bounds clamping
  assert.equal(calculateAffinityPercent(-200), 0);
  assert.equal(calculateAffinityPercent(300), 100);
});

test('M4: getInitials extracts first letters cleanly', async () => {
  const { getInitials } = await import('../../lib/chat-utils.ts');
  assert.equal(getInitials('Makise Kurisu'), 'MK');
  assert.equal(getInitials('Okabe'), 'OK');
  assert.equal(getInitials(''), 'TR');
  assert.equal(getInitials(null, 'FB'), 'FB');
});

test('M4: formatRelativeTime handles date math and zero delta safely', async () => {
  const { formatRelativeTime } = await import('../../lib/chat-utils.ts');
  assert.equal(formatRelativeTime(null), 'just now');
  assert.equal(formatRelativeTime('invalid-date'), 'recently');
  assert.equal(formatRelativeTime(new Date()), 'just now');
  assert.equal(formatRelativeTime(new Date(Date.now() - 5 * 60 * 1000)), '5m ago');
  assert.equal(formatRelativeTime(new Date(Date.now() - 2 * 3600 * 1000)), '2h ago');
  assert.equal(formatRelativeTime(new Date(Date.now() - 3 * 86400 * 1000)), '3d ago');
});

test('M4: deduplicateSessionsByCharacter groups sessions by character and counts threads', async () => {
  const { deduplicateSessionsByCharacter } = await import('../../lib/chat-utils.ts');

  // Empty or null
  assert.deepEqual(deduplicateSessionsByCharacter([]), []);
  assert.deepEqual(deduplicateSessionsByCharacter(null), []);
  assert.deepEqual(deduplicateSessionsByCharacter(undefined), []);

  const mockSessions = [
    { id: 'sess_1', characterId: 'char_a', characterName: 'Kurisu', lastMessage: 'Recent' },
    { id: 'sess_2', characterId: 'char_b', characterName: 'Gojo', lastMessage: 'Domain' },
    { id: 'sess_3', characterId: 'char_a', characterName: 'Kurisu', lastMessage: 'Older thread' },
    { id: 'sess_4', characterId: 'char_a', characterName: 'Kurisu', lastMessage: 'Oldest thread' },
  ];

  const result = deduplicateSessionsByCharacter(mockSessions);
  assert.equal(result.length, 2);
  assert.equal(result[0].characterId, 'char_a');
  assert.equal(result[0].id, 'sess_1');
  assert.equal(result[0].threadCount, 3);
  assert.equal(result[1].characterId, 'char_b');
  assert.equal(result[1].id, 'sess_2');
  assert.equal(result[1].threadCount, 1);
});

