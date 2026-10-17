/**
 * E2E Test Client & Execution Helper
 * Provides unified HTTP, Server-Sent Events (SSE), and server lifecycle management.
 */

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

let inProcessServer = null;
let closeDbFn = null;
let startedInProcess = false;

/**
 * Ensures the target API / proxy server is running.
 * If server is offline and targeting port 3000, starts the Express backend in-process.
 */
export async function ensureServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      return { started: false, url: BASE_URL };
    }
  } catch {
    // Offline, attempt in-process startup
  }

  if (BASE_URL.includes(':3000')) {
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    const srvMod = await import('../../../server.js');
    const dbMod = await import('../../../backend/db/database.js');
    inProcessServer = srvMod.httpServer;
    closeDbFn = dbMod.closeDatabase;
    startedInProcess = true;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { started: true, url: BASE_URL };
  }

  throw new Error(`Target server at ${BASE_URL} is unreachable and cannot be auto-started.`);
}

/**
 * Gracefully shuts down in-process server if initialized by tests.
 */
export async function teardownServer() {
  if (startedInProcess) {
    if (inProcessServer) {
      await new Promise((resolve) => inProcessServer.close(resolve));
    }
    if (closeDbFn) {
      closeDbFn();
    }
  }
}

/**
 * Standard HTTP JSON request helper.
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };

  const config = {
    method: options.method || 'GET',
    headers,
    signal: options.signal || AbortSignal.timeout(10000)
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  } else if (options.body) {
    config.body = options.body;
  }

  const res = await fetch(url, config);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    data: json
  };
}

/**
 * Consumes an SSE stream (e.g. /api/chat?stream=true) and aggregates tokens and done event.
 */
export async function consumeSSEStream(endpoint, payload, token) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });

  if (!res.ok) {
    const errorBody = await res.text();
    return {
      status: res.status,
      ok: false,
      error: errorBody
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const tokens = [];
  let donePayload = null;
  let rawBytesCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    rawBytesCount += value.length;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Retain incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr) continue;

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.token) {
          tokens.push(parsed.token);
        }
        if (parsed.done) {
          donePayload = parsed;
        }
      } catch {
        // Skip unparseable heartbeat or comment
      }
    }
  }

  return {
    status: res.status,
    ok: true,
    tokens,
    fullText: tokens.join(''),
    donePayload,
    rawBytesCount
  };
}

/**
 * Purges ephemeral test records from database.
 */
export async function cleanupTestData(usernames = [], emails = []) {
  try {
    const dbMod = await import('../../../backend/db/database.js');
    const db = dbMod.getDatabase();

    for (const un of usernames) {
      if (un) {
        await db.prepare('DELETE FROM users WHERE username = ? COLLATE NOCASE').run(un);
      }
    }

    for (const em of emails) {
      if (em) {
        await db.prepare('DELETE FROM password_resets WHERE email = ? COLLATE NOCASE').run(em);
      }
    }

    // Clean up orphaned records
    await db.prepare('DELETE FROM user_personas WHERE user_id NOT IN (SELECT id FROM users) AND user_id IS NOT NULL').run();
    await db.prepare('DELETE FROM chat_sessions WHERE user_id NOT IN (SELECT id FROM users) AND user_id IS NOT NULL').run();
  } catch (err) {
    // Non-fatal notice during test teardown
  }
}
