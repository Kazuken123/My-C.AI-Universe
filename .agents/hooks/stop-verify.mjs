import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkJsSyntaxFiles } from './syntax-check-files.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_REPO = path.resolve(__dirname, '..', '..');

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function respond(payload) {
  process.stdout.write(JSON.stringify(payload));
}

const input = readStdin();

// Skip if turn is waiting on background tasks (fullyIdle === false), errored, or already continuing.
if (
  input?.terminationReason !== 'NO_TOOL_CALL' ||
  input?.continuationActive ||
  input?.fullyIdle === false
) {
  respond({});
  process.exit(0);
}

const repoDir = input?.cwd && fs.existsSync(input.cwd) ? input.cwd : FALLBACK_REPO;

let changedFiles = [];
try {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true
  });
  changedFiles = status
    .split(/\r?\n/)
    .filter((line) => line.length >= 4 && !line.startsWith('D '))
    .map((line) => line.slice(3).trim().replace(/^.* -> /, ''))
    .filter(Boolean);
} catch {
  respond({});
  process.exit(0);
}

const errors = checkJsSyntaxFiles(repoDir, changedFiles);
if (errors.length > 0) {
  respond({
    decision: 'continue',
    reason: `Deterministic syntax check failed on modified JS files. Fix before finishing:\n${errors.join('\n')}`
  });
  process.exit(0);
}

respond({});
