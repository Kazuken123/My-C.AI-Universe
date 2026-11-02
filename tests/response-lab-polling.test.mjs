import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/js/response-lab.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/init\(\)\.catch\(error => .*\);\s*$/, '');
const makeTrial = (status = 'generating', revision = 1) => ({ id: 'trial', revision, status,
  batches: [{ id: 'round', tournament: true, roundNumber: 4, carriedCount: 3, screening: { filteredCount: 5 }, feedback: null,
    candidates: ['a', 'b', 'c'].map(id => ({ id, text: `Existing answer ${id}`, status: 'complete', carriedFromBatchId: 'previous' })) }] });

function harness(respond) {
  const controls = new Map(), storage = new Map(), writes = [], requests = [], timers = new Map();
  let clock = 0, sequence = 0;
  const element = id => {
    if (!controls.has(id)) controls.set(id, { value: '', textContent: '', innerHTML: '', hidden: false, checked: false,
      listeners: {}, classList: { toggle() {} }, addEventListener(type, handler) { this.listeners[type] = handler; } });
    return controls.get(id);
  };
  const context = vm.createContext({
    api: { request(url, options) { requests.push({ url, options }); return respond(requests.length, options); } },
    RELATIONSHIP_PRESETS: [], AbortController, URL, URLSearchParams,
    document: { getElementById: element, querySelectorAll: () => [] },
    sessionStorage: { getItem: key => storage.get(key) || null,
      setItem(key, value) { writes.push({ key, value }); storage.set(key, value); }, removeItem(key) { writes.push({ key }); storage.delete(key); } },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, due: clock + delay, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  const flush = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };
  return { controls, storage, writes, requests, run, context,
    start(initial = makeTrial()) {
      context.initialTrial = structuredClone(initial);
      run("lab = { id: 'lab' }; trial = initialTrial; trials = [trial]; batchIndex = 0; renderAnswers(); schedulePoll();");
    },
    delays: () => [...timers.values()].map(timer => timer.due - clock).sort((a, b) => a - b),
    async tick(delay) {
      clock += delay;
      const due = [...timers].filter(([, timer]) => timer.due <= clock);
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
      await flush();
    }, flush,
  };
}

test('a failed poll reconnects and discovers completion without regenerating or changing draft ratings', async () => {
  const h = harness(count => count === 1 ? Promise.reject(new Error('Failed to fetch')) : Promise.resolve(makeTrial('ready', 2)));
  const draft = JSON.stringify({ accepted: ['a', 'c'], favorite: 'c' });
  h.storage.set('response-lab-draft:trial:round', draft);
  h.start();
  await h.tick(1800);
  assert.match(h.controls.get('generationHint').textContent, /Reconnecting/);
  assert.match(h.controls.get('batchStatus').textContent, /last confirmed.*Reconnecting/);
  assert.equal(h.controls.get('more').textContent, 'Waiting to reconnect…');
  assert.equal(h.controls.get('more').disabled, true);
  assert.equal(h.run('trial.status'), 'generating', 'network errors cannot claim the worker is finished');
  assert.deepEqual(h.delays(), [3000]);
  await h.tick(3000);
  assert.equal(h.run('trial.status'), 'ready');
  assert.equal(h.controls.get('more').disabled, false);
  assert.equal(h.controls.get('more').textContent, 'Save & next round');
  assert.equal(h.controls.get('saveStatus').textContent, 'Draft · not submitted');
  assert.deepEqual(Array.from(h.run('accepted')), ['a', 'c']);
  assert.equal(h.run('favorite'), 'c');
  assert.equal(h.storage.get('response-lab-draft:trial:round'), draft);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.requests.map(r => [r.url, r.options.method]), [
    ['/api/response-lab/trials/trial', 'GET'], ['/api/response-lab/trials/trial', 'GET']]);
  assert.deepEqual(h.delays(), []);
});

test('a stalled status read is aborted, retried, and cannot overwrite a later completed state', async () => {
  let release;
  const stalled = new Promise(resolve => { release = resolve; });
  const h = harness(count => count === 1 ? stalled : Promise.resolve(makeTrial('ready', 2)));
  h.start(); await h.tick(1800);
  assert.deepEqual(h.delays(), [15000]);
  await h.tick(15000);
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.deepEqual(h.delays(), [3000]);
  await h.tick(3000);
  assert.equal(h.run('trial.status'), 'ready');
  release(makeTrial('generating', 99)); await h.flush();
  assert.equal(h.run('trial.revision'), 2);
  assert.equal(h.controls.get('more').disabled, false);
  assert.deepEqual(h.delays(), []);
  assert.deepEqual(h.writes, []);
});

test('leaving and reopening the same trial invalidates an in-flight read', async () => {
  let release;
  const h = harness(count => count === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(makeTrial('ready', 2)));
  h.start(); await h.tick(1800);
  h.run('stopPolling();');
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.start();
  release(makeTrial('ready', 99)); await h.flush();
  assert.equal(h.run('trial.revision'), 1, 'same IDs do not make an old navigation response current');
  await h.tick(1800);
  assert.equal(h.run('trial.revision'), 2);
  assert.equal(h.controls.get('more').disabled, false);
});

test('authentication failures ask for sign-in without generating, resubmitting feedback, or endless retries', async () => {
  const h = harness(() => Promise.reject(new Error('Authentication required. Please sign in or create an account.')));
  h.start(); await h.tick(1800);
  assert.equal(h.controls.get('authNotice').hidden, false);
  assert.match(h.controls.get('generationHint').textContent, /Sign in again/);
  assert.match(h.controls.get('batchStatus').textContent, /Sign in again/);
  assert.equal(h.run('trial.status'), 'generating');
  assert.deepEqual(h.delays(), []);
  assert.deepEqual(h.writes, []);
  assert.equal(h.requests.length, 1);
});

test('an older status revision cannot roll back a newer local round', async () => {
  const h = harness(count => Promise.resolve(makeTrial('ready', count === 1 ? 2 : 4)));
  h.start(makeTrial('generating', 3)); await h.tick(1800);
  assert.equal(h.run('trial.revision'), 3);
  assert.equal(h.run('trial.status'), 'generating');
  await h.tick(1800);
  assert.equal(h.run('trial.revision'), 4);
  assert.equal(h.run('trial.status'), 'ready');
});
