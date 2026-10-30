import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const IGNORED_RELATIVE_DIRS = new Set([
  path.normalize('scripts/eval/results')
]);

export function collectSyntaxFiles(root = defaultRoot) {
  function collect(directory) {
    const absDir = path.join(root, directory);
    if (!existsSync(absDir)) return [];
    return readdirSync(absDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(entry => {
        const relative = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (IGNORED_RELATIVE_DIRS.has(path.normalize(relative))) return [];
          return collect(relative);
        }
        return /\.(?:js|mjs)$/.test(entry.name) ? [relative] : [];
      });
  }

  return [
    ...['server.js', 'nextjs-frontend/next.config.mjs'].filter(f => existsSync(path.join(root, f))),
    ...['backend', 'frontend/js', 'scripts', 'tests'].flatMap(collect)
  ];
}

export function runSyntaxCheck(root = process.env.SYNTAX_CHECK_ROOT || defaultRoot) {
  const files = collectSyntaxFiles(root);
  let failures = 0;
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: root, encoding: 'utf8', timeout: 15_000, windowsHide: true
    });
    if (result.status !== 0 || result.error) {
      failures++;
      console.error('Syntax check failed: ' + file + '\n' + (result.stderr || result.error || result.signal));
    }
  }
  console.log('Checked ' + files.length + ' JavaScript files; ' + failures + ' failed.');
  return { checked: files.length, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { failures } = runSyntaxCheck();
  process.exitCode = failures ? 1 : 0;
}
