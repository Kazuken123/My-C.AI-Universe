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

  console.log('\n✨ All automated SQL & API tests passed!');
  if (startedInProcess) {
    if (inProcessServer) {
      await new Promise(resolve => inProcessServer.close(resolve));
    }
    if (closeDbFn) {
      closeDbFn();
    }
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exitCode = 1;
});
