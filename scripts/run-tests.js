import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_TIMEOUT_MS = 120_000;

export function discoverTests(root = projectRoot, group = 'all') {
  if (!['all', 'unit', 'api'].includes(group)) throw new Error('Unknown test group: ' + group);
  return readdirSync(path.join(root, 'tests'))
    .filter(name => /\.test\.(?:js|mjs)$/.test(name))
    .filter(name => group === 'all' || (group === 'api' ? name === 'api.test.js' : name !== 'api.test.js'))
    .sort()
    .map(name => path.join('tests', name));
}

export function createTestEnvironment(directory, inherited = process.env) {
  const env = { ...inherited };
  // Never consume developer/cloud databases, email credentials, or paid AI keys.
  for (const key of [
    'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_CLIENT_ID',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'GMAIL_USER', 'GMAIL_APP_PASS',
    'ADMIN_USERNAMES', 'ADMIN_EMAILS', 'TEST_BASE_URL', 'NODE_OPTIONS'
  ]) env[key] = '';
  return {
    ...env,
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: path.join(directory, 'unused.env'),
    DOTENV_CONFIG_QUIET: 'true',
    DOTENV_CONFIG_OVERRIDE: 'false',
    SQLITE_PATH: path.join(directory, 'universe.sqlite'),
    DATA_DIR: directory,
    JWT_SECRET: 'ci-only-isolated-test-secret-never-use-in-production',
    AI_PROVIDER: 'gemini',
    MEMORY_SERVICE_URL: 'http://127.0.0.1:1',
    OLLAMA_URL: 'http://127.0.0.1:1',
    PUBLIC_BASE_URL: 'http://127.0.0.1',
    PORT: '0'
  };
}

export function runTestFile(file, { root = projectRoot, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'cai-test-'));
  const started = Date.now();
  try {
    const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', file], {
      cwd: root, env: createTestEnvironment(directory), encoding: 'utf8',
      timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true
    });
    return {
      file,
      passed: child.status === 0 && !child.error,
      status: child.status,
      signal: child.signal,
      durationMs: Date.now() - started,
      error: child.error?.message || null,
      stdout: child.stdout || '',
      stderr: child.stderr || ''
    };
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
        !path.basename(directory).startsWith('cai-test-')) {
      throw new Error('Refusing cleanup outside the test temporary directory');
    }
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

export function runTests({ root = projectRoot, group = 'all', reportPath = '', quiet = false } = {}) {
  const files = discoverTests(root, group);
  if (files.length === 0) throw new Error('No tests found for group: ' + group);
  const results = [];
  for (const file of files) {
    if (!quiet) console.log('\n--- ' + file + ' ---');
    const result = runTestFile(file, { root });
    results.push(result);
    if (!quiet) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.error) console.error(result.error);
      console.log((result.passed ? 'PASS ' : 'FAIL ') + file + ' (' + result.durationMs + 'ms)');
    }
  }
  const failed = results.filter(result => !result.passed).length;
  const summary = {
    node: process.version, group, total: results.length,
    passed: results.length - failed, failed,
    results: results.map(({ stdout, stderr, ...result }) => result)
  };
  if (reportPath) {
    const destination = path.resolve(root, reportPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(summary, null, 2) + '\n');
  }
  if (!quiet) console.log('\n' + summary.passed + '/' + summary.total + ' test files passed; ' + failed + ' failed.');
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !['--unit', '--api', '--list'].includes(arg))) {
      throw new Error('Usage: node scripts/run-tests.js [--unit|--api|--list]');
    }
    const group = args[0] === '--unit' ? 'unit' : args[0] === '--api' ? 'api' : 'all';
    if (args[0] === '--list') {
      console.log(discoverTests().join('\n'));
    } else {
      const summary = runTests({ group, reportPath: process.env.TEST_REPORT_PATH || '' });
      process.exitCode = summary.failed ? 1 : 0;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
