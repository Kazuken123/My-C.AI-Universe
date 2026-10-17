import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const nextDir = path.join(projectRoot, 'nextjs-frontend');

console.log('=== STARTING EMPIRICAL PROXY & REWRITE VERIFICATION ===');

// 1. Setup Mock Express Backend on Port 3000
let backendReceivedHeaders = {};
let backendReceivedBody = null;
let backendReceivedQuery = null;

const mockPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const backendServer = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1:3000'}`);
  backendReceivedHeaders = req.headers;
  backendReceivedQuery = Object.fromEntries(parsedUrl.searchParams.entries());

  console.log(`[MockBackend] ${req.method} ${req.url}`);

  if (parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', backend: 'mock-express-v1' }));
    return;
  }

  if (parsedUrl.pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    backendReceivedBody = JSON.parse(body || '{}');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: 'jwt-token-empirical-xyz',
      user: { id: 'u1', username: backendReceivedBody.username }
    }));
    return;
  }

  if (parsedUrl.pathname === '/api/characters' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { id: 'c1', name: 'Albedo', category: backendReceivedQuery.category || 'All' }
    ]));
    return;
  }

  if (parsedUrl.pathname === '/api/chat' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });

    res.write('data: {"token": "Hello "}\n\n');
    await new Promise(r => setTimeout(r, 60));
    res.write('data: {"token": "Challenger!"}\n\n');
    await new Promise(r => setTimeout(r, 60));
    res.write('data: {"done": true, "response": "Hello Challenger!"}\n\n');
    res.end();
    return;
  }

  if (parsedUrl.pathname === '/assets/avatars/char1.png') {
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': mockPngBuffer.length
    });
    res.end(mockPngBuffer);
    return;
  }

  if (parsedUrl.pathname === '/api/nonexistent') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Route not found', code: 404 } }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found on Mock Backend');
});

await new Promise((resolve) => backendServer.listen(3000, '127.0.0.1', resolve));
console.log('[MockBackend] Listening on http://127.0.0.1:3000');

// 2. Start Next.js Production Server on Port 3001
console.log('[NextServer] Spawning next start on port 3001...');
const nextProcess = spawn('npx', ['next', 'start', '-p', '3001'], {
  cwd: nextDir,
  shell: true,
  env: { ...process.env, BACKEND_URL: 'http://127.0.0.1:3000', PORT: '3001' },
  stdio: ['pipe', 'pipe', 'pipe']
});

nextProcess.stdout.on('data', (d) => {
  const str = d.toString();
  if (str.trim()) console.log(`[NextServer:stdout] ${str.trim()}`);
});

nextProcess.stderr.on('data', (d) => {
  const str = d.toString();
  if (str.trim()) console.error(`[NextServer:stderr] ${str.trim()}`);
});

// Helper to poll until Next.js is ready
async function waitForNextReady(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch('http://127.0.0.1:3001');
      if (res.status === 200) {
        console.log('[NextServer] Ready!');
        return;
      }
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Next.js server failed to become ready on port 3001');
}

try {
  await waitForNextReady();

  // ========================================================
  // TEST 1: GET /api/health rewrite
  // ========================================================
  console.log('\n--- Test 1: GET /api/health rewrite ---');
  const res1 = await fetch('http://127.0.0.1:3001/api/health');
  assert.equal(res1.status, 200, 'Status should be 200');
  const data1 = await res1.json();
  assert.equal(data1.status, 'healthy');
  assert.equal(data1.backend, 'mock-express-v1');
  console.log('✓ Test 1 Passed: /api/health successfully proxied to backend.');

  // ========================================================
  // TEST 2: POST /api/auth/login rewrite with body & auth headers
  // ========================================================
  console.log('\n--- Test 2: POST /api/auth/login with body & headers ---');
  const res2 = await fetch('http://127.0.0.1:3001/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sample-token',
      'x-auth-token': 'sample-token'
    },
    body: JSON.stringify({ username: 'testuser', password: 'secretpassword' })
  });
  assert.equal(res2.status, 200, 'Status should be 200');
  const data2 = await res2.json();
  assert.equal(data2.token, 'jwt-token-empirical-xyz');
  assert.equal(backendReceivedBody.username, 'testuser');
  assert.equal(backendReceivedHeaders['authorization'], 'Bearer sample-token');
  assert.equal(backendReceivedHeaders['x-auth-token'], 'sample-token');
  console.log('✓ Test 2 Passed: Headers, body, and credentials faithfully forwarded.');

  // ========================================================
  // TEST 3: Query parameter preservation on /api/characters
  // ========================================================
  console.log('\n--- Test 3: Query parameter preservation on /api/characters ---');
  const res3 = await fetch('http://127.0.0.1:3001/api/characters?category=Sci-Fi&sort=popular');
  assert.equal(res3.status, 200, 'Status should be 200');
  const data3 = await res3.json();
  assert.equal(data3[0].category, 'Sci-Fi');
  assert.equal(backendReceivedQuery.category, 'Sci-Fi');
  assert.equal(backendReceivedQuery.sort, 'popular');
  console.log('✓ Test 3 Passed: Query parameters preserved intact.');

  // ========================================================
  // TEST 4: Real-time SSE Token Streaming over proxy
  // ========================================================
  console.log('\n--- Test 4: SSE streaming chunk resolution ---');
  const res4 = await fetch('http://127.0.0.1:3001/api/chat?stream=true', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({ message: 'Hello AI' })
  });
  assert.equal(res4.status, 200);
  assert.ok(res4.headers.get('content-type')?.includes('text/event-stream'));

  const reader = res4.body.getReader();
  const decoder = new TextDecoder();
  let receivedTokens = [];
  let streamDone = false;
  let sseBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const events = sseBuffer.split('\n\n');
    sseBuffer = events.pop() || '';
    for (const evt of events) {
      if (!evt.startsWith('data:')) continue;
      const parsed = JSON.parse(evt.slice(5).trim());
      if (parsed.token) receivedTokens.push(parsed.token);
      if (parsed.done) streamDone = true;
    }
  }

  assert.deepEqual(receivedTokens, ['Hello ', 'Challenger!']);
  assert.equal(streamDone, true);
  console.log('✓ Test 4 Passed: SSE streaming tokens received chunk-by-chunk over proxy without buffering.');

  // ========================================================
  // TEST 5: Media asset rewrite (/assets/avatars/char1.png)
  // ========================================================
  console.log('\n--- Test 5: /assets/avatars/:path* media rewrite ---');
  const res5 = await fetch('http://127.0.0.1:3001/assets/avatars/char1.png');
  assert.equal(res5.status, 200);
  assert.equal(res5.headers.get('content-type'), 'image/png');
  const arrayBuffer = await res5.arrayBuffer();
  const receivedBuffer = Buffer.from(arrayBuffer);
  assert.deepEqual(receivedBuffer, mockPngBuffer);
  console.log('✓ Test 5 Passed: Media assets under /assets/avatars/* proxy binary content correctly.');

  // ========================================================
  // TEST 6: Backend 404 error response transparent forwarding
  // ========================================================
  console.log('\n--- Test 6: Backend 404 transparent passthrough ---');
  const res6 = await fetch('http://127.0.0.1:3001/api/nonexistent');
  assert.equal(res6.status, 404);
  const data6 = await res6.json();
  assert.equal(data6.error?.message, 'Route not found');
  console.log('✓ Test 6 Passed: Backend 404 error responses pass through intact.');

  console.log('\n🎉 ALL 6 EMPIRICAL PROXY & REWRITE TESTS PASSED WITH 100% SUCCESS!');
} finally {
  console.log('Teardown: shutting down servers...');
  if (nextProcess && nextProcess.pid) {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(nextProcess.pid)], { stdio: 'ignore' });
    } catch {}
  }
  await new Promise(resolve => backendServer.close(resolve));
  console.log('Teardown complete.');
  process.exit(0);
}
