import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/js/orbit-motion.js', import.meta.url), 'utf8');

function harness({ reducedMotion = false } = {}) {
  const document = new EventTarget();
  document.readyState = 'loading';
  document.hidden = false;
  const host = Object.assign(new EventTarget(), { dataset: {}, isConnected: true });
  const button = Object.assign(new EventTarget(), {
    isConnected: true,
    hidden: true,
    closest: () => ({ querySelector: () => host }),
    setAttribute(name, value) { this[name] = value; },
  });
  document.querySelectorAll = () => button.isConnected ? [button] : [];
  let intersect;
  let unobserved;
  class IntersectionObserver {
    constructor(callback) { intersect = isIntersecting => callback([{ target: host, isIntersecting }]); }
    observe() {}
    unobserve(target) { unobserved = target; }
  }
  const preference = { matches: !reducedMotion };
  const window = { IntersectionObserver, matchMedia: () => preference };
  const controls = vm.runInNewContext(source + '\ncreateScenePlaybackControls()', {
    document, window, Event, AbortController, IntersectionObserver,
  });
  const events = [];
  host.addEventListener('atlas-scene-playback', () => events.push(host.dataset.scenePlayback));
  controls.scan();
  return {
    host, button, controls, preference, events, intersect,
    unobserved: () => unobserved,
    click: () => button.dispatchEvent(new Event('click')),
    hide: hidden => {
      document.hidden = hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

test('galaxy defaults to the OS preference and can be explicitly played on reduced motion', () => {
  const scene = harness({ reducedMotion: true });
  scene.intersect(true);
  assert.equal(scene.button.hidden, false);
  assert.equal(scene.button['aria-pressed'], 'false');
  assert.equal(scene.host.dataset.sceneActive, 'false');
  scene.click();
  assert.equal(scene.preference.matches, false);
  assert.equal(scene.button['aria-pressed'], 'true');
  assert.equal(scene.host.dataset.sceneActive, 'true');
  scene.click();
  assert.deepEqual(scene.events, ['paused', 'playing', 'paused']);
});

test('viewport and document visibility suspend animation while retaining the selected state', () => {
  const scene = harness();
  assert.equal(scene.host.dataset.scenePlayback, 'playing');
  assert.equal(scene.host.dataset.sceneActive, 'false');
  scene.intersect(true);
  assert.equal(scene.host.dataset.sceneActive, 'true');
  scene.hide(true);
  assert.equal(scene.host.dataset.sceneActive, 'false');
  assert.equal(scene.button['aria-pressed'], 'true');
  scene.intersect(false);
  scene.hide(false);
  assert.equal(scene.host.dataset.sceneActive, 'false');
  scene.intersect(true);
  assert.equal(scene.host.dataset.sceneActive, 'true');
  scene.preference.matches = false;
  scene.controls.reset();
  assert.equal(scene.host.dataset.scenePlayback, 'paused');
  assert.equal(scene.host.dataset.sceneActive, 'false');
});

test('removing Discover disconnects the scene and its control', () => {
  const scene = harness();
  scene.host.isConnected = false;
  scene.button.isConnected = false;
  scene.controls.scan();
  assert.equal(scene.unobserved(), scene.host);
  scene.click();
  assert.deepEqual(scene.events, ['playing']);
});
