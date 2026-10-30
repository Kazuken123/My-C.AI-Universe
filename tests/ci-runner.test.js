import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestEnvironment, discoverTests, runTestFile, runTests } from '../scripts/run-tests.js';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'cai-runner-fixture-'));
  mkdirSync(path.join(root, 'tests'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('cai-runner-fixture-'));
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });
  return root;
}

test('discovers JS and MJS regressions while excluding manual/live scripts', t => {
  const root = fixture(t);
  for (const name of ['a.test.js', 'b.test.mjs', 'api.test.js', 'live-character-validation.js', 'proxy-empirical.mjs']) {
    writeFileSync(path.join(root, 'tests', name), '');
  }
  assert.equal(discoverTests(root).length, 3);
  assert.equal(discoverTests(root, 'unit').length, 2);
  assert.deepEqual(discoverTests(root, 'api'), [path.join('tests', 'api.test.js')]);
  assert.throws(() => discoverTests(root, 'typo'), /Unknown test group/);
});

test('replaces developer credentials, dotenv paths, and database paths', () => {
  const env = createTestEnvironment('/isolated-test', {
    NODE_ENV: 'production', SQLITE_PATH: '/important.sqlite',
    TURSO_DATABASE_URL: 'libsql://real', GEMINI_API_KEY: 'real-key',
    SMTP_PASS: 'real-password', DOTENV_CONFIG_PATH: '/real.env',
    TEST_BASE_URL: 'https://live.example', NODE_OPTIONS: '--import=real.js'
  });
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PORT, '0');
  for (const key of ['TURSO_DATABASE_URL', 'GEMINI_API_KEY', 'SMTP_PASS', 'TEST_BASE_URL', 'NODE_OPTIONS']) {
    assert.equal(env[key], '');
  }
  assert.equal(env.SQLITE_PATH, path.join('/isolated-test', 'universe.sqlite'));
  assert.equal(env.DOTENV_CONFIG_PATH, path.join('/isolated-test', 'unused.env'));
});

test('gives each child a separate directory and removes it after execution', t => {
  const root = fixture(t);
  const file = path.join('tests', 'environment.test.mjs');
  writeFileSync(path.join(root, file), 'console.log(process.env.DATA_DIR);');
  const first = runTestFile(file, { root });
  const second = runTestFile(file, { root });
  assert.equal(first.passed, true);
  assert.equal(second.passed, true);
  assert.notEqual(first.stdout.trim(), second.stdout.trim());
  assert.equal(existsSync(first.stdout.trim()), false);
  assert.equal(existsSync(second.stdout.trim()), false);
});

test('reports a nonzero child exit as a failure and continues the suite', t => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'tests', 'a.test.mjs'), 'process.exitCode = 7;');
  writeFileSync(path.join(root, 'tests', 'b.test.mjs'), 'console.log("ran after failure");');
  const reportPath = path.join('reports', 'results.json');
  const result = runTests({ root, reportPath, quiet: true });
  assert.equal(result.total, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.passed, 1);
  assert.equal(result.results[0].status, 7);
  const report = JSON.parse(readFileSync(path.join(root, reportPath), 'utf8'));
  assert.equal(report.failed, 1);
  assert.equal(report.results[1].passed, true);
  assert.equal(report.results[0].stdout, undefined);
});

test('a stalled test is terminated and reported as failed', t => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'tests', 'hang.test.mjs'), 'setInterval(() => {}, 1000);');
  const result = runTestFile(path.join('tests', 'hang.test.mjs'), { root, timeout: 500 });
  assert.equal(result.passed, false);
  assert.match(result.error, /ETIMEDOUT/);
});

test('an empty suite cannot produce a passing report', t => {
  assert.throws(() => runTests({ root: fixture(t) }), /No tests found/);
});

test('EBAP-03: scripts/check-syntax.js skips gitignored scripts/eval/results artifacts', async t => {
  const { fileURLToPath } = await import('node:url');
  const { collectSyntaxFiles, runSyntaxCheck } = await import('../scripts/check-syntax.js');
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));

  const root = fixture(t);
  mkdirSync(path.join(root, 'scripts', 'eval', 'results', 'run-1'), { recursive: true });
  writeFileSync(path.join(root, 'scripts', 'valid.mjs'), 'export const ok = 1;\n');
  writeFileSync(path.join(root, 'scripts', 'eval', 'results', 'run-1', 'broken-artifact.mjs'), 'const x = "unterminated;\n');

  const collected = collectSyntaxFiles(root);
  assert.deepEqual(collected, [path.join('scripts', 'valid.mjs')]);

  const checkResult = runSyntaxCheck(root);
  assert.equal(checkResult.checked, 1);
  assert.equal(checkResult.failures, 0);

  const repoFiles = collectSyntaxFiles(repoRoot);
  assert.equal(
    repoFiles.some(f => path.normalize(f).startsWith(path.normalize('scripts/eval/results'))),
    false
  );
});
