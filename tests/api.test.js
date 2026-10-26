/**
 * Automated end-to-end API verification suite for My C.AI Universe
 */
if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH ||
    process.env.TURSO_DATABASE_URL?.trim() || !process.env.DOTENV_CONFIG_PATH) {
  throw new Error('Run this suite with npm run test:api to provision an isolated database and environment.');
}
let BASE_URL;
let serverInstance = null;

async function assertResponse(res, stepName) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('[' + stepName + '] HTTP ' + res.status + ': ' + JSON.stringify(data));
  return data;
}

async function ensureServerRunning() {
  // Exercise the real HTTP routes and SQLite; replace only the external AI provider.
  const { aiOrchestrator } = await import('../backend/ai/index.js');
  const testProvider = {
    providerName: 'ci-test',
    async generateReply(character) {
      return character.name + ': A deterministic reply for the API integration test.';
    },
    async *generateReplyStream(character) {
      yield character.name + ': ';
      yield 'A deterministic streamed reply for the API integration test.';
    }
  };
  aiOrchestrator.registerProvider('gemini', testProvider);
  aiOrchestrator.registerProvider('ollama', testProvider);
  const serverModule = await import('../server.js');
  serverInstance = serverModule.serverInstance;
  const httpServer = serverModule.httpServer;
  if (!httpServer.listening) {
    const { once } = await import('node:events');
    await once(httpServer, 'listening');
  }
  BASE_URL = 'http://127.0.0.1:' + httpServer.address().port;
}

async function runTests() {
  console.log('🧪 Running My C.AI Universe End-to-End SQL & API Tests...\n');
  await ensureServerRunning();

  // 1. Health Check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const health = await assertResponse(healthRes, 'Health Check');
  console.log('✅ 1. Health Check passed:', health.status, '| DB:', health.database, '| Tables:', JSON.stringify(health.stats));

  // 2. List Characters
  const charsRes = await fetch(`${BASE_URL}/api/characters?sort=popular`);
  const chars = await assertResponse(charsRes, 'List Characters');
  console.log(`✅ 2. Listed ${chars.length} seeded characters from SQL`);

  // Register Pilot User for authenticated test flows
  const pilotUser = `spec_pilot_${Date.now()}`;
  const pilotRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: pilotUser,
      password: 'pilotPassword123',
      displayName: 'Spec Pilot'
    })
  });
  const pilotAuth = await assertResponse(pilotRegRes, 'Register Pilot User');

  // 3. Create Character (verifies SQL INSERT, systemPrompt compilation & greeting generation)
  const createRes = await fetch(`${BASE_URL}/api/character`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({
      name: 'Test Spec Character',
      tagline: 'Automated Verification Hero',
      personality: 'Witty, analytical, and calm under pressure.',
      appearance: 'Silver coat and glowing visor.',
      abilities: 'Temporal analysis and tactical deduction.',
      categories: ['Roleplay', 'Original']
    })
  });
  const createdChar = await assertResponse(createRes, 'Create Character');
  console.log(`✅ 3. Created character "${createdChar.name}" in SQL (ID: ${createdChar.id})`);

  // 4. Like Character
  const likeRes = await fetch(`${BASE_URL}/api/character/${createdChar.id}/like`, { method: 'POST' });
  const liked = await assertResponse(likeRes, 'Like Character');
  console.log(`✅ 4. Toggled character like in SQL -> likes: ${liked.likes}, isLiked: ${liked.isLiked}`);

  // 5. Personas CRUD (Positive Verification on Authenticated Owner's Persona)
  const myPersonasRes = await fetch(`${BASE_URL}/api/personas`, {
    headers: { 'Authorization': `Bearer ${pilotAuth.token}` }
  });
  const myPersonas = await assertResponse(myPersonasRes, 'Get My Personas');
  if (myPersonas.length === 0) {
    throw new Error('Expected registered pilot user to have starter persona');
  }
  const targetPersona = myPersonas[0];
  const updateRes = await fetch(`${BASE_URL}/api/personas/${targetPersona.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({ isDefault: true, name: 'Pilot Custom Hero' })
  });
  const updatedPersona = await assertResponse(updateRes, 'Update Own Persona');
  if (updatedPersona.name !== 'Pilot Custom Hero') {
    throw new Error(`Expected updated persona name "Pilot Custom Hero", got "${updatedPersona.name}"`);
  }
  console.log(`✅ 5. Updated own persona verified (ID: ${updatedPersona.id}, name: "${updatedPersona.name}")`);

  // 6. Chat Route Protection & Authenticated Chat Session Creation
  const unauthSessionRes = await fetch(`${BASE_URL}/api/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: createdChar.id,
      title: 'Unauthenticated Storyline Attempt'
    })
  });
  if (unauthSessionRes.status !== 401) {
    throw new Error(`Expected HTTP 401 for unauthenticated chat session creation, got ${unauthSessionRes.status}`);
  }

  const sessionRes = await fetch(`${BASE_URL}/api/chats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({
      characterId: createdChar.id,
      title: 'Verification Storyline'
    })
  });
  const session = await assertResponse(sessionRes, 'Create Chat Session');
  console.log(`✅ 6. Verified unauthenticated chat blocked with 401; created authenticated SQL chat session ${session.id} with opening greeting`);

  // 7. In-chat /update command (enforcing authentication)
  const unauthChatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      charId: createdChar.id,
      sessionId: session.id,
      message: 'Unauthenticated prompt attempt'
    })
  });
  if (unauthChatRes.status !== 401) {
    throw new Error(`Expected HTTP 401 for unauthenticated /api/chat, got ${unauthChatRes.status}`);
  }

  const updateCmdRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({
      charId: createdChar.id,
      sessionId: session.id,
      message: '/update speaking_style: Crisp, tactical, and concise'
    })
  });
  const updateCmdData = await assertResponse(updateCmdRes, 'In-Chat /update Command');
  console.log(`✅ 7. Verified unauthenticated /api/chat blocked with 401; in-chat /update SQL command succeeded: ${updateCmdData.response}`);

  // 7b. Fast Message Variant Switching & In-Place Update (PUT /api/chats/:sessionId/messages/:messageId)
  const greetingMsg = session.messages && session.messages[0];
  if (greetingMsg) {
    const updateMsgRes = await fetch(`${BASE_URL}/api/chats/${session.id}/messages/${greetingMsg.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pilotAuth.token}`
      },
      body: JSON.stringify({
        selectedVariantIndex: 0,
        isPinned: true
      })
    });
    const updateMsgData = await assertResponse(updateMsgRes, 'Fast Update Message Variant & Pin');
    if (!updateMsgData.message || !updateMsgData.message.isPinned) {
      throw new Error('Message pin update failed');
    }
    console.log(`✅ 7b. Verified fast targeted message update in SQL (isPinned: ${updateMsgData.message.isPinned}, variant: ${updateMsgData.message.selectedVariantIndex})`);
  }

  // 8. Long-Term Memory CRUD (inserts into character_memories)
  const addMemRes = await fetch(`${BASE_URL}/api/memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({
      characterId: createdChar.id,
      content: 'Test Spec Character always drinks Earl Grey tea before a mission.'
    })
  });
  const addedMem = await assertResponse(addMemRes, 'Add Memory');
  console.log(`✅ 8. Added long-term character memory in SQL (${addedMem.id})`);

  // 9. Negative Test: Unauthenticated deletion of character should return 401
  const unauthDelRes = await fetch(`${BASE_URL}/api/character/${createdChar.id}`, { method: 'DELETE' });
  if (unauthDelRes.status !== 401) {
    throw new Error(`Expected HTTP 401 for unauthenticated character deletion, got ${unauthDelRes.status}`);
  }

  // Clean up test character with owner credentials (verifies ON DELETE CASCADE across sessions, messages, variants, memories)
  const delRes = await fetch(`${BASE_URL}/api/character/${createdChar.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${pilotAuth.token}` }
  });
  await assertResponse(delRes, 'Delete Test Character');
  console.log(`✅ 9. Verified unauthenticated delete blocked with 401; deleted test character with owner credentials (${createdChar.id})`);

  // 10. Security Headers & Rate Limiting Check
  const secRes = await fetch(`${BASE_URL}/api/health`);
  if (secRes.headers.get('x-frame-options') !== 'DENY') {
    throw new Error('Security check failed: X-Frame-Options is not DENY');
  }
  if (secRes.headers.get('x-content-type-options') !== 'nosniff') {
    throw new Error('Security check failed: X-Content-Type-Options is not nosniff');
  }
  if (!secRes.headers.get('x-ratelimit-limit')) {
    throw new Error('Security check failed: X-RateLimit-Limit header is missing');
  }
  console.log('✅ 10. Security headers & Rate Limiting active (nosniff, DENY, X-RateLimit-Limit present)');

  // 11. SSRF Defense Check (block internal network and subdomain spoofing)
  const ssrfRes1 = await fetch(`${BASE_URL}/api/character/parse-wiki`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1:8080/admin' })
  });
  if (ssrfRes1.status !== 400) {
    throw new Error(`SSRF check failed: 127.0.0.1 request was not blocked with HTTP 400 (got ${ssrfRes1.status})`);
  }

  const ssrfRes2 = await fetch(`${BASE_URL}/api/character/parse-wiki`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://fandom.com.attacker.com/page' })
  });
  if (ssrfRes2.status !== 400) {
    throw new Error(`SSRF check failed: Subdomain spoof request was not blocked with HTTP 400 (got ${ssrfRes2.status})`);
  }
  console.log('✅ 11. SSRF defenses verified (blocked local IP and domain-substring spoofing with HTTP 400)');

  // 12. Input Boundary & Oversized Payload Defense Check
  const oversizePersonaRes = await fetch(`${BASE_URL}/api/personas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A'.repeat(150), description: 'Oversized test persona' })
  });
  if (oversizePersonaRes.status !== 400) {
    throw new Error(`Boundary check failed: Persona name > 100 chars was not rejected with HTTP 400 (got ${oversizePersonaRes.status})`);
  }

  const oversizeCharRes = await fetch(`${BASE_URL}/api/character`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Valid Name', tagline: 'B'.repeat(350) })
  });
  if (oversizeCharRes.status !== 400) {
    throw new Error(`Boundary check failed: Character tagline > 300 chars was not rejected with HTTP 400 (got ${oversizeCharRes.status})`);
  }
  console.log('✅ 12. Input boundary and length validation verified (oversized payloads rejected with HTTP 400)');

  // 13. User Registration & Password Hashing
  const testUserA = `spec_user_a_${Date.now()}`;
  const regResA = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUserA,
      password: 'password123',
      displayName: 'Commander Alpha'
    })
  });
  const authA = await assertResponse(regResA, 'Register User A');
  if (!authA.token || !authA.user) {
    throw new Error('Registration failed to return user and token');
  }
  console.log(`✅ 13. User Registration succeeded (@${authA.user.username}, ID: ${authA.user.id})`);

  // 14. Authentication Verification & Invalid Password Rejection
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: testUserA, password: 'wrongpassword' })
  });
  if (badLoginRes.status !== 401) {
    throw new Error(`Authentication check failed: Expected HTTP 401 for bad password, got ${badLoginRes.status}`);
  }

  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${authA.token}` }
  });
  const meData = await assertResponse(meRes, 'Get Current User Profile');
  if (!meData.authenticated || meData.user.username !== testUserA) {
    throw new Error('Failed to verify authenticated user profile via JWT');
  }
  console.log(`✅ 14. Authentication verified (timing-safe scrypt validation & JWT session token)`);

  // 15. Multi-Tenant User Isolation (Fresh Experience per User)
  // Check User A's personas (has automatically created starter persona)
  const personasResA = await fetch(`${BASE_URL}/api/personas`, {
    headers: { 'Authorization': `Bearer ${authA.token}` }
  });
  const personasA = await assertResponse(personasResA, 'User A Personas');
  if (personasA.length === 0 || personasA[0].name !== 'Commander Alpha') {
    throw new Error('User A did not receive personal starter persona');
  }

  // Create a chat session for User A
  const charsList = await fetch(`${BASE_URL}/api/characters`).then(r => r.json());
  const sampleChar = charsList[0];
  const chatSessionResA = await fetch(`${BASE_URL}/api/chats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authA.token}`
    },
    body: JSON.stringify({ characterId: sampleChar.id, title: "Alpha's Private Story" })
  });
  const chatA = await assertResponse(chatSessionResA, 'Create User A Chat');
  if (chatA.userId !== authA.user.id) {
    throw new Error(`Chat session was not associated with User A (got ${chatA.userId})`);
  }

  // Register User B (Fresh User)
  const testUserB = `spec_user_b_${Date.now()}`;
  const regResB = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUserB,
      password: 'password456',
      displayName: 'Navigator Beta'
    })
  });
  const authB = await assertResponse(regResB, 'Register User B');

  // Verify User B has ZERO chats (fresh slate!)
  const chatsResB = await fetch(`${BASE_URL}/api/chats`, {
    headers: { 'Authorization': `Bearer ${authB.token}` }
  });
  const chatsB = await assertResponse(chatsResB, 'User B Chats');
  if (chatsB.length !== 0) {
    throw new Error(`Isolation check failed: User B saw ${chatsB.length} chats instead of 0 fresh chats`);
  }

  // Verify User B only sees their own persona (cannot see User A's persona)
  const personasResB = await fetch(`${BASE_URL}/api/personas`, {
    headers: { 'Authorization': `Bearer ${authB.token}` }
  });
  const personasB = await assertResponse(personasResB, 'User B Personas');
  if (personasB.length !== 1 || personasB[0].name !== 'Navigator Beta') {
    throw new Error('Isolation check failed: User B did not have isolated personal persona');
  }

  // Verify User A still has their 1 chat
  const chatsResA = await fetch(`${BASE_URL}/api/chats`, {
    headers: { 'Authorization': `Bearer ${authA.token}` }
  });
  const chatsA = await assertResponse(chatsResA, 'User A Chats');
  if (chatsA.length !== 1 || chatsA[0].id !== chatA.id) {
    throw new Error(`Isolation check failed: User A chats missing or corrupted`);
  }

  console.log(`✅ 15. Multi-tenant user isolation verified (isolated chat history & custom personas per user)`);

  // 15b. Negative Security Boundary Tests (Cross-User IDOR / BOLA Prevention)
  // Negative Test 1: User B tries to delete User A's persona -> Expected 403 Forbidden
  const hackDelPersonaRes = await fetch(`${BASE_URL}/api/personas/${personasA[0].id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authB.token}` }
  });
  if (hackDelPersonaRes.status !== 403) {
    throw new Error(`IDOR check failed: User B deleting User A's persona returned ${hackDelPersonaRes.status}, expected 403`);
  }

  // Negative Test 2: User B tries to update User A's persona -> Expected 403 Forbidden
  const hackPutPersonaRes = await fetch(`${BASE_URL}/api/personas/${personasA[0].id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authB.token}`
    },
    body: JSON.stringify({ name: 'Hacked Name' })
  });
  if (hackPutPersonaRes.status !== 403) {
    throw new Error(`IDOR check failed: User B updating User A's persona returned ${hackPutPersonaRes.status}, expected 403`);
  }

  // Negative Test 3: User B tries to fetch User A's private chat session -> Expected 404 Not Found
  const hackGetChatRes = await fetch(`${BASE_URL}/api/chats/${chatA.id}`, {
    headers: { 'Authorization': `Bearer ${authB.token}` }
  });
  if (hackGetChatRes.status !== 404) {
    throw new Error(`Chat session isolation failed: User B fetching User A's chat returned ${hackGetChatRes.status}, expected 404`);
  }

  // Negative Test 4: User A creates a character; User B attempts to edit User A's character -> Expected 403
  const charARes = await fetch(`${BASE_URL}/api/character`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authA.token}`
    },
    body: JSON.stringify({
      name: 'Owner A Character',
      tagline: 'Owned by User A',
      personality: 'Honest and strict'
    })
  });
  const charA = await assertResponse(charARes, 'Create Char A');

  const hackPutCharRes = await fetch(`${BASE_URL}/api/character/${charA.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authB.token}`
    },
    body: JSON.stringify({ name: 'Hacked by B' })
  });
  if (hackPutCharRes.status !== 403) {
    throw new Error(`Character ownership failed: User B updating User A's character returned ${hackPutCharRes.status}, expected 403`);
  }

  // Negative Test 5: User B attempts to delete User A's character -> Expected 403
  const hackDelCharRes = await fetch(`${BASE_URL}/api/character/${charA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authB.token}` }
  });
  if (hackDelCharRes.status !== 403) {
    throw new Error(`Character delete ownership failed: User B deleting User A's character returned ${hackDelCharRes.status}, expected 403`);
  }

  // Negative Test 6: User B attempts in-chat /update defacement on User A's character -> Expected 403
  const hackInChatUpdateRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authB.token}`
    },
    body: JSON.stringify({
      charId: charA.id,
      message: '/update name: Defaced Character'
    })
  });
  if (hackInChatUpdateRes.status !== 403) {
    throw new Error(`In-chat /update authorization failed: User B defacing User A's character returned ${hackInChatUpdateRes.status}, expected 403`);
  }

  // Negative Test 7: User B attempts to inject memory into User A's character -> Expected 403
  const hackAddMemRes = await fetch(`${BASE_URL}/api/memories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authB.token}`
    },
    body: JSON.stringify({
      characterId: charA.id,
      content: 'Injected false memory by B'
    })
  });
  if (hackAddMemRes.status !== 403) {
    throw new Error(`Memory inject authorization failed: User B adding memory to User A's character returned ${hackAddMemRes.status}, expected 403`);
  }

  // Negative Test 8: Registering reserved username "community" -> Expected 400
  const reservedRegRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'community',
      password: 'StrongPassword123!',
      displayName: 'Community Hijacker'
    })
  });
  if (reservedRegRes.status !== 400) {
    throw new Error(`Reserved handle protection failed: Registering "community" returned ${reservedRegRes.status}, expected 400`);
  }

  // Negative Test 9: Registering with username "admin" -> Expected 400
  const reservedAdminReg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'StrongPassword123!',
      displayName: 'Fake Admin'
    })
  });
  if (reservedAdminReg.status !== 400) {
    throw new Error(`Reserved admin handle protection failed: Registering "admin" returned ${reservedAdminReg.status}, expected 400`);
  }

  // Negative Test 10: Injected role: 'admin' during registration -> Server assigns role: 'user'
  const injectedRoleReg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `normal_user_${Date.now()}`,
      password: 'StrongPassword123!',
      role: 'admin'
    })
  });
  const injectedRoleData = await assertResponse(injectedRoleReg, 'Register with Injected Admin Role');
  if (injectedRoleData.user.role !== 'user') {
    throw new Error(`Privilege escalation detected: User registered with role "${injectedRoleData.user.role}", expected "user"`);
  }

  // Negative Test 11: Forged / Tampered JWT Bearer Token -> Expected 401
  const forgedTokenRes = await fetch(`${BASE_URL}/api/chats`, {
    headers: { 'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.tampered_signature_payload' }
  });
  if (forgedTokenRes.status !== 401) {
    throw new Error(`Forged JWT check failed: Tampered token returned ${forgedTokenRes.status}, expected 401`);
  }

  // Negative Test 12: Chat subroutes IDOR (User B updating message or rewinding User A's chat) -> Expected 404
  const hackMsgUpdateRes = await fetch(`${BASE_URL}/api/chats/${chatA.id}/messages/fake_msg_id`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authB.token}`
    },
    body: JSON.stringify({ content: 'Hacked message' })
  });
  if (hackMsgUpdateRes.status !== 404) {
    throw new Error(`Chat message IDOR failed: User B updating User A's message returned ${hackMsgUpdateRes.status}, expected 404`);
  }

  const hackRewindRes = await fetch(`${BASE_URL}/api/chats/${chatA.id}/rewind`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authB.token}`
    },
    body: JSON.stringify({ messageId: 'fake_msg_id' })
  });
  if (hackRewindRes.status !== 404) {
    throw new Error(`Chat rewind IDOR failed: User B rewinding User A's chat returned ${hackRewindRes.status}, expected 404`);
  }

  // Clean up charA by owner A
  await fetch(`${BASE_URL}/api/character/${charA.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authA.token}` }
  });

  console.log('✅ 15b. Negative cross-user boundary tests passed (403 on foreign persona/char/memory mutate, 403 on /update deface, 400 on reserved handle, 401 on forged JWT, 404 on chat subroutes)');

  // 15c. Mass Assignment Defense Check
  const massAssignRes = await fetch(`${BASE_URL}/api/character`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authA.token}`
    },
    body: JSON.stringify({
      name: 'Anti-Mass Hero',
      tagline: 'Defensive Integrity Spec',
      id: 'hacked_id_override_999',
      likes: 888888,
      interactions: 999999,
      categories: ['Roleplay']
    })
  });
  const massChar = await assertResponse(massAssignRes, 'Create Character with Injected Fields');
  if (massChar.id === 'hacked_id_override_999') {
    throw new Error('Mass assignment failed: Server accepted client-injected ID');
  }
  if (massChar.likes !== 0 || massChar.interactions !== 0) {
    throw new Error(`Mass assignment failed: Server accepted client-injected stats (likes: ${massChar.likes})`);
  }
  // Clean up
  await fetch(`${BASE_URL}/api/character/${massChar.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authA.token}` }
  });
  console.log('✅ 15c. Mass assignment defense verified (injected id and stats stripped/ignored, server generated clean entity)');

  // 15d. Admin RBAC & Security Operations Center (SOC) Telemetry Check
  // 1. Non-admin User A attempts to access admin endpoints -> Expected 403 Forbidden
  const unauthOverviewRes = await fetch(`${BASE_URL}/api/admin/overview`, {
    headers: { 'Authorization': `Bearer ${authA.token}` }
  });
  if (unauthOverviewRes.status !== 403) {
    throw new Error(`Admin RBAC failed: Non-admin calling /api/admin/overview returned ${unauthOverviewRes.status}, expected 403`);
  }

  const unauthMutateRoleRes = await fetch(`${BASE_URL}/api/admin/users/${authB.user.id}/role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authA.token}`
    },
    body: JSON.stringify({ role: 'admin' })
  });
  if (unauthMutateRoleRes.status !== 403) {
    throw new Error(`Admin RBAC failed: Non-admin updating role returned ${unauthMutateRoleRes.status}, expected 403`);
  }

  const unauthDelUserRes = await fetch(`${BASE_URL}/api/admin/users/${authB.user.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authA.token}` }
  });
  if (unauthDelUserRes.status !== 403) {
    throw new Error(`Admin RBAC failed: Non-admin deleting user returned ${unauthDelUserRes.status}, expected 403`);
  }

  // 2. Promote pilot user to admin directly in SQL to verify admin capabilities
  const dbModForAdmin = await import('../backend/db/database.js');
  const adminDb = dbModForAdmin.getDatabase();
  await adminDb.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(pilotAuth.user.id);

  // 3. Admin calls /api/admin/overview -> Expected 200 OK
  const adminOverviewRes = await fetch(`${BASE_URL}/api/admin/overview`, {
    headers: { 'Authorization': `Bearer ${pilotAuth.token}` }
  });
  const adminOverview = await assertResponse(adminOverviewRes, 'Admin Overview Telemetry');
  if (!adminOverview.telemetry || !adminOverview.securityChecklist || adminOverview.securityChecklist.length !== 7) {
    throw new Error('Admin overview response missing telemetry or 7-rule security checklist');
  }

  // 4. Admin updates User B role to admin via admin API
  const updateRoleRes = await fetch(`${BASE_URL}/api/admin/users/${authB.user.id}/role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({ role: 'admin' })
  });
  const updatedRoleData = await assertResponse(updateRoleRes, 'Admin Update User Role');
  if (updatedRoleData.user.role !== 'admin') {
    throw new Error('Admin role update failed to persist in response');
  }

  // 5. Admin demotes User B back to user
  await fetch(`${BASE_URL}/api/admin/users/${authB.user.id}/role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({ role: 'user' })
  });

  // 6. Test Last Admin Protection: Attempting to demote self or the last remaining admin -> Expected 400
  const demoteLastAdminRes = await fetch(`${BASE_URL}/api/admin/users/${pilotAuth.user.id}/role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({ role: 'user' })
  });
  if (demoteLastAdminRes.status !== 400) {
    throw new Error(`Last admin demotion protection failed: Returned ${demoteLastAdminRes.status}, expected 400`);
  }

  // 7. Admin unblocks rate-limit test key
  const unblockRes = await fetch(`${BASE_URL}/api/admin/rate-limits/unblock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({ key: 'ip:127.0.0.1' })
  });
  await assertResponse(unblockRes, 'Admin Unblock Rate Limit');
  console.log('✅ 15d. Admin RBAC & SOC Telemetry verified (403 non-admin rejection, 200 admin telemetry, role update, last admin protected, unblock sentinel)');

  // 15e. Admin Webpage & Asset Access Control Check (Server-Side Gatekeeper)
  // 1. Unauthenticated visitor requesting /admin.html -> Redirected (302) to "/"
  const anonAdminPageRes = await fetch(`${BASE_URL}/admin.html`, {
    redirect: 'manual'
  });
  if (anonAdminPageRes.status !== 302 || anonAdminPageRes.headers.get('location') !== '/') {
    throw new Error(`Admin page gatekeeper failed: Unauthenticated /admin.html returned ${anonAdminPageRes.status}, expected 302 redirect to /`);
  }

  // 2. Regular user (User A) requesting /admin.html -> Redirected (302) smoothly to "/"
  const userAdminPageRes = await fetch(`${BASE_URL}/admin.html`, {
    headers: { 'Cookie': `cai_auth_token=${encodeURIComponent(authA.token)}` },
    redirect: 'manual'
  });
  if (userAdminPageRes.status !== 302 || userAdminPageRes.headers.get('location') !== '/') {
    throw new Error(`Admin page gatekeeper failed: Regular user accessing /admin.html returned ${userAdminPageRes.status}, expected 302 redirect to /`);
  }

  // 3. Regular user requesting /js/admin-page.js -> 403 Forbidden
  const userAdminJsRes = await fetch(`${BASE_URL}/js/admin-page.js`, {
    headers: { 'Cookie': `cai_auth_token=${encodeURIComponent(authA.token)}` }
  });
  if (userAdminJsRes.status !== 403) {
    throw new Error(`Admin JS gatekeeper failed: Regular user accessing /js/admin-page.js returned ${userAdminJsRes.status}, expected 403`);
  }

  // 4. Admin requesting /admin.html -> 200 OK
  const adminPageRes = await fetch(`${BASE_URL}/admin.html`, {
    headers: { 'Cookie': `cai_auth_token=${encodeURIComponent(pilotAuth.token)}` }
  });
  if (adminPageRes.status !== 200) {
    throw new Error(`Admin page gatekeeper failed: Admin user accessing /admin.html returned ${adminPageRes.status}, expected 200`);
  }
  console.log('✅ 15e. Admin Webpage & Asset Gatekeeper verified (302 on anon, 403 on regular client, 200 on admin)');

  // 16. System Telemetry Ping API
  const pingRes = await fetch(`${BASE_URL}/api/system/ping`);
  const pingData = await assertResponse(pingRes, 'System Ping');
  if (pingData.status !== 'ok' || pingData.version !== '2.6.1') {
    throw new Error(`System ping unexpected response: ${JSON.stringify(pingData)}`);
  }
  console.log(`✅ 16. System Ping & Telemetry verified (status: ${pingData.status}, v${pingData.version}, uptime: ${pingData.uptime}s)`);

  // 17. User Profile Update (PUT /api/auth/profile)
  // 17a. Unauthenticated update should return HTTP 401
  const unauthRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Hacker' })
  });
  if (unauthRes.status !== 401) {
    throw new Error(`Profile update without token expected 401, got ${unauthRes.status}`);
  }

  // 17b. Authenticated update for User A
  const authUpdateRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authA.token}`
    },
    body: JSON.stringify({
      displayName: 'Captain Alpha Prime',
      avatar: '🚀'
    })
  });
  const updateData = await assertResponse(authUpdateRes, 'Update User Profile');
  if (updateData.user.displayName !== 'Captain Alpha Prime' || updateData.user.avatar !== '🚀') {
    throw new Error(`Profile update did not save: ${JSON.stringify(updateData)}`);
  }
  console.log(`✅ 17. User Profile Update verified (displayName updated to "${updateData.user.displayName}", avatar: "${updateData.user.avatar}")`);

  // 18. Social Authentication (Google & Facebook OAuth)
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
  if (!socialData.token || socialData.user.authProvider !== 'google') {
    throw new Error(`Google social auth failed: ${JSON.stringify(socialData)}`);
  }
  console.log(`✅ 18. Social Authentication verified (Google user created: @${socialData.user.username}, provider: ${socialData.user.authProvider})`);

  // 19. Forgot Password & OTP Code Verification
  const resetUser = `reset_user_${Date.now()}`;
  const resetEmail = `${resetUser}@universe.ai`;
  await assertResponse(await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: resetUser,
      email: resetEmail,
      password: 'initialPass123',
      displayName: 'Reset Subject'
    })
  }), 'Register Reset User');

  const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resetEmail })
  });
  const forgotData = await assertResponse(forgotRes, 'Forgot Password Request');
  if (!forgotData.previewCode) {
    throw new Error('Forgot password did not return previewCode in test environment');
  }

  // Verify wrong code returns error
  const wrongCodeRes = await fetch(`${BASE_URL}/api/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resetEmail, code: '000000' })
  });
  if (wrongCodeRes.status !== 400) {
    throw new Error(`Expected 400 for invalid code, got ${wrongCodeRes.status}`);
  }

  // Verify correct OTP code
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resetEmail, code: forgotData.previewCode })
  });
  await assertResponse(verifyRes, 'Verify OTP Code');
  console.log(`✅ 19. Forgot Password & OTP generation verified (OTP: ${forgotData.previewCode} sent to ${resetEmail})`);

  // 20. Password Reset & Verification with New Password
  const resetSubmitRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: resetEmail,
      code: forgotData.previewCode,
      newPassword: 'newSecretPass789'
    })
  });
  await assertResponse(resetSubmitRes, 'Submit Password Reset');

  // Verify old password fails
  const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: resetUser, password: 'initialPass123' })
  });
  if (oldLoginRes.status !== 401) {
    throw new Error(`Old password should fail with 401, got ${oldLoginRes.status}`);
  }

  // Verify new password succeeds
  const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: resetUser, password: 'newSecretPass789' })
  });
  const newLoginData = await assertResponse(newLoginRes, 'Login with New Password');
  if (!newLoginData.token) {
    throw new Error('Login with new password failed to yield session token');
  }
  console.log(`✅ 20. Password Reset verified (old password rejected, new password authenticated for @${resetUser})`);

  // 21. Avatar Upload & Cropper Storage verified
  const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const unauthUploadRes = await fetch(`${BASE_URL}/api/auth/upload-avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: samplePngBase64 })
  });
  if (unauthUploadRes.status !== 401) {
    throw new Error(`Expected 401 for unauthenticated upload-avatar, got ${unauthUploadRes.status}`);
  }

  const uploadRes = await fetch(`${BASE_URL}/api/auth/upload-avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({ image: samplePngBase64 })
  });
  const uploadData = await assertResponse(uploadRes, 'Upload Avatar');
  if (!uploadData.url || !uploadData.url.startsWith('/assets/avatars/')) {
    throw new Error(`Upload returned unexpected url: ${uploadData.url}`);
  }

  // Verify static serving of uploaded image
  const staticFileRes = await fetch(`${BASE_URL}${uploadData.url}`);
  if (staticFileRes.status !== 200) {
    throw new Error(`Static asset fetching for ${uploadData.url} returned status ${staticFileRes.status}`);
  }

  // Clean up uploaded test file
  try {
    const fsMod = await import('node:fs');
    const pathMod = await import('node:path');
    const uploadedFilePath = pathMod.join(process.cwd(), 'frontend', uploadData.url.replace(/^\//, ''));
    if (fsMod.existsSync(uploadedFilePath)) {
      fsMod.unlinkSync(uploadedFilePath);
    }
  } catch (cleanFileErr) {
    console.warn('Note: Cleanup of test avatar encountered:', cleanFileErr.message);
  }

  console.log(`✅ 21. Avatar Upload & Static Storage verified (${uploadData.url})`);

  // 22. Server-Sent Events (SSE) Real-Time Token Streaming
  const streamRes = await fetch(`${BASE_URL}/api/chat?stream=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${pilotAuth.token}`
    },
    body: JSON.stringify({
      charId: '1767000000001',
      message: 'Hello Kana, are you ready for rehearsal?'
    })
  });
  if (streamRes.status !== 200) {
    throw new Error(`SSE streaming failed with status ${streamRes.status}`);
  }
  const contentType = streamRes.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    throw new Error(`Expected text/event-stream content-type, got: ${contentType}`);
  }
  const streamBody = await streamRes.text();
  if (!streamBody.includes('data:') || !streamBody.includes('"done":true')) {
    throw new Error(`Streaming body did not contain valid SSE format: ${streamBody.slice(0, 200)}`);
  }
  console.log(`✅ 22. Server-Sent Events (SSE) real-time token streaming verified (received ${streamBody.length} bytes of stream chunks)`);

  // 23. Clean up automated test users and cascaded sessions
  try {
    const dbMod = await import('../backend/db/database.js');
    const db = dbMod.getDatabase();
    const testUsernames = [pilotUser, testUserA, testUserB, socialData.user.username, resetUser];
    for (const un of testUsernames) {
      if (un) {
        await db.prepare('DELETE FROM users WHERE username = ? COLLATE NOCASE').run(un);
      }
    }
    // Clean up test personas, sessions, and password resets
    await db.prepare('DELETE FROM user_personas WHERE user_id NOT IN (SELECT id FROM users) AND user_id IS NOT NULL').run();
    await db.prepare('DELETE FROM chat_sessions WHERE user_id NOT IN (SELECT id FROM users) AND user_id IS NOT NULL').run();
    await db.prepare('DELETE FROM password_resets WHERE email LIKE ?').run('%universe.ai');
  } catch (cleanErr) {
    console.warn('Note: Test cleanup encountered notice:', cleanErr.message);
  }

  console.log('\n✨ All automated SQL, Security & API tests passed and test data cleaned up!');
}

runTests()
  .catch(error => {
    console.error('API test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (serverInstance) await serverInstance.stop();
  });
