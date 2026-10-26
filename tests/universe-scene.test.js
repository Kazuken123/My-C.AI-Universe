import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/js/universe-scene.js', import.meta.url), 'utf8');

function harness({ width = 600, unavailable = false, contextThrows = false, shaderFails = false, paused = false } = {}) {
  const frames = new Map();
  const observers = [];
  const calls = { draws: 0, deletedBuffers: 0, deletedPrograms: 0, particles: 0, pointer: [0, 0] };
  let nextFrame = 0;
  class Element extends EventTarget {
    constructor() { super(); this.dataset = {}; this.isConnected = true; this.clientWidth = width; this.clientHeight = 400; }
    getBoundingClientRect() { return { left: 0, top: 0, width, height: 400 }; }
  }
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, ALIASED_POINT_SIZE_RANGE: 8,
    BLEND: 9, SRC_ALPHA: 10, ONE: 11, ONE_MINUS_SRC_ALPHA: 12, COLOR_BUFFER_BIT: 13, POINTS: 14,
    createProgram: () => ({}), createShader: () => ({}), createBuffer: () => ({}),
    getShaderParameter: () => !shaderFails, getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: (_, name) => name, getParameter: () => [1, 256],
    uniform1f() {}, uniform2f(_, x, y) { calls.pointer = [x, y]; },
    drawArrays(_, __, count) { calls.draws++; calls.particles = count; },
    deleteBuffer() { calls.deletedBuffers++; }, deleteProgram() { calls.deletedPrograms++; },
  };
  for (const method of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'useProgram', 'bindBuffer', 'bufferData', 'enableVertexAttribArray', 'vertexAttribPointer', 'enable', 'blendFuncSeparate', 'clearColor', 'deleteShader', 'viewport', 'clear']) gl[method] = () => {};
  const canvas = new Element();
  canvas.getContext = () => { if (contextThrows) throw new Error('GPU unavailable'); return unavailable ? null : gl; };
  const art = new Element();
  const host = new Element();
  host.querySelector = () => canvas;
  host.closest = () => art;
  const document = new Element();
  document.readyState = 'complete';
  document.hidden = false;
  document.body = new Element();
  document.documentElement = new Element();
  document.documentElement.dataset.orbitMotion = paused ? 'paused' : 'running';
  document.querySelectorAll = () => host.isConnected ? [host] : [];
  const context = vm.createContext({
    document, window: { devicePixelRatio: 3, IntersectionObserver: Observer },
    AbortController, ResizeObserver: Observer, IntersectionObserver: Observer, MutationObserver: Observer,
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  vm.runInContext(source, context);
  const step = now => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); };
  const motion = value => {
    document.documentElement.dataset.orbitMotion = value;
    observers.filter(o => o.target === document.documentElement && !o.disconnected).forEach(o => o.callback([]));
  };
  const visibility = value => {
    observers.filter(o => o.target === host && !o.options && !o.disconnected).at(-1).callback([{ isIntersecting: value }]);
  };
  const detach = () => {
    host.isConnected = false;
    observers.find(o => o.target === document.body).callback([{ addedNodes: [], removedNodes: [host] }]);
    step(200);
  };
  return { canvas, host, art, document, context, calls, observers, frames, step, motion, visibility, detach };
}

test('universe renders once when paused and resumes through the shared motion preference', () => {
  const h = harness({ paused: true });
  assert.equal(h.host.dataset.universeReady, 'true');
  assert.equal(h.calls.draws, 1);
  assert.equal(h.frames.size, 0);
  h.motion('running'); h.step(100);
  assert.ok(h.calls.draws > 1);
  h.motion('paused');
  const draws = h.calls.draws;
  h.step(200);
  assert.equal(h.calls.draws, draws);
  assert.equal(h.frames.size, 0);
});

test('offscreen scenes and hidden tabs stop scheduling animation', () => {
  const h = harness();
  h.visibility(false);
  assert.equal(h.frames.size, 0);
  h.visibility(true);
  assert.equal(h.frames.size, 1);
  h.document.hidden = true;
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.frames.size, 1);
});

test('compact layouts use fewer stars and cap display density', () => {
  const desktop = harness();
  const mobile = harness({ width: 340 });
  assert.ok(mobile.calls.particles < desktop.calls.particles);
  assert.equal(desktop.canvas.width, 1050);
  assert.equal(mobile.canvas.width, 510);
  assert.ok(desktop.calls.particles > 5000);
});

test('pointer changes perspective while touch and paused motion do not', () => {
  const h = harness();
  const move = pointerType => h.art.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType, clientX: 600, clientY: 0 }));
  move('touch'); h.step(100);
  assert.deepEqual(h.calls.pointer, [0, 0]);
  move('mouse'); h.step(200);
  assert.ok(h.calls.pointer[0] > 0);
  assert.ok(h.calls.pointer[1] < 0);
  h.motion('paused');
  const pointer = [...h.calls.pointer];
  move('mouse'); h.step(300);
  assert.deepEqual(h.calls.pointer, pointer);
});

test('route removal releases GPU resources, observers and animation', () => {
  const h = harness();
  h.detach();
  assert.equal(h.calls.deletedBuffers, 1);
  assert.equal(h.calls.deletedPrograms, 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.host.dataset.universeReady, undefined);
  assert.ok(h.observers.filter(o => o.target !== h.document.body).every(o => o.disconnected));
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.frames.size, 0);
});

test('context loss displays the fallback and restoration resumes the scene', () => {
  const h = harness();
  const event = new Event('webglcontextlost', { cancelable: true });
  h.canvas.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.host.dataset.universeReady, undefined);
  assert.equal(h.frames.size, 0);
  h.canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(h.host.dataset.universeReady, 'true');
  assert.equal(h.frames.size, 1);
});

test('unavailable WebGL, context errors and shader errors retain the static fallback', () => {
  for (const options of [{ unavailable: true }, { contextThrows: true }, { shaderFails: true }]) {
    const h = harness(options);
    assert.equal(h.host.dataset.universeReady, undefined);
    assert.equal(h.frames.size, 0);
    assert.equal(h.calls.draws, 0);
  }
});

test('duplicate script execution does not create a second renderer', () => {
  const h = harness();
  const observers = h.observers.length;
  vm.runInContext(source, h.context);
  assert.equal(h.observers.length, observers);
  assert.equal(h.calls.draws, 1);
});

test('both frontend copies of the renderer and stylesheet remain identical', () => {
  assert.equal(source, readFileSync(new URL('../nextjs-frontend/public/js/universe-scene.js', import.meta.url), 'utf8'));
  assert.deepEqual(readFileSync(new URL('../frontend/css/orbit.css', import.meta.url)), readFileSync(new URL('../nextjs-frontend/app/orbit.css', import.meta.url)));
});
