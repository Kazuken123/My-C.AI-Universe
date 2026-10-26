import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

function collect(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return collect(relative);
      return /\.(?:js|mjs)$/.test(entry.name) ? [relative] : [];
    });
}

const files = [
  'server.js',
  'nextjs-frontend/next.config.mjs',
  ...['backend', 'frontend/js', 'scripts', 'tests'].flatMap(collect)
];
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
process.exitCode = failures ? 1 : 0;
