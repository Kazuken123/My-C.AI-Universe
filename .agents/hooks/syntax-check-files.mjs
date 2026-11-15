import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const JS_EXT_RE = /\.(?:js|mjs|cjs)$/i;

/**
 * Run `node --check` on each existing JS/MJS/CJS file in `relativeFiles`.
 * Checking only changed/staged files keeps hook execution under ~1s on Windows.
 */
export function checkJsSyntaxFiles(repoDir, relativeFiles) {
  const targets = [...new Set(relativeFiles)]
    .filter((f) => JS_EXT_RE.test(f))
    .map((f) => ({ rel: f, abs: path.resolve(repoDir, f) }))
    .filter(({ abs }) => fs.existsSync(abs) && fs.statSync(abs).isFile());

  const errors = [];
  for (const { rel, abs } of targets) {
    const res = spawnSync(process.execPath, ['--check', abs], {
      cwd: repoDir,
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });
    if (res.error || res.status !== 0) {
      const detail = (res.stderr || res.stdout || res.error?.message || `exit ${res.status}`).trim();
      errors.push(`${rel}: ${detail}`);
    }
  }
  return errors;
}
