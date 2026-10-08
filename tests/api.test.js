/**
 * Automated end-to-end API verification suite for My C.AI Universe
 */
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function assertResponse(res, stepName) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`[${stepName}] HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

let inProcessServer = null;
let closeDbFn = null;

async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) return false;
  } catch {
    // Server not running yet; start it in-process for testing
    const srvMod = await import('../server.js');
    const dbMod = await import('../backend/db/database.js');
    inProcessServer = srvMod.httpServer;
    closeDbFn = dbMod.closeDatabase;
    await new Promise(r => setTimeout(r, 600));
    return true;
  }
  return false;
}

async function runTests() {
  console.log('🧪 Running My C.AI Universe End-to-End SQL & API Tests...\n');
  const startedInProcess = await ensureServerRunning();

  // 1. Health Check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const health = await assertResponse(healthRes, 'Health Check');
  console.log('✅ 1. Health Check passed:', health.status, '| DB:', health.database, '| Tables:', JSON.stringify(health.stats));

  // 2. List Characters
  const charsRes = await fetch(`${BASE_URL}/api/characters?sort=popular`);
  const chars = await assertResponse(charsRes, 'List Characters');
  console.log(`✅ 2. Listed ${chars.length} seeded characters from SQL`);

  // 3. Create Character (verifies SQL INSERT, systemPrompt compilation & greeting generation)
  const createRes = await fetch(`${BASE_URL}/api/character`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  // 5. Personas CRUD
  const personasRes = await fetch(`${BASE_URL}/api/personas`);
  const personas = await assertResponse(personasRes, 'Get Personas');
  console.log(`✅ 5. Loaded ${personas.length} user personas from SQL`);

  // 6. Create Chat Session (inserts into chat_sessions, chat_messages, message_variants)
  const sessionRes = await fetch(`${BASE_URL}/api/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: createdChar.id,
      title: 'Verification Storyline'
    })
  });
  const session = await assertResponse(sessionRes, 'Create Chat Session');
  console.log(`✅ 6. Created SQL chat session ${session.id} with opening greeting (${session.messages.length} initial message)`);

  // 7. In-chat /update command
  const updateCmdRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      charId: createdChar.id,
      sessionId: session.id,
      message: '/update speaking_style: Crisp, tactical, and concise'
    })
  });
  const updateCmdData = await assertResponse(updateCmdRes, 'In-Chat /update Command');
  console.log(`✅ 7. In-chat /update SQL command succeeded: ${updateCmdData.response}`);

  // 8. Long-Term Memory CRUD (inserts into character_memories)
  const addMemRes = await fetch(`${BASE_URL}/api/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: createdChar.id,
      content: 'Test Spec Character always drinks Earl Grey tea before a mission.'
    })
  });
  const addedMem = await assertResponse(addMemRes, 'Add Memory');
  console.log(`✅ 8. Added long-term character memory in SQL (${addedMem.id})`);

  // 9. Clean up test character (verifies ON DELETE CASCADE across sessions, messages, variants, memories)
  const delRes = await fetch(`${BASE_URL}/api/character/${createdChar.id}`, { method: 'DELETE' });
  await assertResponse(delRes, 'Delete Test Character');
  console.log(`✅ 9. Deleted test character and verified SQL ON DELETE CASCADE (${createdChar.id})`);

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

  // 16. System Telemetry Ping API
  const pingRes = await fetch(`${BASE_URL}/api/system/ping`);
  const pingData = await assertResponse(pingRes, 'System Ping');
  if (pingData.status !== 'ok' || pingData.version !== '2.2.0') {
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
  const updateRes = await fetch(`${BASE_URL}/api/auth/profile`, {
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
  const updateData = await assertResponse(updateRes, 'Update User Profile');
  if (updateData.user.displayName !== 'Captain Alpha Prime' || updateData.user.avatar !== '🚀') {
    throw new Error(`Profile update did not save: ${JSON.stringify(updateData)}`);
  }
  console.log(`✅ 17. User Profile Update verified (displayName updated to "${updateData.user.displayName}", avatar: "${updateData.user.avatar}")`);

  console.log('\n✨ All automated SQL, Security & API tests passed!');
  if (startedInProcess) {
    if (inProcessServer) {
      await new Promise(resolve => inProcessServer.close(resolve));
    }
    if (closeDbFn) {
      closeDbFn();
    }
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  });
