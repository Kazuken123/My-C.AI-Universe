import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const controlsSource = fs.readFileSync(new URL('../frontend/js/orbit-motion.js', import.meta.url), 'utf8')
  .split('/** Shared progressive enhancement.')[0];

function harness({ withIsland = false, withRail = false } = {}) {
  let nextId = 1;
  const timers = new Map();
  const frames = new Map();
  const observations = [];
  let document;

  class Element {
    constructor() {
      this.listeners = new Map();
      this.attributes = new Map();
      this.selectors = new Map();
      this.children = [];
      this.dataset = {};
      this.isConnected = true;
      this.hidden = false;
      this.inert = false;
      this.scrollLeft = 0;
      this.style = { setProperty: (key, value) => { this.style[key] = value; } };
      const classes = new Set();
      this.classList = {
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        contains: value => classes.has(value),
      };
    }
    addEventListener(type, handler, options = {}) {
      const handlers = this.listeners.get(type) || new Set();
      handlers.add(handler);
      this.listeners.set(type, handlers);
      options.signal?.addEventListener('abort', () => handlers.delete(handler), { once: true });
    }
    fire(type, fields = {}) {
      const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, ...fields };
      for (const handler of this.listeners.get(type) || []) handler(event);
      return event;
    }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    hasAttribute(key) { return this.attributes.has(key); }
    querySelector(selector) { return this.selectors.get(selector) || null; }
    querySelectorAll() { return this.children; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    matches(selector) { return selector === ':hover' ? Boolean(this.hovered) : Boolean(this.focusVisible); }
    closest() { return null; }
    focus() { document.activeElement = this; }
    scrollTo({ left }) {
      this.scrollLeft = Math.max(0, Math.min(left, this.scrollWidth - this.clientWidth));
      this.fire('scroll');
    }
    scrollBy({ left, behavior }) {
      this.lastScrollBehavior = behavior;
      this.scrollTo({ left: this.scrollLeft + left });
    }
  }

  const island = new Element();
  const trigger = new Element();
  const menu = new Element();
  const link = new Element();
  trigger.offsetHeight = 46;
  menu.scrollHeight = 300;
  menu.hidden = true;
  menu.children = [link];
  menu.selectors.set('a, button', link);
  island.children = [trigger, menu];
  island.selectors.set('.island-trigger', trigger);
  island.selectors.set('.island-menu', menu);

  const rail = new Element();
  const track = new Element();
  const previous = new Element();
  const next = new Element();
  const status = new Element();
  track.clientWidth = 420;
  track.scrollWidth = 1250;
  track.getBoundingClientRect = () => ({ left: 0, right: 420 });
  track.children = Array.from({ length: 6 }, (_, index) => {
    const card = new Element();
    card.getBoundingClientRect = () => ({
      left: index * 210 - track.scrollLeft,
      right: index * 210 + 200 - track.scrollLeft,
      width: 200,
    });
    return card;
  });
  rail.selectors.set('.character-track', track);
  rail.selectors.set('[data-rail-prev]', previous);
  rail.selectors.set('[data-rail-next]', next);
  rail.selectors.set('[data-rail-status]', status);
  document = new Element();
  document.documentElement = { dataset: { orbitMotion: 'running' } };
  document.getElementById = () => null;
  document.querySelectorAll = selector => selector === '[data-universe-island]' ? (withIsland && island.isConnected ? [island] : []) : (withRail && rail.isConnected ? [rail] : []);
  const Observer = class {
    constructor(callback) { this.callback = callback; observations.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  const scan = vm.runInNewContext(controlsSource + '\ncreateUniverseControls();', {
    document, AbortController, ResizeObserver: Observer, MutationObserver: Observer,
    getComputedStyle: () => ({ maxHeight: '600px', columnGap: '10px' }),
    requestAnimationFrame: callback => { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: callback => { const id = nextId++; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    queueMicrotask: callback => callback(),
  });
  const drain = collection => {
    while (collection.size) {
      const pending = [...collection.values()];
      collection.clear();
      pending.forEach(callback => callback());
    }
  };
  const flush = () => { drain(frames); drain(timers); };
  scan();
  return { island, trigger, menu, link, rail, track, previous, next, status, document, observations, scan, flush, Element };
}

test('island expands on mouse hover and closes after pointer departure', () => {
  const h = harness({ withIsland: true });
  h.island.fire('pointerenter', { pointerType: 'mouse' });
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(h.menu.hidden, false);
  assert.equal(h.menu.inert, false);
  assert.equal(h.island.classList.contains('is-open'), true);
  h.island.fire('pointerleave');
  h.flush();
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.menu.inert, true);
  assert.equal(h.menu.hidden, true);
});

test('tap pins the island; Escape closes it and returns keyboard focus', () => {
  const h = harness({ withIsland: true });
  h.trigger.fire('click');
  h.island.fire('pointerleave');
  h.flush();
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
  h.island.fire('keydown', { key: 'Escape' });
  h.flush();
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, h.trigger);
});

test('keyboard can enter island controls and an outside click dismisses them', () => {
  const h = harness({ withIsland: true });
  h.island.fire('keydown', { key: 'ArrowDown', target: h.trigger });
  assert.equal(h.document.activeElement, h.link);
  h.document.fire('pointerdown', { target: new h.Element() });
  h.flush();
  assert.equal(h.menu.hidden, true);
});

test('carousel advances by visible cards and hides arrows at its boundaries', () => {
  const h = harness({ withRail: true });
  h.flush();
  assert.equal(h.previous.hidden, true);
  assert.equal(h.next.hidden, false);
  assert.equal(h.status.textContent, 'Characters 1\u20132 of 6');
  h.next.fire('click');
  h.flush();
  assert.equal(h.track.scrollLeft, 420);
  assert.equal(h.status.textContent, 'Characters 3\u20134 of 6');
  assert.equal(h.previous.hidden, false);
  h.track.fire('keydown', { key: 'End' });
  h.flush();
  assert.equal(h.track.scrollLeft, 830);
  assert.equal(h.next.hidden, true);
  h.track.fire('keydown', { key: 'Home' });
  h.flush();
  assert.equal(h.previous.hidden, true);
});

test('carousel respects pause, loading, resize, and detached-page cleanup', () => {
  const h = harness({ withRail: true });
  h.document.documentElement.dataset.orbitMotion = 'paused';
  h.next.fire('click');
  assert.equal(h.track.lastScrollBehavior, 'instant');
  h.track.setAttribute('aria-busy', 'true');
  h.observations.forEach(observer => observer.callback());
  h.flush();
  assert.equal(h.previous.hidden, true);
  assert.equal(h.next.hidden, true);
  h.track.setAttribute('aria-busy', 'false');
  h.track.clientWidth = 1400;
  h.observations.forEach(observer => observer.callback());
  h.flush();
  assert.equal(h.next.hidden, true);
  h.rail.isConnected = false;
  h.scan();
  assert.equal(h.observations.every(observer => observer.disconnected), true);
});
