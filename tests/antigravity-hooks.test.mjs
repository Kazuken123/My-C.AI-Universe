import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PRE_COMMIT_HOOK = path.join(REPO_ROOT, '.agents', 'hooks', 'pre-commit-gate.mjs');
const STOP_HOOK = path.join(REPO_ROOT, '.agents', 'hooks', 'stop-verify.mjs');
const HOOKS_JSON = path.join(REPO_ROOT, '.agents', 'hooks.json');

function createGitFixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cai-hooks-fixture-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  });

  execFileSync('git', ['init'], { cwd: dir, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, windowsHide: true });
  writeFileSync(path.join(dir, 'README.md'), 'init\n');
  execFileSync('git', ['add', 'README.md'], { cwd: dir, windowsHide: true });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, windowsHide: true });
  return dir;
}

function runHook(scriptPath, payload) {
  const res = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true
  });
  assert.equal(res.status, 0, `Hook exited with ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

test('repo .agents/hooks.json is valid and references existing hook scripts', () => {
  assert.equal(existsSync(HOOKS_JSON), true);
  const parsed = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'));
  assert.ok(parsed['repo-harness-gates']);
  assert.equal(existsSync(PRE_COMMIT_HOOK), true);
  assert.equal(existsSync(STOP_HOOK), true);
});

test('pre-commit-gate allows non-git commands', (t) => {
  const dir = createGitFixture(t);
  const out = runHook(PRE_COMMIT_HOOK, {
    cwd: dir,
    toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } }
  });
  assert.equal(out.decision, 'allow');
});

test('pre-commit-gate denies git commit when .env is staged', (t) => {
  const dir = createGitFixture(t);
  writeFileSync(path.join(dir, '.env'), 'SECRET=1\n');
  execFileSync('git', ['add', '-f', '.env'], { cwd: dir, windowsHide: true });

  const out = runHook(PRE_COMMIT_HOOK, {
    cwd: dir,
    toolCall: { name: 'run_command', args: { CommandLine: 'git commit -m "oops"' } }
  });
  assert.equal(out.decision, 'deny');
  assert.match(out.reason, /\.env/);
});

test('pre-commit-gate denies git commit on invalid staged JS and allows valid JS', (t) => {
  const badDir = createGitFixture(t);
  writeFileSync(path.join(badDir, 'broken.js'), 'const x = ;\n');
  execFileSync('git', ['add', 'broken.js'], { cwd: badDir, windowsHide: true });

  const denied = runHook(PRE_COMMIT_HOOK, {
    cwd: badDir,
    toolCall: { name: 'run_command', args: { CommandLine: 'git commit -m "bad syntax"' } }
  });
  assert.equal(denied.decision, 'deny');
  assert.match(denied.reason, /syntax check failed/i);

  const goodDir = createGitFixture(t);
  writeFileSync(path.join(goodDir, 'app.js'), 'const x = 1;\n');
  execFileSync('git', ['add', 'app.js'], { cwd: goodDir, windowsHide: true });

  const allowed = runHook(PRE_COMMIT_HOOK, {
    cwd: goodDir,
    toolCall: { name: 'run_command', args: { CommandLine: 'git commit -m "good syntax"' } }
  });
  assert.equal(allowed.decision, 'allow');
});

test('stop-verify blocks stop on dirty invalid JS and skips when continuationActive or waiting on background tasks', (t) => {
  const dir = createGitFixture(t);
  writeFileSync(path.join(dir, 'broken.js'), 'const x = ;\n');

  const firstStop = runHook(STOP_HOOK, {
    cwd: dir,
    terminationReason: 'NO_TOOL_CALL',
    continuationActive: false,
    fullyIdle: true
  });
  assert.equal(firstStop.decision, 'continue');
  assert.match(firstStop.reason, /syntax check failed/i);

  const waitingStop = runHook(STOP_HOOK, {
    cwd: dir,
    terminationReason: 'NO_TOOL_CALL',
    continuationActive: false,
    fullyIdle: false
  });
  assert.deepEqual(waitingStop, {});

  const loopedStop = runHook(STOP_HOOK, {
    cwd: dir,
    terminationReason: 'NO_TOOL_CALL',
    continuationActive: true,
    fullyIdle: true
  });
  assert.deepEqual(loopedStop, {});
});
