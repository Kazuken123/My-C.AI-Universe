/**
 * Tier 4: Real-World Workflows E2E Test Suite
 * Validates the complete end-to-end user lifecycle:
 * Registration -> Profile setup -> Persona creation -> Character creation ->
 * Chat session with SSE streaming -> Demeanor state changes -> Password reset flow.
 */

import { apiRequest, consumeSSEStream, cleanupTestData } from './helpers/test-client.js';

export async function runTier4Tests() {
  console.log('\n--- 🌟 Running Tier 4: Real-World Workflows Test Suite ---');
  let passed = 0;
  let failed = 0;

  const testSuffix = Date.now();
  const journeyUser = `spec_journey_${testSuffix}`;
  const journeyEmail = `spec_journey_${testSuffix}@universe.ai`;
  const initialPassword = 'InitialJourneyPass123!';
  const updatedPassword = 'NewSecretJourneyPass789!';

  let authToken = null;
  let userId = null;
  let personaId = null;
  let characterId = null;
  let sessionId = null;

  async function step(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] Step ${passed + 1}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] Step ${passed + failed + 1}: ${name}: ${err.message}`);
      failed++;
      throw err; // In Tier 4 workflow, subsequent steps depend on prior steps
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  try {
    // -------------------------------------------------------------
    // Step 1: User Registration
    // -------------------------------------------------------------
    await step('Registration - Create user account with credentials', async () => {
      const res = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: {
          username: journeyUser,
          email: journeyEmail,
          password: initialPassword,
          displayName: 'Journey Pioneer'
        }
      });

      assert(res.status === 201, `Registration returned status ${res.status}`);
      assert(res.data.token, 'Registration must issue a JWT session token');
      assert(res.data.user && res.data.user.id, 'User record must be created');
      authToken = res.data.token;
      userId = res.data.user.id;
    });

    // -------------------------------------------------------------
    // Step 2: Profile Setup & Avatar Management
    // -------------------------------------------------------------
    await step('Profile Setup - Upload avatar & update profile details', async () => {
      const sampleAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QzwAEjAw/AFAcA+3/p1v/AAAAAElFTkSuQmCC';
      const uploadRes = await apiRequest('/api/auth/upload-avatar', {
        method: 'POST',
        token: authToken,
        body: { image: sampleAvatar }
      });

      assert(uploadRes.status === 200, `Avatar upload returned status ${uploadRes.status}`);
      const avatarUrl = uploadRes.data.url;
      assert(avatarUrl, 'Avatar upload must return URL');

      const profileRes = await apiRequest('/api/auth/profile', {
        method: 'PUT',
        token: authToken,
        body: {
          displayName: 'Pioneer Architect Prime',
          avatar: avatarUrl
        }
      });

      assert(profileRes.status === 200, 'Profile update failed');
      assert(profileRes.data.user.displayName === 'Pioneer Architect Prime', 'Display name not updated');

      // Verify hydration
      const meRes = await apiRequest('/api/auth/me', { token: authToken });
      assert(meRes.status === 200 && meRes.data.authenticated === true, 'Hydration failed');
      assert(meRes.data.user.displayName === 'Pioneer Architect Prime', 'Hydrated profile mismatch');
    });

    // -------------------------------------------------------------
    // Step 3: Roleplay Persona Creation & Assignment
    // -------------------------------------------------------------
    await step('Persona Creation - Build custom identity & assign as active default', async () => {
      const createRes = await apiRequest('/api/personas', {
        method: 'POST',
        token: authToken,
        body: {
          name: 'Nexus Wanderer',
          description: 'A dimension-hopping cartographer seeking ancient cosmic anomalies.',
          avatar: '🧭',
          isDefault: false
        }
      });

      assert(createRes.status === 201, 'Persona creation failed');
      personaId = createRes.data.id;

      // Assign as active default persona
      const updateRes = await apiRequest(`/api/personas/${personaId}`, {
        method: 'PUT',
        token: authToken,
        body: { isDefault: true }
      });

      assert(updateRes.status === 200, 'Setting default persona failed');
      assert(updateRes.data.isDefault === true || updateRes.data.isDefault === 1, 'isDefault should be true');
    });

    // -------------------------------------------------------------
    // Step 4: Character Studio Creation
    // -------------------------------------------------------------
    await step('Character Creation - Synthesize AI entity with rich traits & opening greeting', async () => {
      const createRes = await apiRequest('/api/character', {
        method: 'POST',
        token: authToken,
        body: {
          name: 'Chronos the Temporal Archivist',
          tagline: 'Keeper of fractured timelines and lost civilizations',
          personality: 'Melancholic, deeply wise, speaks in temporal metaphors',
          greeting: '*The sands in Chronos\'s hourglass pause mid-air.* Ah, another traveler from a fragile timeline. Welcome to the Archives.',
          speaking_style: 'Eloquent, rhythmic, poetic',
          categories: ['Sci-Fi', 'Roleplay', 'Mystery'],
          initialAffinity: 15,
          initialRelationshipStage: 'Stranger / Neutral',
          relationshipDynamic: 'Guarded curiosity gradually softening to mentorship'
        }
      });

      assert(createRes.status === 201, 'Character creation failed');
      assert(createRes.data.id, 'Character ID missing');
      characterId = createRes.data.id;
    });

    // -------------------------------------------------------------
    // Step 5: Chat Session with Real-Time SSE Token Streaming
    // -------------------------------------------------------------
    await step('Chat Session & SSE Streaming - Initialize session and stream AI dialogue', async () => {
      const sessionRes = await apiRequest('/api/chats', {
        method: 'POST',
        token: authToken,
        body: {
          characterId,
          personaId
        }
      });

      assert(sessionRes.status === 201, 'Chat session creation failed');
      sessionId = sessionRes.data.id;
      assert(sessionRes.data.messages.length >= 1, 'Opening greeting must be seeded');

      // Execute live SSE streaming turn
      const streamResult = await consumeSSEStream(
        '/api/chat?stream=true',
        {
          charId: characterId,
          sessionId,
          message: 'Tell me about the anomaly that shattered the fifth era.'
        },
        authToken
      );

      assert(streamResult.ok, `SSE stream failed with status ${streamResult.status}`);
      assert(streamResult.tokens.length > 0, 'Stream must emit incremental tokens');
      assert(streamResult.donePayload && streamResult.donePayload.done === true, 'Stream must conclude with done event');
      assert(streamResult.donePayload.response, 'Stream must provide finalized response text');
      assert(streamResult.donePayload.relationship, 'Stream must provide updated relationship state');
    });

    // -------------------------------------------------------------
    // Step 6: Demeanor State Changes & Director Adjustment
    // -------------------------------------------------------------
    await step('Demeanor State Evolution - Observe progression & apply Director override', async () => {
      // Fetch session to inspect demeanor
      const sessionRes = await apiRequest(`/api/chats/${sessionId}`, { token: authToken });
      assert(sessionRes.status === 200, 'Failed to fetch session');
      const rel = sessionRes.data.relationship || sessionRes.data;
      assert(typeof rel.affinity === 'number', 'Affinity must be numeric');
      assert(typeof rel.strain === 'number', 'Strain must be numeric');

      // Director mode manual adjustment
      const directorRes = await apiRequest(`/api/chats/${sessionId}/relationship`, {
        method: 'PUT',
        token: authToken,
        body: {
          affinity: 72,
          trust: 55,
          strain: 5,
          relationshipStage: 'Close Friend / Confidant',
          relationshipMood: 'Tender'
        }
      });

      assert(directorRes.status === 200, 'Director override failed');
      const dirRel = directorRes.data.relationship || directorRes.data;
      assert(dirRel.affinity === 72, 'Director affinity mismatch');
      assert(dirRel.relationshipStage === 'Close Friend / Confidant', 'Director stage mismatch');
    });

    // -------------------------------------------------------------
    // Step 7: Complete Password Reset Flow
    // -------------------------------------------------------------
    await step('Password Reset Flow - Request OTP, verify code, submit new password, and verify re-auth', async () => {
      // 1. Request OTP
      const forgotRes = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: journeyEmail }
      });
      assert(forgotRes.status === 200 && forgotRes.data.success === true, 'Forgot password request failed');
      const otpCode = forgotRes.data.previewCode;
      assert(otpCode && otpCode.length === 6, 'Must receive 6-digit OTP');

      // 2. Verify OTP
      const verifyRes = await apiRequest('/api/auth/verify-code', {
        method: 'POST',
        body: { email: journeyEmail, code: otpCode }
      });
      assert(verifyRes.status === 200 && verifyRes.data.valid === true, 'OTP code validation failed');

      // 3. Reset Password
      const resetRes = await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: {
          email: journeyEmail,
          code: otpCode,
          newPassword: updatedPassword
        }
      });
      assert(resetRes.status === 200 && resetRes.data.success === true, 'Reset password failed');

      // 4. Verify old credentials no longer authenticate
      const oldLoginRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { username: journeyUser, password: initialPassword }
      });
      assert(oldLoginRes.status === 401, 'Old password must be rejected');

      // 5. Verify new credentials authenticate and issue new token
      const newLoginRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { username: journeyUser, password: updatedPassword }
      });
      assert(newLoginRes.status === 200 && newLoginRes.data.token, 'New password must authenticate successfully');
      authToken = newLoginRes.data.token;
    });
  } finally {
    // -------------------------------------------------------------
    // Cleanup Ephemeral Workflow Fixtures
    // -------------------------------------------------------------
    if (characterId && authToken) {
      try {
        await apiRequest(`/api/character/${characterId}`, { method: 'DELETE', token: authToken });
      } catch {}
    }
    await cleanupTestData([journeyUser], [journeyEmail]);
  }

  console.log(`\nTier 4 Summary: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}
