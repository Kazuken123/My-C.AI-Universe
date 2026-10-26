import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const controlsSource = fs.readFileSync(new URL('../frontend/js/orbit-motion.js', import.meta.url), 'utf8')
  .split('/** Shared progressive enhancement.')[0];

function harness({ withIsland = false, withRail = false, withCapsule = false } = {}) {
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
  if (withCapsule) { const capsule = new Element(); capsule.offsetHeight = 58; island.selectors.set('.island-capsule', capsule); }
  menu.scrollHeight = 300;
  menu.hidden = true;
  menu.children = [link];
  menu.selectors.set('button, textarea, select, a', link);
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

test('carousel keeps motion on despite legacy pause state and handles loading, resize and cleanup', () => {
  const h = harness({ withRail: true });
  h.document.documentElement.dataset.orbitMotion = 'paused';
  h.next.fire('click');
  assert.equal(h.track.lastScrollBehavior, 'smooth');
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

test('expanded island uses a fixed panel width and clamps height to the viewport', () => {
  const h = harness({ withIsland: true, withCapsule: true });
  h.island.fire('pointerenter', { pointerType: 'mouse' });
  assert.equal(h.island.style['--island-height'], '348px');
  h.menu.scrollHeight = 900;
  h.observations[0].callback();
  assert.equal(h.island.style['--island-height'], '648px');
});

test('touch pins the island; starting a scene closes it and detached islands release handlers', () => {
  const h = harness({ withIsland: true, withCapsule: true });
  h.island.fire('pointerenter', { pointerType: 'touch' });
  assert.equal(h.island.classList.contains('is-open'), false);
  h.trigger.fire('click');
  const navigation = new h.Element();
  navigation.closest = () => ({ getAttribute: () => null });
  h.menu.fire('click', { target: navigation });
  h.flush();
  assert.equal(h.menu.hidden, true);
  h.island.isConnected = false;
  h.scan();
  assert.equal(h.observations[0].disconnected, true);
  assert.equal(h.trigger.listeners.get('click').size, 0);
});

test('scene moods reroll without immediately repeating and encode draft URLs safely', () => {
  const context = vm.createContext({ URLSearchParams });
  vm.runInContext(controlsSource, context);
  const first = vm.runInContext("nextSceneSpark('mystery', -1, () => 0)", context);
  const next = vm.runInContext("nextSceneSpark('mystery', 0, () => 0)", context);
  assert.notEqual(first.text, next.text);
  assert.match(first.text, /letter/);
  const href = vm.runInContext("sceneSparkHref('/chat/', 'name/&?', 'Keep <this> & that?')", context);
  const url = new URL(href, 'https://example.test');
  assert.equal(url.pathname, '/chat/name%2F%26%3F');
  assert.equal(url.searchParams.get('opener'), 'Keep <this> & that?');
  const staticHref = vm.runInContext("sceneSparkHref('/chat.html', 'char&1', 'hello')", context);
  assert.equal(new URL(staticHref, 'https://example.test').searchParams.get('id'), 'char&1');
  assert.equal(vm.runInContext("sceneSparkHref('/chat/', 'char', '   ')", context), '');
  assert.equal(vm.runInContext("sceneSparkHref('https://external.test', 'char', 'hello')", context), '');
});

test('legacy pause preference is cleared and ambient motion is resumed on initialization', () => {
  const fullSource = fs.readFileSync(new URL('../frontend/js/orbit-motion.js', import.meta.url), 'utf8');
  const removed = [];
  let resumed = 0;
  const document = {
    readyState: 'complete', documentElement: { dataset: { orbitMotion: 'paused' } },
    body: {}, querySelectorAll: () => [], addEventListener() {},
  };
  vm.runInNewContext(fullSource, {
    document,
    window: { addEventListener() {}, ambientCanvas: { forceStart() { resumed++; } } },
    localStorage: { removeItem(key) { removed.push(key); } },
    MutationObserver: class { observe() {} }, requestAnimationFrame() { return 1; },
  });
  assert.equal(document.documentElement.dataset.orbitMotion, 'running');
  assert.deepEqual(removed, ['ambient_motion_disabled']);
  assert.equal(resumed, 1);
});

test('Scene Spark uses loaded characters, edits a draft, handles copy failure and cleans up', async () => {
  class Control {
    constructor() { this.listeners = {}; this.attributes = {}; this.dataset = {}; this.value = ''; this.children = []; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] || null; }
    querySelector(selector) { return this.selectors?.[selector] || null; }
    querySelectorAll() { return this.children; }
    replaceChildren(...children) { this.children = children; this.value = ''; }
    append(child) { this.children.push(child); }
    focus() { this.focused = true; }
    select() { this.selected = true; }
  }
  const island = new Control(), prompt = new Control(), select = new Control(), start = new Control(), status = new Control(), reroll = new Control(), copy = new Control(), grid = new Control();
  const label = new Control();
  start.selectors = { span: label };
  prompt.value = 'Opening draft';
  island.dataset.chatBase = '/chat/';
  island.selectors = { '[data-spark-prompt]': prompt, '[data-spark-character]': select, '[data-spark-start]': start, '[data-spark-status]': status, '[data-spark-reroll]': reroll, '[data-spark-copy]': copy };
  const cozy = new Control(), mystery = new Control();
  cozy.dataset.sparkMood = 'cozy'; mystery.dataset.sparkMood = 'mystery'; island.children = [cozy, mystery];
  const card = new Control(), name = new Control();
  card.dataset.charCard = 'character-1'; name.textContent = 'Character One'; card.selectors = { '.cai-card-name': name }; grid.children = [card];
  let onMutation, disconnected = false;
  const context = vm.createContext({
    URLSearchParams, Math, navigator: { clipboard: { async writeText() { throw Error('clipboard unavailable'); } } },
    document: { getElementById: () => grid, createElement: () => new Control() },
    MutationObserver: class { constructor(callback) { onMutation = callback; } observe() {} disconnect() { disconnected = true; } },
  });
  vm.runInContext(controlsSource, context);
  context.island = island; context.signal = new AbortController().signal;
  const cleanup = vm.runInContext('bindSceneSpark(island, signal)', context);
  assert.equal(select.children.length, 2);
  select.value = 'character-1'; select.listeners.change();
  assert.equal(label.textContent, 'Use this scene');
  assert.equal(new URL(start.href, 'https://example.test').searchParams.get('opener'), 'Opening draft');
  prompt.value = 'My custom opener'; prompt.listeners.input();
  assert.equal(new URL(start.href, 'https://example.test').searchParams.get('opener'), 'My custom opener');
  mystery.listeners.click();
  assert.equal(mystery.attributes['aria-pressed'], 'true');
  assert.equal(cozy.attributes['aria-pressed'], 'false');
  const before = prompt.value; reroll.listeners.click(); assert.notEqual(prompt.value, before);
  await copy.listeners.click();
  assert.equal(prompt.selected, true);
  assert.match(status.textContent, /manual copying/);
  prompt.value = ' '; prompt.listeners.input();
  let prevented = false;
  start.listeners.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  grid.children = []; onMutation();
  assert.equal(select.disabled, true);
  assert.equal(start.href, '#character-roster');
  cleanup(); assert.equal(disconnected, true);
});

test('pointer return during the closing morph cancels the hide timer', () => {
  const h = harness({ withIsland: true });
  h.trigger.fire('click');
  h.island.fire('keydown', { key: 'Escape' });
  h.island.fire('pointerenter', { pointerType: 'mouse' });
  h.flush();
  assert.equal(h.menu.hidden, false);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'true');
});
