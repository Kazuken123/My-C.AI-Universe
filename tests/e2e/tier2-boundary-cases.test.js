/**
 * Tier 2: Boundary Value Analysis & Corner Cases E2E Test Suite
 * Validates edge conditions, length limits, clamps, and negative rejection boundaries.
 */

import { apiRequest, cleanupTestData } from './helpers/test-client.js';

export async function runTier2Tests() {
  console.log('\n--- 🛡️ Running Tier 2: Boundary & Corner Cases Test Suite ---');
  let passed = 0;
  let failed = 0;

  const testSuffix = Date.now();
  const userA = `spec_bva_a_${testSuffix}`;
  const userB = `spec_bva_b_${testSuffix}`;
  let tokenA = null;
  let tokenB = null;
  let charAId = null;
  let personaAId = null;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  // --- Fixture Setup ---
  await test('Fixture: Register User A and User B', async () => {
    const resA = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username: userA, password: 'PasswordA123!', displayName: 'User A' }
    });
    assert(resA.status === 201, 'User A registration failed');
    tokenA = resA.data.token;

    const resB = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username: userB, password: 'PasswordB123!', displayName: 'User B' }
    });
    assert(resB.status === 201, 'User B registration failed');
    tokenB = resB.data.token;
  });

  // --- Boundary Category 1: Registration Input Limits ---
  await test('T2-B01: Reject username under 3 characters (boundary: 2 chars)', async () => {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username: 'ab', password: 'Password123!' }
    });
    assert(res.status === 400, `Expected 400 for 2-char username, got ${res.status}`);
  });

  await test('T2-B02: Reject username over 50 characters (boundary: 51 chars)', async () => {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username: 'u'.repeat(51), password: 'Password123!' }
    });
    assert(res.status === 400, `Expected 400 for 51-char username, got ${res.status}`);
  });

  await test('T2-B03: Reject password under 6 characters (boundary: 5 chars)', async () => {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username: `valid_${Date.now()}`, password: '12345' }
    });
    assert(res.status === 400, `Expected 400 for 5-char password, got ${res.status}`);
  });

  await test('T2-B04: Reject reserved handle names ("community", "admin")', async () => {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username: 'community', password: 'Password123!' }
    });
    assert(res.status === 400, `Expected 400 for reserved handle, got ${res.status}`);
  });

  await test('T2-B05: Reject username with special characters and spaces', async () => {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username: 'user name!@#', password: 'Password123!' }
    });
    assert(res.status === 400, `Expected 400 for special char username, got ${res.status}`);
  });

  // --- Boundary Category 2: Profile & Persona Limits ---
  await test('T2-B06: Reject displayName over 50 characters (boundary: 51 chars)', async () => {
    const res = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      token: tokenA,
      body: { displayName: 'D'.repeat(51) }
    });
    assert(res.status === 400, `Expected 400 for 51-char displayName, got ${res.status}`);
  });

  await test('T2-B07: Reject persona name over 100 characters', async () => {
    const res = await apiRequest('/api/personas', {
      method: 'POST',
      token: tokenA,
      body: { name: 'P'.repeat(101) }
    });
    assert(res.status === 400, `Expected 400 for 101-char persona name, got ${res.status}`);
  });

  await test('T2-B08: Accept persona name at max boundary (100 characters)', async () => {
    const res = await apiRequest('/api/personas', {
      method: 'POST',
      token: tokenA,
      body: { name: 'P'.repeat(100), description: 'Boundary persona' }
    });
    assert(res.status === 201, `Expected 201 for 100-char persona name, got ${res.status}`);
    personaAId = res.data.id;
  });

  // --- Boundary Category 3: Character Studio Limits ---
  await test('T2-B09: Reject character with tagline over 300 characters', async () => {
    const res = await apiRequest('/api/character', {
      method: 'POST',
      token: tokenA,
      body: {
        name: 'Boundary Test Char',
        tagline: 'T'.repeat(301)
      }
    });
    assert(res.status === 400, `Expected 400 for 301-char tagline, got ${res.status}`);
  });

  await test('T2-B10: Create valid character fixture for User A', async () => {
    const res = await apiRequest('/api/character', {
      method: 'POST',
      token: tokenA,
      body: {
        name: 'Alpha Sentinel',
        tagline: 'Bound to protect the sector',
        personality: 'Rigid',
        greeting: 'Halt.'
      }
    });
    assert(res.status === 201, 'Character creation failed');
    charAId = res.data.id;
  });

  // --- Boundary Category 4: Security & IDOR Enforcement ---
  await test('T2-B11: IDOR Defense: User B cannot mutate User A character', async () => {
    const res = await apiRequest(`/api/character/${charAId}`, {
      method: 'PUT',
      token: tokenB,
      body: { name: 'Hacked By B' }
    });
    assert(res.status === 403, `Expected 403 Forbidden for cross-user character edit, got ${res.status}`);
  });

  await test('T2-B12: IDOR Defense: User B cannot delete User A character', async () => {
    const res = await apiRequest(`/api/character/${charAId}`, {
      method: 'DELETE',
      token: tokenB
    });
    assert(res.status === 403, `Expected 403 Forbidden for cross-user character delete, got ${res.status}`);
  });

  await test('T2-B13: IDOR Defense: User B cannot mutate User A persona', async () => {
    const res = await apiRequest(`/api/personas/${personaAId}`, {
      method: 'PUT',
      token: tokenB,
      body: { name: 'Hacked Persona' }
    });
    assert(res.status === 403, `Expected 403 Forbidden for cross-user persona edit, got ${res.status}`);
  });

  await test('T2-B14: Mass Assignment Defense: Client-injected role:admin is stripped', async () => {
    const res = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      token: tokenA,
      body: { role: 'admin', displayName: 'Infiltrator' }
    });
    assert(res.status === 200, 'Profile update should return 200');
    assert(res.data.user.role === 'user', `Role must remain "user", got "${res.data.user.role}"`);
  });

  // --- Boundary Category 5: SSRF & Network Protections ---
  await test('T2-B15: SSRF Defense: Reject localhost in /api/character/parse-wiki', async () => {
    const res = await apiRequest('/api/character/parse-wiki', {
      method: 'POST',
      token: tokenA,
      body: { url: 'http://127.0.0.1:3000/api/system/ping' }
    });
    assert(res.status === 400, `Expected 400 for localhost SSRF attempt, got ${res.status}`);
  });

  await test('T2-B16: SSRF Defense: Reject domain substring spoof in parse-wiki', async () => {
    const res = await apiRequest('/api/character/parse-wiki', {
      method: 'POST',
      token: tokenA,
      body: { url: 'http://fandom.com.attacker.com/wiki/Char' }
    });
    assert(res.status === 400, `Expected 400 for spoofed subdomain, got ${res.status}`);
  });

  // --- Boundary Category 6: Unauthenticated Public Seam Barriers ---
  await test('T2-B17: Reject unauthenticated chat session creation with 401', async () => {
    const res = await apiRequest('/api/chats', {
      method: 'POST',
      body: { characterId: charAId }
    });
    assert(res.status === 401, `Expected 401 Unauthorized, got ${res.status}`);
  });

  await test('T2-B18: Reject unauthenticated /api/chat invocation with 401', async () => {
    const res = await apiRequest('/api/chat', {
      method: 'POST',
      body: { charId: charAId, message: 'Hello' }
    });
    assert(res.status === 401, `Expected 401 Unauthorized, got ${res.status}`);
  });

  // --- Teardown & Cleanup ---
  if (charAId) {
    await apiRequest(`/api/character/${charAId}`, { method: 'DELETE', token: tokenA });
  }
  await cleanupTestData([userA, userB]);

  console.log(`\nTier 2 Summary: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}
