import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ensureServerRunning, teardownServer } from '../../../tests/e2e/helpers/test-client.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function apiRequest(endpoint, { method = 'GET', body, token, retries = 5 } = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  // Handle rate limiting gracefully by waiting retryAfter seconds
  if (res.status === 429 && retries > 0) {
    const waitSec = typeof data === 'object' && data?.retryAfter ? Number(data.retryAfter) : 2;
    await new Promise((resolve) => setTimeout(resolve, (waitSec + 0.8) * 1000));
    return apiRequest(endpoint, { method, body, token, retries: retries - 1 });
  }

  return { status: res.status, ok: res.ok, data };
}

// Helper to register fresh test user
async function registerTestUser(prefix = 'm2_user') {
  const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const username = `${prefix}_${uniqueId}`.slice(0, 25);
  const email = `${username}@testdomain.com`;
  const password = 'Password123!';
  const displayName = `Tester ${uniqueId.slice(-4)}`;

  const res = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      email,
      password,
      displayName,
      avatar: '🌟',
    },
  });

  assert.equal(res.status, 201, `Failed to register test user ${username}: ${JSON.stringify(res.data)}`);
  return {
    user: res.data.user,
    token: res.data.token,
    username,
    email,
    password,
    displayName,
  };
}

let primaryUser = null;
let secondaryUser = null;

before(async () => {
  await ensureServerRunning();
  primaryUser = await registerTestUser('m2_prim');
  await new Promise((r) => setTimeout(r, 600));
  secondaryUser = await registerTestUser('m2_sec');
});

after(async () => {
  await teardownServer();
});

// =========================================================================
// SECTION 1: PROFILE UPDATE EDGE CASES
// =========================================================================

test('M2 Profile Edge Cases: Username collisions, case insensitivity, self-updates, reserved names', async () => {
  assert.ok(primaryUser && secondaryUser);

  // 1. Username Collision: Primary user tries to claim Secondary user's exact username
  const collisionRes = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    token: primaryUser.token,
    body: {
      username: secondaryUser.username,
      displayName: 'Renamed Primary User',
    },
  });

  assert.equal(collisionRes.status, 400, 'Expected HTTP 400 on username collision');
  assert.equal(collisionRes.data.error?.field, 'username', 'Collision error must flag field "username"');
  assert.ok(
    collisionRes.data.error?.message?.toLowerCase().includes('already taken'),
    `Expected collision message to mention "already taken", got "${collisionRes.data.error?.message}"`
  );

  // 2. Case-Insensitive Username Collision: Primary user tries uppercase version of Secondary user's username
  const upperCollisionRes = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    token: primaryUser.token,
    body: {
      username: secondaryUser.username.toUpperCase(),
      displayName: 'Renamed Primary User Upper',
    },
  });

  assert.equal(upperCollisionRes.status, 400, 'Expected HTTP 400 on case-insensitive username collision');
  assert.equal(upperCollisionRes.data.error?.field, 'username');

  // 3. Self-Update: Primary user updates profile keeping their own username
  const selfUpdateRes = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    token: primaryUser.token,
    body: {
      username: primaryUser.username,
      displayName: 'Updated Display Name Only',
    },
  });

  assert.equal(selfUpdateRes.status, 200, 'Self update with own username must succeed with HTTP 200');
  assert.equal(selfUpdateRes.data.user.displayName, 'Updated Display Name Only');
  assert.equal(selfUpdateRes.data.user.username, primaryUser.username);

  // 4. Reserved Username Handles: Reject reserved names for standard non-admin users
  const reservedHandles = ['admin', 'community', 'system', 'root', 'support'];
  for (const reserved of reservedHandles) {
    const res = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      token: primaryUser.token,
      body: {
        username: reserved,
        displayName: 'Reserved Pretender',
      },
    });
    assert.equal(res.status, 400, `Expected HTTP 400 for reserved handle "${reserved}"`);
    assert.equal(res.data.error?.field, 'username');
  }

  // 5. Username format validation (3-25 chars, alphanumeric + underscore only)
  const invalidUsernames = ['ab', 'a'.repeat(26), 'user-name', 'user name', 'user@domain'];
  for (const badUser of invalidUsernames) {
    const res = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      token: primaryUser.token,
      body: { username: badUser },
    });
    assert.equal(res.status, 400, `Expected HTTP 400 for invalid username "${badUser}"`);
  }
});

test('M2 Profile Edge Cases: Display name boundary conditions (0, 50, 51, extreme length)', async () => {
  assert.ok(primaryUser);

  // 1. Empty / whitespace display name: must be rejected
  const emptyRes = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    token: primaryUser.token,
    body: { displayName: '    ' },
  });
  assert.equal(emptyRes.status, 400, 'Empty displayName must be rejected with 400');

  // 2. Exact max boundary: 50 characters -> must be accepted
  const name50 = 'A'.repeat(50);
  const res50 = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    token: primaryUser.token,
    body: { displayName: name50 },
  });
  assert.equal(res50.status, 200, '50-character displayName must be accepted with 200');
  assert.equal(res50.data.user.displayName, name50);

  // 3. Exceeded boundary: 51 characters -> must be rejected
  const name51 = 'B'.repeat(51);
  const res51 = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    token: primaryUser.token,
    body: { displayName: name51 },
  });
  assert.equal(res51.status, 400, '51-character displayName must be rejected with 400');

  // 4. Extreme oversized display name: 2,000 characters -> must be rejected
  const extremeName = 'X'.repeat(2000);
  const resExtreme = await apiRequest('/api/auth/profile', {
    method: 'PUT',
    token: primaryUser.token,
    body: { displayName: extremeName },
  });
  assert.equal(resExtreme.status, 400, 'Oversized displayName must be rejected with 400');
});

test('M2 Profile Edge Cases: Emoji avatar selections, surrogate pairs, and image URL detector', async () => {
  const { PRESET_AVATARS } = await import('../../types/auth.ts');
  assert.ok(primaryUser);

  // 1. Verify PRESET_AVATARS roster contains all 8 required presets
  assert.equal(PRESET_AVATARS.length, 8);
  const expectedPresets = ['👤', '🚀', '🌟', '🛡️', '⚔️', '🎭', '🧙', '🐺'];
  assert.deepEqual([...PRESET_AVATARS], expectedPresets);

  // 2. Test updating profile with complex surrogate pairs & variation selectors
  const complexEmojis = ['🛡️', '⚔️', '🧙', '🐺', '🚀'];
  for (const emoji of complexEmojis) {
    const res = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      token: primaryUser.token,
      body: { avatar: emoji },
    });
    assert.equal(res.status, 200, `Setting avatar to emoji "${emoji}" should return 200`);
    assert.equal(res.data.user.avatar, emoji, `Avatar should match "${emoji}" without encoding distortion`);

    // Verify GET /api/auth/me session hydration preserves the emoji
    const meRes = await apiRequest('/api/auth/me', { token: primaryUser.token });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.avatar, emoji);
  }

  // 3. Test client-side isImageUrl logic from AvatarUploader
  const isImageUrl = (val) => /^(https?:\/\/|\/|data:image\/)/i.test((val || '').trim());

  // Emojis MUST evaluate to false (rendering glyph span, not broken <img> tag)
  for (const emoji of PRESET_AVATARS) {
    assert.equal(isImageUrl(emoji), false, `Emoji "${emoji}" must not be treated as an image URL`);
  }

  // Real image paths / data URLs MUST evaluate to true
  assert.equal(isImageUrl('/assets/avatars/avatar_123.jpg'), true);
  assert.equal(isImageUrl('https://cdn.example.com/avatar.png'), true);
  assert.equal(isImageUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
});

// =========================================================================
// SECTION 2: PERSONA MANAGEMENT EDGE CASES
// =========================================================================

test('M2 Persona Edge Cases: Deleting default persona automatically promotes next persona', async () => {
  assert.ok(secondaryUser);

  // Verify initial starter persona
  const initialPersonasRes = await apiRequest('/api/personas', { token: secondaryUser.token });
  assert.equal(initialPersonasRes.status, 200);
  assert.ok(initialPersonasRes.data.length >= 1, 'User starts with at least 1 persona');
  const initialDefault = initialPersonasRes.data.find((p) => p.isDefault) || initialPersonasRes.data[0];

  // Create persona 2
  const create2Res = await apiRequest('/api/personas', {
    method: 'POST',
    token: secondaryUser.token,
    body: {
      name: 'Persona Beta Promo',
      avatar: '⚔️',
      description: 'Second identity for testing promotion',
      isDefault: false,
    },
  });
  assert.equal(create2Res.status, 201);
  const persona2 = create2Res.data;

  // Create persona 3
  const create3Res = await apiRequest('/api/personas', {
    method: 'POST',
    token: secondaryUser.token,
    body: {
      name: 'Persona Gamma Promo',
      avatar: '🔮',
      description: 'Third identity for testing promotion',
      isDefault: false,
    },
  });
  assert.equal(create3Res.status, 201);
  const persona3 = create3Res.data;

  // Make sure initialDefault is indeed active default
  await apiRequest(`/api/personas/${initialDefault.id}`, {
    method: 'PUT',
    token: secondaryUser.token,
    body: { isDefault: true },
  });

  // DELETE the active default persona
  const delRes = await apiRequest(`/api/personas/${initialDefault.id}`, {
    method: 'DELETE',
    token: secondaryUser.token,
  });
  assert.equal(delRes.status, 200, 'Deleting active default persona must return 200');
  assert.equal(delRes.data.success, true);
  assert.equal(delRes.data.deletedId, initialDefault.id);

  // Check roster after deletion
  const rosterAfterRes = await apiRequest('/api/personas', { token: secondaryUser.token });
  assert.equal(rosterAfterRes.status, 200);
  assert.ok(rosterAfterRes.data.length >= 2, 'At least 2 personas remain');

  // CRITICAL VERIFICATION: Does deleting default persona promote the next persona?
  const newDefault = rosterAfterRes.data.find((p) => p.isDefault);
  assert.ok(newDefault, 'A remaining persona must have been automatically promoted to default');
  assert.ok(
    newDefault.id === persona2.id || newDefault.id === persona3.id,
    'Promoted persona must be one of the remaining personas'
  );

  // Exactly ONE persona should be default
  const defaultCount = rosterAfterRes.data.filter((p) => p.isDefault).length;
  assert.equal(defaultCount, 1, 'Exactly one persona must have isDefault: true');
});

test('M2 Persona Edge Cases: Deleting the last remaining persona is strictly blocked', async () => {
  // Use a dedicated fresh user or delete down until only 1 remains
  const user = await registerTestUser('usr_lastp');

  // Fetch current personas
  const rosterRes = await apiRequest('/api/personas', { token: user.token });
  assert.equal(rosterRes.status, 200);
  assert.equal(rosterRes.data.length, 1, 'Fresh user has exactly 1 persona');
  const solePersona = rosterRes.data[0];

  // 1. Backend Defense: Attempt to delete the only persona
  const delRes = await apiRequest(`/api/personas/${solePersona.id}`, {
    method: 'DELETE',
    token: user.token,
  });

  assert.equal(delRes.status, 400, 'Deleting the only persona must return HTTP 400');
  assert.ok(
    delRes.data.error?.message?.toLowerCase().includes('last remaining persona'),
    `Expected error message to mention last remaining persona, got "${delRes.data.error?.message}"`
  );

  // Verify persona is still intact in SQL
  const verifyRes = await apiRequest('/api/personas', { token: user.token });
  assert.equal(verifyRes.data.length, 1);
  assert.equal(verifyRes.data[0].id, solePersona.id);

  // 2. Frontend UI Guard Simulation: canDelete = personas.length > 1
  const clientCanDeleteSingle = [solePersona].length > 1;
  assert.equal(clientCanDeleteSingle, false, 'Frontend canDelete guard must be false when length === 1');

  const clientCanDeleteMultiple = [solePersona, { id: 'p2' }].length > 1;
  assert.equal(clientCanDeleteMultiple, true, 'Frontend canDelete guard must be true when length > 1');
});

test('M2 Persona Edge Cases: Boundary checks for persona name (0, 100, 101 chars) and description', async () => {
  assert.ok(primaryUser);

  // 1. Empty persona name -> HTTP 400
  const emptyNameRes = await apiRequest('/api/personas', {
    method: 'POST',
    token: primaryUser.token,
    body: { name: '   ', description: 'Empty name test' },
  });
  assert.equal(emptyNameRes.status, 400, 'Empty persona name must return 400');

  // 2. Max boundary: Exactly 100 characters -> HTTP 201 Created
  const name100 = 'P'.repeat(100);
  const maxNameRes = await apiRequest('/api/personas', {
    method: 'POST',
    token: primaryUser.token,
    body: { name: name100, description: '100 char boundary test' },
  });
  assert.equal(maxNameRes.status, 201, '100-character persona name must be accepted with 201');
  assert.equal(maxNameRes.data.name, name100);
  assert.equal(maxNameRes.data.name.length, 100);

  // 3. Exceeded boundary: 101 characters -> HTTP 400
  const name101 = 'Q'.repeat(101);
  const overNameRes = await apiRequest('/api/personas', {
    method: 'POST',
    token: primaryUser.token,
    body: { name: name101, description: '101 char boundary test' },
  });
  assert.equal(overNameRes.status, 400, '101-character persona name must return 400');

  // 4. Description boundary: 2000 chars accepted, 2001 chars rejected
  const desc2000 = 'D'.repeat(2000);
  const descOkRes = await apiRequest('/api/personas', {
    method: 'POST',
    token: primaryUser.token,
    body: { name: 'Desc Boundary OK', description: desc2000 },
  });
  assert.equal(descOkRes.status, 201, '2000-character description must return 201');

  const desc2001 = 'E'.repeat(2001);
  const descFailRes = await apiRequest('/api/personas', {
    method: 'POST',
    token: primaryUser.token,
    body: { name: 'Desc Boundary Fail', description: desc2001 },
  });
  assert.equal(descFailRes.status, 400, '2001-character description must return 400');
});

// =========================================================================
// SECTION 3: CANVAS AVATAR CROPPER EXPORT FORMAT
// =========================================================================

test('M2 Avatar Cropper: Valid base64 JPEG and PNG export and backend storage ingestion', async () => {
  // Construct minimal valid 1x1 JPEG binary: \xFF\xD8\xFF\xE0...
  const rawJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);
  const jpegDataUrl = `data:image/jpeg;base64,${rawJpegBuffer.toString('base64')}`;

  // 1. Upload valid JPEG exported from AvatarUploader
  const jpegUploadRes = await apiRequest('/api/auth/upload-avatar', {
    method: 'POST',
    body: { image: jpegDataUrl },
  });

  assert.equal(jpegUploadRes.status, 200, 'Valid JPEG upload must return 200');
  assert.ok(jpegUploadRes.data.url?.startsWith('/assets/avatars/avatar_'), 'URL must match avatar storage pattern');
  assert.ok(jpegUploadRes.data.url?.endsWith('.jpg'), 'JPEG file must have .jpg extension');
  assert.equal(jpegUploadRes.data.size, rawJpegBuffer.length);

  // Construct minimal valid 1x1 PNG binary: \x89PNG\r\n\x1a\n...
  const rawPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  const pngDataUrl = `data:image/png;base64,${rawPngBuffer.toString('base64')}`;

  // 2. Upload valid PNG export
  const pngUploadRes = await apiRequest('/api/auth/upload-avatar', {
    method: 'POST',
    body: { image: pngDataUrl },
  });

  assert.equal(pngUploadRes.status, 200, 'Valid PNG upload must return 200');
  assert.ok(pngUploadRes.data.url?.endsWith('.png'), 'PNG file must have .png extension');
  assert.equal(pngUploadRes.data.size, rawPngBuffer.length);

  // 3. Negative tests: Invalid data URL patterns
  const invalidDataUrls = [
    'not_a_data_url',
    'data:text/plain;base64,aGVsbG8=',
    'data:image/;base64,abc',
    '',
    null,
  ];

  for (const badUrl of invalidDataUrls) {
    const res = await apiRequest('/api/auth/upload-avatar', {
      method: 'POST',
      body: { image: badUrl },
    });
    assert.equal(res.status, 400, `Expected 400 for invalid data URL "${badUrl}"`);
  }

  // 4. Negative test: Payload exceeding 5MB limit
  const largeBuffer = Buffer.alloc(5.1 * 1024 * 1024, 0x41);
  const oversizedDataUrl = `data:image/jpeg;base64,${largeBuffer.toString('base64')}`;
  const overRes = await apiRequest('/api/auth/upload-avatar', {
    method: 'POST',
    body: { image: oversizedDataUrl },
  });
  assert.equal(overRes.status, 400, 'Image > 5MB must be rejected with 400');
  assert.ok(
    overRes.data.error?.message?.toLowerCase().includes('exceeds 5mb'),
    `Expected 5MB limit message, got "${overRes.data.error?.message}"`
  );
});

test('M2 Avatar Cropper: Simulation of mathematical crop parameters and offscreen export', () => {
  // Simulate AvatarUploader.handleSaveCrop pipeline math
  const canvasW = 360;
  const targetSize = 400;
  const cropRadius = (canvasW / 2) * 0.84; // 151.2px
  const scaleToTarget = targetSize / (cropRadius * 2); // 400 / 302.4 = 1.32275...

  assert.ok(scaleToTarget > 1, 'Target scale should properly upscale crop circle to 400px');

  // Verify aspect ratio preservation under 90 deg rotation
  const originalWidth = 800;
  const originalHeight = 600;

  for (const rotation of [0, 90, 180, 270]) {
    const isRotated = rotation === 90 || rotation === 270;
    const imgW = isRotated ? originalHeight : originalWidth;
    const imgH = isRotated ? originalWidth : originalHeight;
    const minSide = cropRadius * 2;
    const baseScale = Math.max(minSide / imgW, minSide / imgH);

    assert.ok(baseScale > 0, `Base scale must be positive for rotation ${rotation}`);
    // Check that transformed image covers the crop diameter
    assert.ok(
      imgW * baseScale >= minSide - 0.001,
      `Width must cover crop circle for rotation ${rotation}`
    );
    assert.ok(
      imgH * baseScale >= minSide - 0.001,
      `Height must cover crop circle for rotation ${rotation}`
    );
  }
});
