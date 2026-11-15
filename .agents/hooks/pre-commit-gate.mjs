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

const FORBIDDEN_STAGED_PATTERNS = [
  /^\.env(?:\.local)?$/i,
  /\.(?:sqlite|sqlite3|db)(?:-shm|-wal)?$/i,
  /(?:^|\/)(?:__pycache__|[^/]+\.py[cod])$/i,
  /(?:^|\/)(?:PLAN|gratify)\.md$/i,
  /\.pptx$/i,
  /^repomix-output\./i
];

const input = readStdin();
const toolName = input?.toolCall?.name;
const cmd = String(input?.toolCall?.args?.CommandLine || '');
const repoDir = input?.cwd && fs.existsSync(input.cwd) ? input.cwd : FALLBACK_REPO;

if (toolName !== 'run_command' || !cmd.trim()) {
  respond({ decision: 'allow' });
  process.exit(0);
}

const isCommit = /\bgit\s+commit\b/i.test(cmd);
const isPush = /\bgit\s+push\b/i.test(cmd);

if (!isCommit && !isPush) {
  respond({ decision: 'allow' });
  process.exit(0);
}

if (isCommit) {
  let staged = [];
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: repoDir,
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    });
    staged = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    respond({ decision: 'allow' });
    process.exit(0);
  }

  const forbidden = staged.filter((file) => FORBIDDEN_STAGED_PATTERNS.some((re) => re.test(file)));
  if (forbidden.length > 0) {
    respond({
      decision: 'deny',
      reason: `Blocked git commit: forbidden/local-only files are staged (${forbidden.join(', ')}). Unstage them with "git rm --cached" or "git reset HEAD".`
    });
    process.exit(0);
  }

  const errors = checkJsSyntaxFiles(repoDir, staged);
  if (errors.length > 0) {
    respond({
      decision: 'deny',
      reason: `Blocked git commit: syntax check failed.\n${errors.join('\n')}`
    });
    process.exit(0);
  }
}

if (isPush) {
  try {
    const dirtyOut = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoDir,
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    });
    const changedFiles = dirtyOut
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim().replace(/^.* -> /, ''))
      .filter(Boolean);
    const errors = checkJsSyntaxFiles(repoDir, changedFiles);
    if (errors.length > 0) {
      respond({
        decision: 'deny',
        reason: `Blocked git push: syntax check failed.\n${errors.join('\n')}`
      });
      process.exit(0);
    }
  } catch {
    // Allow push if git status check cannot run
  }
}

respond({ decision: 'allow' });
