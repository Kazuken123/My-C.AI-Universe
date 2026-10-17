/**
 * Tier 1: Feature Coverage E2E Test Suite
 * Validates public HTTP contracts across all core functional domains.
 */

import { apiRequest, consumeSSEStream, cleanupTestData } from './helpers/test-client.js';

export async function runTier1Tests() {
  console.log('\n--- 🚀 Running Tier 1: Feature Coverage Test Suite ---');
  let passed = 0;
  let failed = 0;

  const testSuffix = Date.now();
  const pilotUsername = `spec_e2e_t1_${testSuffix}`;
  const pilotEmail = `spec_e2e_t1_${testSuffix}@universe.ai`;
  const pilotPassword = 'ValidPassword123!';
  let authToken = null;
  let userId = null;
  let testCharacterId = null;
  let testSessionId = null;
  let testPersonaId = null;

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

  // --- Category 1: System & Proxy Telemetry ---
  await test('T1-F01/F02: System Health and Database Telemetry', async () => {
    const res = await apiRequest('/api/health');
    assert(res.ok && res.status === 200, `Health check failed with status ${res.status}`);
    assert(res.data.status === 'healthy' || res.data.status === 'ok', 'Status should be healthy');
    assert(res.data.database, 'Should report database engine');
  });

  await test('T1-F03: Telemetry Ping Endpoint', async () => {
    const res = await apiRequest('/api/system/ping');
    assert(res.ok && res.status === 200, 'Ping endpoint must return 200');
    assert(res.data.status === 'ok', 'Status must be ok');
    assert(res.data.version, 'Must return API version');
  });

  // --- Category 2: Authentication & Account Lifecycle ---
  await test('T1-F06: User Registration & Starter Persona Provisioning', async () => {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        username: pilotUsername,
        email: pilotEmail,
        password: pilotPassword,
        displayName: 'Tier 1 Pilot'
      }
    });

    assert(res.status === 201, `Registration should return 201, got ${res.status}`);
    assert(res.data.token, 'Should return authentication token');
    assert(res.data.user && res.data.user.username.toLowerCase() === pilotUsername.toLowerCase(), 'User profile should match');
    authToken = res.data.token;
    userId = res.data.user.id;
  });

  await test('T1-F07: User Sign-In with Valid Credentials', async () => {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        username: pilotUsername,
        password: pilotPassword
      }
    });

    assert(res.status === 200, `Login should return 200, got ${res.status}`);
    assert(res.data.token, 'Login must issue JWT token');
  });

  await test('T1-F05: Session Hydration via /api/auth/me', async () => {
    const res = await apiRequest('/api/auth/me', { token: authToken });
    assert(res.status === 200, `Hydration should return 200, got ${res.status}`);
    assert(res.data.authenticated === true, 'Authenticated flag must be true');
    assert(res.data.user && res.data.user.id === userId, 'Hydrated user must match pilot ID');
  });

  await test('T1-F11: Profile Management & Display Name Update', async () => {
    const res = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      token: authToken,
      body: {
        displayName: 'Commander Vanguard'
      }
    });

    assert(res.status === 200, `Profile update should return 200, got ${res.status}`);
    assert(res.data.user.displayName === 'Commander Vanguard', 'Display name should update');
  });

  await test('T1-F12: Base64 Avatar Upload', async () => {
    const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = await apiRequest('/api/auth/upload-avatar', {
      method: 'POST',
      token: authToken,
      body: { image: samplePngBase64 }
    });

    assert(res.status === 200, `Avatar upload should return 200, got ${res.status}`);
    assert(res.data.url && res.data.url.startsWith('/assets/avatars/'), 'Should return avatar URL path');
  });

  // --- Category 3: Password Reset 3-Step Flow ---
  await test('T1-F08: Password Reset OTP Request', async () => {
    const res = await apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: pilotEmail }
    });

    assert(res.status === 200, `Forgot password should return 200, got ${res.status}`);
    assert(res.data.success === true, 'Success flag should be true');
    assert(res.data.previewCode, 'Dev mode should return preview OTP code');
  });

  // --- Category 4: Roleplay Personas ---
  await test('T1-F13: Roleplay Persona Creation', async () => {
    const res = await apiRequest('/api/personas', {
      method: 'POST',
      token: authToken,
      body: {
        name: 'Cyber Ninja',
        description: 'Silent operative of the neon district',
        isDefault: false
      }
    });

    assert(res.status === 201, `Persona creation should return 201, got ${res.status}`);
    assert(res.data.name === 'Cyber Ninja', 'Persona name should match');
    testPersonaId = res.data.id;
  });

  await test('T1-F14: Default Persona Assignment', async () => {
    const res = await apiRequest(`/api/personas/${testPersonaId}`, {
      method: 'PUT',
      token: authToken,
      body: { isDefault: true }
    });

    assert(res.status === 200, `Setting default persona should return 200, got ${res.status}`);
    assert(res.data.isDefault === true || res.data.isDefault === 1, 'isDefault should be true');
  });

  // --- Category 5: Character Discovery & Studio ---
  await test('T1-F15/F16: Character Catalog Listing & Sorting', async () => {
    const res = await apiRequest('/api/characters?sort=popular');
    assert(res.status === 200, `Catalog listing should return 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Catalog should return array');
    assert(res.data.length > 0, 'Catalog should contain seeded characters');
  });

  await test('T1-F18: Character Studio Creation', async () => {
    const res = await apiRequest('/api/character', {
      method: 'POST',
      token: authToken,
      body: {
        name: 'E2E Test Vanguard',
        tagline: 'Guardian of the synthetic frontier',
        personality: 'Stoic, analytical, hyper-vigilant',
        greeting: '*Vanguard steps out of the shadows, scanning your signature.* State your business.',
        categories: ['Action', 'Roleplay'],
        initialAffinity: 10
      }
    });

    assert(res.status === 201, `Character creation should return 201, got ${res.status}`);
    assert(res.data.id, 'Should return created character ID');
    testCharacterId = res.data.id;
  });

  await test('T1-F17: Character Like Toggle', async () => {
    const res = await apiRequest(`/api/character/${testCharacterId}/like`, {
      method: 'POST',
      token: authToken
    });

    assert(res.status === 200, `Like toggle should return 200, got ${res.status}`);
    assert(res.data.isLiked === true, 'Character should be liked');
    assert(res.data.likes >= 1, 'Like count should increment');
  });

  // --- Category 6: Real-Time Chat & Demeanor Engine ---
  await test('T1-F22: Chat Session Initialization with Greeting', async () => {
    const res = await apiRequest('/api/chats', {
      method: 'POST',
      token: authToken,
      body: { characterId: testCharacterId }
    });

    assert(res.status === 201, `Chat session creation should return 201, got ${res.status}`);
    assert(res.data.id, 'Should return session ID');
    assert(res.data.messages && res.data.messages.length >= 1, 'Should seed opening greeting');
    testSessionId = res.data.id;
  });

  await test('T1-F23: Server-Sent Events (SSE) Token Streaming Turn', async () => {
    const sseResult = await consumeSSEStream(
      '/api/chat?stream=true',
      {
        charId: testCharacterId,
        sessionId: testSessionId,
        message: 'Report your status and current protocol.'
      },
      authToken
    );

    assert(sseResult.ok, `SSE stream should return ok, got status ${sseResult.status}`);
    assert(sseResult.tokens.length > 0, 'SSE stream should deliver incremental tokens');
    assert(sseResult.donePayload && sseResult.donePayload.done === true, 'Stream must emit done payload');
    assert(sseResult.donePayload.relationship, 'Done payload must include relationship metrics');
  });

  await test('T1-F25: Relationship Director Override', async () => {
    const res = await apiRequest(`/api/chats/${testSessionId}/relationship`, {
      method: 'PUT',
      token: authToken,
      body: {
        affinity: 65,
        trust: 50,
        strain: 0,
        relationshipStage: 'Crush / Infatuated',
        relationshipMood: 'Warm'
      }
    });

    assert(res.status === 200, `Director override should return 200, got ${res.status}`);
    assert(res.data.relationship.affinity === 65, 'Affinity should be 65');
    assert(res.data.relationship.relationshipStage === 'Crush / Infatuated', 'Stage should be Crush');
  });

  await test('T1-F29: Character Memory Notebook Storage', async () => {
    const res = await apiRequest('/api/memories', {
      method: 'POST',
      token: authToken,
      body: {
        characterId: testCharacterId,
        content: 'Pilot provided the encryption bypass codes during the perimeter breach.'
      }
    });

    assert(res.status === 201, `Adding memory should return 201, got ${res.status}`);
    assert(res.data.id, 'Should return created memory ID');
  });

  // --- Teardown & Cleanup ---
  await test('T1-F18/F22: Cascaded Character & Session Deletion', async () => {
    const delRes = await apiRequest(`/api/character/${testCharacterId}`, {
      method: 'DELETE',
      token: authToken
    });

    assert(delRes.status === 200, `Character deletion should return 200, got ${delRes.status}`);
  });

  await cleanupTestData([pilotUsername], [pilotEmail]);

  console.log(`\nTier 1 Summary: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}
