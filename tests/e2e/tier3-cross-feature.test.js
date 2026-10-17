/**
 * Tier 3: Cross-Feature Interactions E2E Test Suite
 * Validates cross-module state propagation, multi-stage lifecycles, and cascading behaviors.
 */

import { apiRequest, cleanupTestData } from './helpers/test-client.js';

export async function runTier3Tests() {
  console.log('\n--- 🔄 Running Tier 3: Cross-Feature Interactions Test Suite ---');
  let passed = 0;
  let failed = 0;

  const testSuffix = Date.now();
  const testUser = `spec_xfeat_${testSuffix}`;
  const testEmail = `spec_xfeat_${testSuffix}@universe.ai`;
  let token = null;
  let userId = null;
  let charId = null;
  let sessionId = null;
  let starterPersonaId = null;
  let customPersonaId = null;

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

  // --- Interaction 1: Registration -> Starter Persona Cascade ---
  await test('T3-INT-01: Registration creates starter persona with isDefault: true', async () => {
    const regRes = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        username: testUser,
        email: testEmail,
        password: 'InitialPassword123!',
        displayName: 'Cross-Feature Specialist'
      }
    });
    assert(regRes.status === 201, 'Registration failed');
    token = regRes.data.token;
    userId = regRes.data.user.id;

    // Verify starter persona in roster
    const personaRes = await apiRequest('/api/personas', { token });
    assert(personaRes.status === 200, 'Failed to fetch personas');
    assert(Array.isArray(personaRes.data) && personaRes.data.length >= 1, 'Should have at least 1 starter persona');
    const defaultPersona = personaRes.data.find((p) => p.isDefault === true || p.isDefault === 1);
    assert(defaultPersona, 'Must have an active default starter persona');
    starterPersonaId = defaultPersona.id;
  });

  // --- Interaction 2: Persona Creation & Default Reassignment ---
  await test('T3-INT-02: Creating custom persona and promoting to default updates roster state', async () => {
    const createRes = await apiRequest('/api/personas', {
      method: 'POST',
      token,
      body: {
        name: 'Tactical Operative',
        description: 'Elite squad leader with cybernetic implants',
        isDefault: false
      }
    });
    assert(createRes.status === 201, 'Failed to create custom persona');
    customPersonaId = createRes.data.id;

    // Promote custom persona to default
    const putRes = await apiRequest(`/api/personas/${customPersonaId}`, {
      method: 'PUT',
      token,
      body: { isDefault: true }
    });
    assert(putRes.status === 200, 'Failed to update persona default status');

    // Verify roster: custom is default, starter is no longer default
    const rosterRes = await apiRequest('/api/personas', { token });
    const starter = rosterRes.data.find((p) => p.id === starterPersonaId);
    const custom = rosterRes.data.find((p) => p.id === customPersonaId);
    assert(custom.isDefault === true || custom.isDefault === 1, 'Custom persona must now be default');
    assert(starter.isDefault === false || starter.isDefault === 0, 'Starter persona must no longer be default');
  });

  // --- Interaction 3: Character Creation + Like Toggle + Catalog Sort ---
  await test('T3-INT-03: Character creation, like toggle, and reflection in catalog sorting', async () => {
    const charRes = await apiRequest('/api/character', {
      method: 'POST',
      token,
      body: {
        name: 'Cross-Feature Phoenix',
        tagline: 'Rising from synthetic ashes',
        personality: 'Fiery, audacious',
        greeting: '*Flames swirl as Phoenix materializes.* Need a spark?',
        categories: ['Fantasy', 'Action'],
        initialAffinity: 25
      }
    });
    assert(charRes.status === 201, 'Character creation failed');
    charId = charRes.data.id;

    // Toggle like
    const likeRes = await apiRequest(`/api/character/${charId}/like`, { method: 'POST', token });
    assert(likeRes.status === 200 && likeRes.data.isLiked === true, 'Like toggle failed');

    // Query catalog sorted by likes
    const catalogRes = await apiRequest('/api/characters?sort=likes');
    assert(catalogRes.status === 200, 'Catalog query failed');
    const foundChar = catalogRes.data.find((c) => c.id === charId);
    assert(foundChar && foundChar.likes >= 1, 'Character must reflect updated like counter in catalog');
  });

  // --- Interaction 4: In-Chat /update Command Reflection in Character Entity ---
  await test('T3-INT-04: In-chat /update command modifies character field in SQL', async () => {
    // Send in-chat command
    const chatRes = await apiRequest('/api/chat', {
      method: 'POST',
      token,
      body: {
        charId,
        message: '/update speaking_style: Measured, resonant, and calm'
      }
    });
    assert(chatRes.status === 200, `In-chat /update failed with status ${chatRes.status}`);

    // Verify character entity reflects update
    const getCharRes = await apiRequest(`/api/character/${charId}`);
    assert(getCharRes.status === 200, 'Failed to fetch updated character');
    assert(
      getCharRes.data.speaking_style && getCharRes.data.speaking_style.includes('Measured'),
      'Character speaking_style must reflect in-chat /update'
    );
  });

  // --- Interaction 5: Message Pinning & Targeted Updates ---
  await test('T3-INT-05: Chat session message pinning and persistence in session hydration', async () => {
    // Create chat session
    const sessRes = await apiRequest('/api/chats', {
      method: 'POST',
      token,
      body: { characterId: charId }
    });
    assert(sessRes.status === 201, 'Chat session creation failed');
    sessionId = sessRes.data.id;
    const greetingMsg = sessRes.data.messages[0];
    assert(greetingMsg, 'Greeting message must exist');

    // Pin the greeting turn
    const pinRes = await apiRequest(`/api/chats/${sessionId}/messages/${greetingMsg.id}`, {
      method: 'PUT',
      token,
      body: {
        isPinned: true,
        selectedVariantIndex: 0
      }
    });
    assert(pinRes.status === 200, 'Failed to pin message');

    // Hydrate session and verify pin persisted
    const hydratedRes = await apiRequest(`/api/chats/${sessionId}`, { token });
    assert(hydratedRes.status === 200, 'Failed to hydrate session');
    const hydratedMsg = hydratedRes.data.messages.find((m) => m.id === greetingMsg.id);
    assert(hydratedMsg && (hydratedMsg.isPinned === true || hydratedMsg.isPinned === 1), 'Message must remain pinned');
  });

  // --- Interaction 6: Relationship Director Override Persistence ---
  await test('T3-INT-06: Director mode relationship override persists across session fetches', async () => {
    const dirRes = await apiRequest(`/api/chats/${sessionId}/relationship`, {
      method: 'PUT',
      token,
      body: {
        affinity: 80,
        trust: 60,
        strain: 0,
        relationshipStage: 'Deep Love / Devoted',
        relationshipMood: 'Tender / Reconciled'
      }
    });
    assert(dirRes.status === 200, 'Director override failed');

    // Fetch session and verify relationship metrics
    const sessRes = await apiRequest(`/api/chats/${sessionId}`, { token });
    assert(sessRes.status === 200, 'Failed to fetch session');
    const rel = sessRes.data.relationship || sessRes.data;
    assert(rel.affinity === 80, 'Affinity should be 80');
    assert(rel.relationshipStage === 'Deep Love / Devoted', 'Stage should be Deep Love');
  });

  // --- Interaction 7: Password Reset Flow and Credential Turnover ---
  await test('T3-INT-07: Forgot password OTP request -> verify code -> reset password -> login turnover', async () => {
    // 1. Forgot password
    const forgotRes = await apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: testEmail }
    });
    assert(forgotRes.status === 200, 'Forgot password request failed');
    const otp = forgotRes.data.previewCode;
    assert(otp && otp.length === 6, 'Must provide 6-digit OTP in dev mode');

    // 2. Verify code
    const verifyRes = await apiRequest('/api/auth/verify-code', {
      method: 'POST',
      body: { email: testEmail, code: otp }
    });
    assert(verifyRes.status === 200 && verifyRes.data.valid === true, 'OTP verification failed');

    // 3. Reset password
    const newPassword = 'BrandNewPassword456!';
    const resetRes = await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: testEmail,
        code: otp,
        newPassword
      }
    });
    assert(resetRes.status === 200, 'Reset password failed');

    // 4. Verify old password rejected
    const oldLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { username: testUser, password: 'InitialPassword123!' }
    });
    assert(oldLoginRes.status === 401, 'Old password must be rejected with 401');

    // 5. Verify new password succeeds
    const newLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { username: testUser, password: newPassword }
    });
    assert(newLoginRes.status === 200 && newLoginRes.data.token, 'New password must authenticate successfully');
    token = newLoginRes.data.token;
  });

  // --- Interaction 8: Character Cascading Deletion ---
  await test('T3-INT-08: Deleting character cascades and purges active chat sessions from /chats', async () => {
    // Delete character
    const delCharRes = await apiRequest(`/api/character/${charId}`, {
      method: 'DELETE',
      token
    });
    assert(delCharRes.status === 200, 'Character deletion failed');

    // Verify session is no longer in user's /chats list
    const chatsRes = await apiRequest('/api/chats', { token });
    assert(chatsRes.status === 200, 'Failed to fetch chats');
    const activeSession = chatsRes.data.find((s) => s.id === sessionId);
    assert(!activeSession, 'Cascaded session must not appear in user chats');
  });

  await cleanupTestData([testUser], [testEmail]);

  console.log(`\nTier 3 Summary: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}
