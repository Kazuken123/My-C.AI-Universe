import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Discover removes galaxy playback toggle and day/night atmosphere toggle in both frontends', () => {
  for (const file of [
    '../frontend/index.html',
    '../nextjs-frontend/components/characters/character-catalog.tsx',
    '../nextjs-frontend/components/characters/orbit-hero.tsx',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /data-scene-playback-toggle/);
    assert.doesNotMatch(source, /data-atmosphere-toggle/);
  }
});
