import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import vm from 'node:vm';
import path from 'node:path';

if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH || process.env.TURSO_DATABASE_URL?.trim() || !process.env.DOTENV_CONFIG_PATH || path.dirname(process.env.SQLITE_PATH) !== process.env.DATA_DIR) {
  throw Error('Use scripts/run-tests.js for isolated storage.');
}
writeFileSync(process.env.SQLITE_PATH, '', { flag: 'wx' });

const { getDatabase, closeDatabase } = await import('../backend/db/database.js');
const { chatSessionRepository: repo } = await import('../backend/repositories/ChatSessionRepository.js');
const { ChatSession } = await import('../backend/models/ChatSession.js');
const { Character } = await import('../backend/models/Character.js');
const { ChatController } = await import('../backend/controllers/chat.controller.js');
const { relationshipService: rel } = await import('../backend/services/relationship.service.js');
const { snapshot } = await import('../backend/services/turn-state.js');

const db = getDatabase();
after(closeDatabase);

let seq = 0;
async function createFixture() {
  const n = ++seq;
  const user = 'feedback_user_' + n;
  const char = 'feedback_char_' + n;
  await db.prepare("INSERT INTO users (id,username,password_hash,display_name,created_at,updated_at) VALUES (?,?,'fixture','Fixture','now','now')").run(user, user);
  await db.prepare("INSERT INTO characters (id,name,system_prompt,created_at,updated_at) VALUES (?,'Fixture','Fixture','now','now')").run(char);
  const session = new ChatSession({ userId: user, characterId: char, affinity: 50, trust: 50, relationshipStage: 'Acquaintance' });
  const greeting = session.addMessage({ role: 'model', content: 'Welcome to the scene.' });
  session.pendingEvent = { kind: 'initial', messageId: greeting.id, position: 0, before: snapshot(session) };
  await repo.save(session);
  return { user, char, session };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    headers: {},
    events: [],
    setHeader(k, v) { this.headers[k] = v; },
    flushHeaders() { this.headersSent = true; },
    write(s) { this.events.push(s); },
    end() { this.ended = true; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; return this; }
  };
}

function createController(f, orchestrator) {
  const character = new Character({ id: f.char, name: 'Fixture', personality: 'Kind actor.' });
  return new ChatController(
    repo,
    { findById: async () => character, incrementInteractions: async () => {} },
    { findDefault: async () => null, findById: async () => null },
    { retrieveRelevantMemories: async () => [], getSessionStorySummary: async () => '', updateRollingStorySummary: async () => null, detectAndStoreFromTurn: async () => {} },
    orchestrator || { chat: async () => 'Continuation reply from character.' },
    rel,
    { appraise: async () => null }
  );
}

test('1. Collapsed sidebar preserves the + button icon visibility across themes', () => {
  const baseCss = readFileSync('frontend/css/base.css', 'utf8');
  const orbitCss = readFileSync('frontend/css/orbit.css', 'utf8');

  // Verify collapsed rule exists and gives high-contrast icon visibility
  assert.ok(baseCss.includes('.sidebar.collapsed .sidebar-cta-wrap .btn-island'));
  assert.ok(baseCss.includes('color: var(--text-on-accent) !important'));
  assert.ok(orbitCss.includes('.sidebar.collapsed .sidebar-cta-wrap .btn-island'));
  assert.ok(orbitCss.includes('color: var(--text-on-accent) !important'));
});

test('2. Response Lab sidebar link and page access handle admin /api/auth/me payload, cookie sync, and server RBAC', async () => {
  const commonJs = readFileSync('frontend/js/common.js', 'utf8');
  assert.ok(commonJs.includes("currentUser.role === 'admin'"));
  assert.ok(commonJs.includes('sidebarResponseLabLink'));

  const responseLabSource = readFileSync('frontend/js/response-lab.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/init\(\)\.catch\(error => .*\);\s*$/, '');

  async function runResponseLabInit(mePayload) {
    const controls = new Map();
    const redirects = [];
    const el = (id) => {
      if (!controls.has(id)) {
        controls.set(id, {
          value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, required: false, checked: false,
          classList: { toggle() {} },
          addEventListener() {},
          dispatchEvent() {}
        });
      }
      return controls.get(id);
    };
    const context = vm.createContext({
      api: {
        getToken: () => 'jwt_token_123',
        getMe: async () => mePayload,
        getCharacters: async () => [{ id: 'char_1', name: 'Kana Arima' }],
        getPersonas: async () => [{ id: 'p_1', name: 'Traveler' }],
        getChatSessions: async () => [{ id: 'sess_1', title: 'Opening', messageCount: 2 }],
        request: async () => [{ id: 'lab_1', title: 'Test Lab' }]
      },
      RELATIONSHIP_PRESETS: [{ stage: 'Stranger / Neutral', label: 'Stranger' }],
      AbortController,
      URL,
      URLSearchParams,
      Event: class Event { constructor(type) { this.type = type; } },
      location: { search: '', href: 'http://localhost/response-lab' },
      history: { replaceState() {} },
      window: { location: { replace: (url) => redirects.push(url) } },
      document: { getElementById: el, querySelectorAll: () => [] },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      setTimeout,
      clearTimeout
    });
    vm.runInContext(responseLabSource, context);
    await vm.runInContext('init()', context);
    return { controls, redirects };
  }

  // 2a. Admin user wrapped in { user: { role: 'admin' }, authenticated: true } stays on page & populates UI
  const adminResult = await runResponseLabInit({ user: { id: 'admin_1', role: 'admin' }, authenticated: true });
  assert.deepEqual(adminResult.redirects, [], 'Admin account must NOT be redirected away from /response-lab');
  assert.equal(adminResult.controls.get('setupForm').hidden, false);
  assert.match(adminResult.controls.get('character').innerHTML, /Kana Arima/);
  assert.match(adminResult.controls.get('savedLab').innerHTML, /Test Lab/);

  // 2b. Non-admin user redirects to /
  const userResult = await runResponseLabInit({ user: { id: 'user_1', role: 'user' }, authenticated: true });
  assert.deepEqual(userResult.redirects, ['/']);

  // 2c. Unauthenticated { user: null } shows authNotice instead of redirecting
  const guestResult = await runResponseLabInit({ user: null, authenticated: false });
  assert.deepEqual(guestResult.redirects, []);
  assert.equal(guestResult.controls.get('authNotice').hidden, false);
  assert.equal(guestResult.controls.get('setupForm').hidden, true);
  assert.equal(guestResult.controls.get('createLab').disabled, true);

  // 2d. ApiClient.getCurrentUser() re-syncs missing cai_auth_token cookie with 14-day max-age
  const { ApiClient } = await import('../frontend/js/api.js');
  const prevStorage = globalThis.localStorage;
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const cookieWrites = [];
  globalThis.localStorage = { getItem: (k) => (k === 'cai_auth_token' ? 'admin_jwt_abc' : null), setItem() {}, removeItem() {} };
  globalThis.window = { location: { protocol: 'http:' } };
  globalThis.document = {
    _cookie: '',
    get cookie() { return this._cookie; },
    set cookie(val) { cookieWrites.push(val); this._cookie = val; }
  };
  try {
    const client = new ApiClient();
    client.getMe = async () => ({ user: { id: 'admin_1', role: 'admin' }, authenticated: true });
    const me = await client.getCurrentUser();
    assert.equal(me?.role, 'admin');
    assert.equal(cookieWrites.length, 1);
    assert.match(cookieWrites[0], /^cai_auth_token=admin_jwt_abc;/);
    assert.match(cookieWrites[0], /max-age=1209600/);
  } finally {
    if (prevStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevStorage;
    if (prevDocument === undefined) delete globalThis.document; else globalThis.document = prevDocument;
    if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
  }
});

test('3. ChatController updateChatMessage updates rating for Like (4), Dislike (1), and Reset (0)', async () => {
  const f = await createFixture();
  const c = createController(f);
  const msgId = f.session.messages[0].id;

  // Like (rating 4)
  const resLike = createMockResponse();
  await c.updateChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id, messageId: msgId }, body: { rating: 4 } }, resLike);
  assert.equal(resLike.statusCode, 200);
  let sessionInDb = await repo.findById(f.session.id, f.user);
  assert.equal(sessionInDb.messages[0].rating, 4);

  // Dislike (rating 1)
  const resDislike = createMockResponse();
  await c.updateChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id, messageId: msgId }, body: { rating: 1 } }, resDislike);
  assert.equal(resDislike.statusCode, 200);
  sessionInDb = await repo.findById(f.session.id, f.user);
  assert.equal(sessionInDb.messages[0].rating, 1);

  // Reset to unrated (rating 0)
  const resReset = createMockResponse();
  await c.updateChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id, messageId: msgId }, body: { rating: 0 } }, resReset);
  assert.equal(resReset.statusCode, 200);
  sessionInDb = await repo.findById(f.session.id, f.user);
  assert.equal(sessionInDb.messages[0].rating, 0);
});

test('4. Auto-agree records chosen take (rating 4) when user stops regenerating and continues scene', async () => {
  const f = await createFixture();
  let regenCalls = 0;
  const c = createController(f, {
    chat: async () => `Reshot take ${++regenCalls}`
  });

  const msgId = f.session.messages[0].id;

  // Generate 2 additional takes for the initial model message
  await c.sendChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id }, body: { charId: f.char, sessionId: f.session.id, regenerate: true, messageId: msgId } }, createMockResponse());
  await c.sendChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id }, body: { charId: f.char, sessionId: f.session.id, regenerate: true, messageId: msgId } }, createMockResponse());

  let sessionAfterRegen = await repo.findById(f.session.id, f.user);
  const targetMsg = sessionAfterRegen.messages.find(m => m.id === msgId);
  assert.equal(targetMsg.variants.length, 3);
  assert.equal(targetMsg.rating, 0); // Not rated yet

  // User stops regenerating and clicks Continue (advancing character scene)
  const resContinue = createMockResponse();
  await c.sendChatMessage({
    user: { id: f.user },
    params: { sessionId: f.session.id },
    body: { charId: f.char, sessionId: f.session.id, continue: true }
  }, resContinue);
  assert.equal(resContinue.statusCode, 200);

  // Verify that the target message with variants was automatically marked as agreed (rating = 4)
  const sessionAfterContinue = await repo.findById(f.session.id, f.user);
  const agreedMsg = sessionAfterContinue.messages.find(m => m.id === msgId);
  assert.equal(agreedMsg.rating, 4, 'Target message with multiple takes must auto-agree (rating=4) when user advances the scene');
});

test('5. Auto-agree does NOT overwrite explicit dislike (rating 1) when user sends next message', async () => {
  const f = await createFixture();
  let regenCalls = 0;
  const c = createController(f, {
    chat: async () => `Another take ${++regenCalls}`
  });

  const msgId = f.session.messages[0].id;

  // Generate take 2
  await c.sendChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id }, body: { charId: f.char, sessionId: f.session.id, regenerate: true, messageId: msgId } }, createMockResponse());

  // User explicitly dislikes the turn
  await c.updateChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id, messageId: msgId }, body: { rating: 1 } }, createMockResponse());

  // User now sends a new chat message
  const resMsg = createMockResponse();
  await c.sendChatMessage({
    user: { id: f.user },
    params: { sessionId: f.session.id },
    body: { charId: f.char, sessionId: f.session.id, message: 'I guess that works.' }
  }, resMsg);

  // Verify that explicit dislike (rating = 1) was preserved and not overwritten to 4
  const finalSession = await repo.findById(f.session.id, f.user);
  const checkedMsg = finalSession.messages.find(m => m.id === msgId);
  assert.equal(checkedMsg.rating, 1, 'Explicit dislike must remain rating 1');
});

test('6. Server GET /response-lab allows admin cookie (200) and redirects non-admin/unauthenticated requests (302)', async () => {
  const { authService } = await import('../backend/services/auth.service.js');
  const { User } = await import('../backend/models/User.js');
  const { serverInstance } = await import('../server.js');
  if (!serverInstance.httpServer.listening) await once(serverInstance.httpServer, 'listening');

  try {
    const port = serverInstance.httpServer.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    await db.prepare("INSERT INTO users (id,username,password_hash,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,'now','now')")
      .run('rl_admin_1', 'rl_admin_1', 'hash_a', 'Admin RL', 'admin');
    await db.prepare("INSERT INTO users (id,username,password_hash,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,'now','now')")
      .run('rl_user_1', 'rl_user_1', 'hash_u', 'User RL', 'user');

    const adminToken = authService.generateToken(new User({ id: 'rl_admin_1', username: 'rl_admin_1', displayName: 'Admin RL', role: 'admin', passwordHash: 'hash_a' }));
    const userToken = authService.generateToken(new User({ id: 'rl_user_1', username: 'rl_user_1', displayName: 'User RL', role: 'user', passwordHash: 'hash_u' }));

    const unauthRes = await fetch(`${baseUrl}/response-lab`, { redirect: 'manual', headers: { Accept: 'text/html' } });
    assert.equal(unauthRes.status, 302);
    assert.equal(unauthRes.headers.get('location'), '/');

    const userRes = await fetch(`${baseUrl}/response-lab`, {
      redirect: 'manual',
      headers: { Accept: 'text/html', Cookie: `cai_auth_token=${encodeURIComponent(userToken)}` }
    });
    assert.equal(userRes.status, 302);
    assert.equal(userRes.headers.get('location'), '/');

    const adminRes = await fetch(`${baseUrl}/response-lab`, {
      redirect: 'manual',
      headers: { Accept: 'text/html', Cookie: `cai_auth_token=${encodeURIComponent(adminToken)}` }
    });
    assert.equal(adminRes.status, 200);
    const html = await adminRes.text();
    assert.match(html, /Response Lab/);
  } finally {
    serverInstance.httpServer?.closeAllConnections?.();
    await serverInstance.stop();
  }
});
