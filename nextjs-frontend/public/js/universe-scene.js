/** A dependency-free WebGL universe shared by Express and Next.js. */
(function () {
  if (window.__universeScenes) return;
  window.__universeScenes = true;
  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec4 aCenter;
    attribute vec2 aTilt;
    attribute vec4 aColor;
    attribute vec2 aSize;
    uniform float uTime;
    uniform float uAspect;
    uniform float uPixelRatio;
    uniform float uMaxPointSize;
    uniform vec2 uPointer;
    varying lowp vec4 vColor;
    varying mediump float vKind;
    void main() {
      float spin = uTime * aCenter.w;
      vec3 p = aPosition;
      p.xy = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * p.xy;
      p.yz = mat2(cos(aTilt.x), sin(aTilt.x), -sin(aTilt.x), cos(aTilt.x)) * p.yz;
      p.xy = mat2(cos(aTilt.y), sin(aTilt.y), -sin(aTilt.y), cos(aTilt.y)) * p.xy;
      p += aCenter.xyz;
      p.xz = mat2(cos(uPointer.x), sin(uPointer.x), -sin(uPointer.x), cos(uPointer.x)) * p.xz;
      p.yz = mat2(cos(uPointer.y), sin(uPointer.y), -sin(uPointer.y), cos(uPointer.y)) * p.yz;
      float depth = 8.5 - p.z;
      gl_Position = vec4(p.x * 2.35 / uAspect, p.y * 2.35, depth - 0.2, depth);
      gl_PointSize = clamp(aSize.x * uPixelRatio * 8.5 / depth, 1.0, uMaxPointSize);
      float shimmer = aSize.y < 0.5 ? 0.84 + 0.16 * sin(uTime * 0.7 + aPosition.x * 9.0 + aPosition.y * 7.0) : 1.0;
      vColor = vec4(aColor.rgb, aColor.a * shimmer);
      vKind = aSize.y;
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying lowp vec4 vColor;
    varying mediump float vKind;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float radius = dot(p, p);
      float halo = exp(-radius * (vKind > 0.5 ? 3.8 : 6.0));
      float edge = 1.0 - smoothstep(0.65, 1.0, radius);
      float flare = vKind < 0.5 ? exp(-abs(p.x) * 42.0 - abs(p.y) * 5.0) + exp(-abs(p.y) * 42.0 - abs(p.x) * 5.0) : 0.0;
      gl_FragColor = vec4(vColor.rgb, vColor.a * min(1.0, halo + flare * 0.22) * edge);
    }
  `;

  function createParticles(compact) {
    let seed = 731;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const bell = () => (random() + random() + random() - 1.5) * 1.15;
    const particles = [];
    const mix = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * amount);
    function point(position, center, tilt, color, size, kind = 0) {
      particles.push(...position, ...center, ...tilt, ...color, size, kind);
    }
    const white = [0.95, 0.91, 1];
    const violet = [0.58, 0.40, 1];
    const blue = [0.36, 0.67, 1];
    const gold = [1, 0.77, 0.48];
    for (let i = 0; i < (compact ? 360 : 740); i++) {
      const bright = random() > 0.965;
      point([(random() - 0.5) * 22, (random() - 0.5) * 15, random() * 11 - 7], [0, 0, 0, 0], [0, 0],
        [...mix(blue, white, random()), bright ? 0.85 : 0.18 + random() * 0.48], bright ? 4 + random() * 2 : 1.2 + random() * 1.8);
    }
    function galaxy({ center, tilt, radius, count, arms, warmth = 1 }) {
      for (let i = 0; i < count; i++) {
        const distance = Math.pow(random(), 0.66);
        const r = distance * radius;
        const angle = (i % arms) / arms * Math.PI * 2 + distance * 7.8 + bell() * (0.12 + distance * 0.32);
        const spread = 0.035 + distance * 0.14;
        const color = distance < 0.28 ? mix(gold, white, distance / 0.28) : mix(violet, blue, (distance - 0.28) / 0.72);
        color[0] *= warmth;
        point([Math.cos(angle) * r + bell() * spread, Math.sin(angle) * r + bell() * spread, bell() * (0.04 + distance * 0.1)],
          center, tilt, [...color, 0.34 + random() * 0.59], 1.1 + random() * 1.7);
      }
      for (let i = 0; i < Math.floor(count / 5); i++) {
        const distance = 0.12 + random() * 0.88;
        const angle = (i % arms) / arms * Math.PI * 2 + distance * 7.8 + bell() * 0.24;
        point([Math.cos(angle) * distance * radius, Math.sin(angle) * distance * radius, bell() * 0.13],
          center, tilt, [...mix(violet, blue, distance), 0.025 + random() * 0.045], (10 + random() * 24) * radius / 3, 1);
      }
      for (let i = 0; i < Math.floor(count / 7); i++) {
        const angle = random() * Math.PI * 2;
        const r = Math.pow(random(), 2.2) * radius * 0.3;
        point([Math.cos(angle) * r, Math.sin(angle) * r, bell() * radius * 0.045],
          center, tilt, [...mix(gold, white, random()), 0.28 + random() * 0.6], 1 + random() * 1.7);
      }
      point([0, 0, 0], center, tilt, [...gold, 0.16], radius * 38, 1);
      point([0, 0, 0.025], center, tilt, [...white, 0.5], radius * 13, 1);
      point([0, 0, 0.05], center, tilt, [...white, 0.95], 7);
    }
    galaxy({ center: [0.1, -0.05, 0, 0.016], tilt: [0.89, -0.42], radius: 3.1, count: compact ? 2000 : 4100, arms: 4 });
    galaxy({ center: [3.65, 2.15, -3.2, -0.012], tilt: [0.48, 0.6], radius: 1.08, count: compact ? 260 : 510, arms: 3, warmth: 0.88 });
    galaxy({ center: [-3.15, -1.45, -2, 0.02], tilt: [1.05, -0.25], radius: 0.83, count: compact ? 180 : 350, arms: 3 });
    for (let i = 0; i < (compact ? 75 : 140); i++) {
      const side = i % 2 ? 1 : -1;
      point([bell() * 1.6 + side * 1.85, bell() * 1.1 + side * 0.8, -2.5 + random() * 1.6], [0, 0, 0, 0], [0, 0],
        [...mix(violet, blue, i % 2), 0.018 + random() * 0.025], 65 + random() * 110, 1);
    }
    return new Float32Array(particles);
  }

  function mountUniverse(host) {
    const canvas = host.querySelector('canvas');
    if (!canvas) return () => {};
    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    } catch { return () => {}; }
    if (!gl) return () => {};
    const controller = new AbortController();
    const { signal } = controller;
    const art = host.closest('.orbit-art') || host;
    const compact = host.clientWidth < 460;
    const geometry = createParticles(compact);
    const pointer = [0, 0];
    const target = [0, 0];
    let program;
    let buffer;
    let uniforms;
    let frame = 0;
    let visible = true;
    let lost = false;
    let disposed = false;
    let elapsed = 0;
    let previous = 0;
    let lastDraw = 0;
    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    const paused = () => document.documentElement.dataset.orbitMotion === 'paused';
    const canAnimate = () => !disposed && !lost && visible && !document.hidden && !paused();
    function release() {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      buffer = null;
      program = null;
    }
    function setup() {
      const shaders = [];
      try {
        program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
          const shader = gl.createShader(type);
          if (!shader) throw new Error('Shader unavailable');
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
          gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program linking failed');
        gl.useProgram(program);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
        let offset = 0;
        for (const [name, size] of [['aPosition', 3], ['aCenter', 4], ['aTilt', 2], ['aColor', 4], ['aSize', 2]]) {
          const location = gl.getAttribLocation(program, name);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 60, offset * 4);
          offset += size;
        }
        uniforms = Object.fromEntries(['uTime', 'uAspect', 'uPixelRatio', 'uMaxPointSize', 'uPointer'].map(name => [name, gl.getUniformLocation(program, name)]));
        gl.uniform1f(uniforms.uMaxPointSize, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0, 0, 0, 0);
        host.dataset.universeReady = 'true';
        return true;
      } catch {
        release();
        delete host.dataset.universeReady;
        return false;
      } finally {
        shaders.forEach(shader => gl.deleteShader(shader));
      }
    }
    function draw() {
      if (!program || lost || disposed) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.uTime, elapsed);
      gl.uniform1f(uniforms.uAspect, width / height);
      gl.uniform1f(uniforms.uPixelRatio, pixelRatio);
      gl.uniform2f(uniforms.uPointer, pointer[0], pointer[1]);
      gl.drawArrays(gl.POINTS, 0, geometry.length / 15);
    }
    function tick(now) {
      frame = 0;
      if (!canAnimate()) { previous = 0; return; }
      if (previous) elapsed += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (now - lastDraw >= 1000 / 30) {
        pointer[0] += (target[0] - pointer[0]) * 0.07;
        pointer[1] += (target[1] - pointer[1]) * 0.07;
        draw();
        lastDraw = now;
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      if (canAnimate() && program && !frame) frame = requestAnimationFrame(tick);
      else if (!canAnimate()) { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    }
    function resize() {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.5 : 1.75);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      draw();
    }
    if (!setup()) return () => {};
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(host);
    const viewObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }) : null;
    viewObserver?.observe(host);
    const motionObserver = new MutationObserver(sync);
    motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-orbit-motion'] });
    document.addEventListener('visibilitychange', sync, { signal });
    art.addEventListener('pointermove', event => {
      if (paused() || event.pointerType !== 'mouse') return;
      const bounds = art.getBoundingClientRect();
      target[0] = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.18;
      target[1] = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.12;
    }, { passive: true, signal });
    art.addEventListener('pointerleave', () => { target[0] = 0; target[1] = 0; }, { signal });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); lost = true; delete host.dataset.universeReady; sync();
    }, { signal });
    canvas.addEventListener('webglcontextrestored', () => {
      lost = false;
      if (setup()) { resize(); sync(); }
    }, { signal });
    resize();
    sync();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      controller.abort();
      sizeObserver.disconnect();
      viewObserver?.disconnect();
      motionObserver.disconnect();
      release();
      delete host.dataset.universeReady;
    };
  }
  function init() {
    const scenes = new Map();
    let scanFrame = 0;
    function scan() {
      scanFrame = 0;
      for (const [host, dispose] of scenes) {
        if (!host.isConnected) { dispose(); scenes.delete(host); }
      }
      document.querySelectorAll('[data-universe-scene]').forEach(host => {
        if (!scenes.has(host)) scenes.set(host, mountUniverse(host));
      });
    }
    new MutationObserver(records => {
      if (!scanFrame && records.some(record => record.addedNodes.length || record.removedNodes.length)) scanFrame = requestAnimationFrame(scan);
    }).observe(document.body, { childList: true, subtree: true });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
