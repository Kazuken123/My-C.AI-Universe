/** A full-width, dependency-free multiscale WebGL cosmos shared by both frontends. */
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
    varying mediump vec2 vShape;
    void main() {
      // Orbit in the galaxy's own plane, preserving its fixed sky inclination.
      float spin = uTime * aCenter.w;
      vec3 p = aPosition;
      p.xy = mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * p.xy;
      p.yz = mat2(cos(aTilt.x), sin(aTilt.x), -sin(aTilt.x), cos(aTilt.x)) * p.yz;
      p.xy = mat2(cos(aTilt.y), sin(aTilt.y), -sin(aTilt.y), cos(aTilt.y)) * p.xy;
      p += aCenter.xyz;
      vec3 skyPosition = p;
      vec2 look = uPointer + vec2(sin(uTime * .028) * .022, cos(uTime * .021) * .013);
      p.xz = mat2(cos(look.x), sin(look.x), -sin(look.x), cos(look.x)) * p.xz;
      p.yz = mat2(cos(look.y), sin(look.y), -sin(look.y), cos(look.y)) * p.yz;
      // The distant black hole is anchored in the deep field, with restrained parallax.
      if (aSize.y > 3.5 && aSize.y < 4.5) p = mix(skyPosition, p, .12);
      float depth = max(1.0, 16.0 - p.z);
      gl_Position = vec4(p.x * 2.0 / uAspect, p.y * 2.0, depth - .2, depth);
      gl_PointSize = clamp(aSize.x * uPixelRatio * 16.0 / depth, 1.0, uMaxPointSize);
      float shimmer = aSize.y < .5 ? .88 + .12 * sin(uTime * .65 + aPosition.x * 9.0 + aPosition.y * 7.0) : 1.0;
      vColor = vec4(aColor.rgb, aColor.a * shimmer);
      vKind = aSize.y;
      vShape = aTilt;
    }
  `;
  const fragmentSource = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform float uTime;
    varying lowp vec4 vColor;
    varying mediump float vKind;
    varying mediump vec2 vShape;
    float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float noise(vec2 p) {
      vec2 cell = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(cell), hash(cell + vec2(1., 0.)), f.x),
                 mix(hash(cell + vec2(0., 1.)), hash(cell + vec2(1.)), f.x), f.y);
    }
    // Advect a periodic texture around the disc. No time seam at atan's +/-PI.
    float accretionFlow(float radius, float angle) {
      float speed = .48 + .24 / pow(max(radius, .28), 1.35);
      float phase = angle - uTime * speed;
      vec2 orbit = vec2(cos(phase), sin(phase));
      float turbulence = noise(orbit * (6. + radius * 11.) + radius * vec2(9., 4.));
      float bands = .78 + .12 * sin(radius * 95. + turbulence * 3.5);
      float streams = .7 + .22 * sin(phase * 3. + radius * 19.)
                            + .08 * sin(phase * 7. - radius * 31.);
      return bands * streams * (.65 + turbulence * .5);
    }
    vec4 blackHole(vec2 p) {
      float tilt = vShape.y;
      vec2 q = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * p;
      float r = length(q);
      // Almost edge-on: a thin ellipse in front, a lensed image behind the shadow.
      vec2 plane = vec2(q.x, q.y / vShape.x);
      float discRadius = length(plane);
      float discAngle = atan(plane.y, plane.x);
      float discMask = smoothstep(.26, .34, discRadius) * (1. - smoothstep(.72, .94, discRadius));
      float shadow = 1. - smoothstep(.266, .279, r);
      float front = smoothstep(-.008, .012, q.y);
      float discVisibility = 1. - shadow * (1. - front);
      float flow = accretionFlow(discRadius, discAngle);
      float beaming = 1.12 - .4 * smoothstep(-.85, .85, q.x);
      float disc = discMask * discVisibility * flow * beaming;
      float heat = 1. - smoothstep(.28, .9, discRadius);
      vec3 discColor = mix(vec3(.37, .16, .055), vec3(1., .76, .4), heat);
      discColor = mix(discColor, vec3(1., .94, .76), pow(heat, 3.));
      // A broad upper arc and a much fainter lower image, connected to the disc.
      vec2 lens = vec2(q.x, q.y / .92);
      float lensRadius = length(lens);
      float lensAngle = atan(lens.y, lens.x);
      float arcMask = smoothstep(.282, .305, lensRadius) * (1. - smoothstep(.365, .445, lensRadius));
      float upper = smoothstep(.015, .16, -q.y);
      float lower = smoothstep(.015, .14, q.y) * .12;
      float lensedFlow = accretionFlow(.38 + (lensRadius - .3) * 2.8, lensAngle);
      float lensBands = .83 + .17 * sin(lensRadius * 160. + lensedFlow * 2.);
      float arc = arcMask * (upper + lower) * lensBands * lensedFlow * beaming;
      float photon = exp(-abs(r - .28) * 250.) * (.38 + upper * .34);
      float bloom = exp(-abs(lensRadius - .33) * 28.) * upper * .065;
      bloom += exp(-abs(q.y) * 65.) * exp(-q.x * q.x * 3.) * .055;
      bloom *= 1. - shadow;
      vec3 light = discColor * disc * 1.65 + vec3(1., .81, .49) * arc * 1.7;
      light += vec3(1., .88, .65) * photon + vec3(.8, .48, .22) * bloom;
      // Keep a crisp dark silhouette, with a restrained atmospheric glow.
      light *= 1. - smoothstep(.91, 1., r);
      vec3 mapped = 1. - exp(-light * 1.4);
      float alpha = max(shadow, max(mapped.r, max(mapped.g, mapped.b)));
      return vec4(mapped / max(alpha, .001), alpha);
    }
    vec4 planet(vec2 p, float radius) {
      vec2 q = p / radius;
      float r = dot(q, q);
      if (r > 1.15) return vec4(0.);
      float edge = 1.0 - smoothstep(.98, 1.07, r);
      vec3 n = vec3(q.x, -q.y, sqrt(max(0., 1.0 - r)));
      float light = max(0., dot(n, normalize(vec3(-.65, .5, .6))));
      float bands = .5 + .5 * sin(q.y * 24. + noise(q * 5. + uTime * .006) * 3.);
      vec3 surface = mix(vColor.rgb * .35, vColor.rgb, bands * .55 + .25);
      vec3 color = surface * (.055 + light * .88);
      float rim = pow(1.0 - max(0., n.z), 3.) * max(.12, light);
      color += vec3(.26, .5, .84) * rim * .85;
      return vec4(color, edge);
    }
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float radius = dot(p, p);
      if (vKind < .5) {
        float flare = exp(-abs(p.x) * 42. - abs(p.y) * 5.) + exp(-abs(p.y) * 42. - abs(p.x) * 5.);
        float alpha = (exp(-radius * 6.) + flare * .19) * (1. - smoothstep(.65, 1., radius));
        gl_FragColor = vec4(vColor.rgb, vColor.a * min(1., alpha));
      } else if (vKind < 1.5) {
        float grain = noise(p * 3. + vShape.y * 8. + uTime * .008);
        grain = grain * .65 + noise(p * 7. - vShape.x * 9.) * .35;
        float alpha = exp(-radius * 3.) * smoothstep(.18, .72, grain) * (1. - smoothstep(.5, 1., radius));
        gl_FragColor = vec4(vColor.rgb * (.7 + grain * .6), vColor.a * alpha);
      } else if (vKind < 2.5) {
        float angle = vShape.y;
        vec2 q = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * p;
        q.y /= max(.22, vShape.x);
        float r = length(q);
        // Rotate the spiral light within its fixed projected ellipse.
        float orbit = atan(q.y, q.x) - uTime * (.07 + vShape.x * .035);
        float arm = .65 + .35 * sin(orbit * 2. + r * 12.);
        float alpha = (exp(-r * r * 16.) + exp(-r * 4.) * arm * .55) * (1. - smoothstep(.65, 1., r));
        gl_FragColor = vec4(mix(vColor.rgb, vec3(1., .87, .66), exp(-r * 8.)), vColor.a * alpha);
      } else if (vKind < 3.5) {
        gl_FragColor = planet(p, .87);
      } else if (vKind < 4.5) {
        gl_FragColor = blackHole(p);
      } else {
        vec2 q = mat2(.94, .342, -.342, .94) * p;
        float r = length(vec2(q.x / .96, q.y / .26));
        float ring = smoothstep(.51, .59, r) * (1. - smoothstep(.94, 1., r));
        ring *= .55 + .2 * sin(r * 105.);
        vec4 body = planet(p, .43);
        vec4 belt = vec4(vec3(.72, .64, .58), ring * .8);
        gl_FragColor = body.a > .1 && (q.y < 0. || ring < .05) ? body : vec4(mix(body.rgb, belt.rgb, belt.a), max(body.a, belt.a));
      }
      if (gl_FragColor.a < .002) discard;
    }
  `;

  // An illustrative multiscale panorama, not an astronomical map.
  // Seeded geometry stays stable across route changes and contains real 3D depth.
  function createParticles(compact) {
    let seed = 731;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const bell = () => (random() + random() + random() - 1.5) * 1.15;
    const particles = [];
    const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
    const white = [.96, .93, 1], violet = [.48, .3, .84], blue = [.28, .6, .91], gold = [1, .7, .38];
    function point(position, center, tilt, color, size, kind = 0) {
      particles.push(...position, ...center, ...tilt, ...color, size, kind);
    }
    const still = [0, 0, 0, 0];
    const counts = { stars: 0, galaxies: 0, filaments: 0, nebulae: 0, worlds: 0 };
    for (let i = 0; i < (compact ? 850 : 2200); i++) {
      const bright = random() > .975;
      point([(random() - .5) * 49, (random() - .5) * 31, random() * 28 - 22], still, [0, 0],
        [...mix(blue, white, random()), bright ? .95 : .22 + random() * .55], bright ? 4 + random() * 3 : 1.15 + random() * 1.7);
      counts.stars++;
    }
    // Distant galaxies have distinct silhouettes, temperatures and inclinations.
    for (let i = 0; i < (compact ? 30 : 76); i++) {
      point([0, 0, 0], [(random() - .5) * (compact ? 14 : 43), (random() - .5) * 25, -4 - random() * 19, 0],
        [.23 + random() * .65, random() * 6.28], [...mix(blue, gold, random()), .45 + random() * .45], 7 + random() * 24, 2);
      counts.galaxies++;
    }
    function galaxy(center, tilt, radius, count, arms) {
      counts.galaxies++;
      for (let i = 0; i < count; i++) {
        const distance = Math.pow(random(), .68), r = distance * radius;
        const angle = (i % arms) / arms * Math.PI * 2 + distance * 8.2 + bell() * (.15 + distance * .34);
        const color = distance < .25 ? mix(gold, white, distance * 4) : mix(violet, blue, distance);
        point([Math.cos(angle) * r + bell() * .09, Math.sin(angle) * r + bell() * .09, bell() * (.025 + distance * .08)],
          center, tilt, [...color, .28 + random() * .65], 1 + random() * 1.55);
      }
      for (let i = 0; i < count / 15; i++) {
        const d = random(), angle = (i % arms) / arms * Math.PI * 2 + d * 8.2;
        point([Math.cos(angle) * d * radius, Math.sin(angle) * d * radius, bell() * .08], center, tilt,
          [...mix(violet, blue, d), .08 + random() * .07], 12 + random() * 28, 1);
      }
      point([0, 0, 0], center, tilt, [...gold, .55], 27, 1);
      point([0, 0, .03], center, tilt, [...white, .95], 4);
    }
    galaxy([compact ? 1.3 : 4.6, compact ? -1.8 : .9, .3, .065], [.78, -.45], 2.2, compact ? 1250 : 2850, 4);
    galaxy([compact ? -2 : -4.6, compact ? -3.8 : 4.2, -4, -.047], [1.12, .65], 1.4, compact ? 240 : 650, 3);
    galaxy([compact ? 2.4 : 8.1, compact ? 2.4 : -3.7, -7.5, .08], [.42, .3], 1.1, compact ? 180 : 420, 3);

    // Sparse, curved filaments join clusters across dark voids.
    const nodes = [[-11,5,-12],[-6,2,-8],[-2,5,-13],[3,4,-9],[8,6,-16],[11,1,-10],[6,-2,-7],[1,-5,-14],[-5,-3,-10],[-10,-6,-17]];
    const links = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[1,8],[3,6],[2,7]];
    if (compact) nodes.forEach(node => { node[0] *= .4; });
    for (const [from, to] of links) {
      counts.filaments++;
      const a = nodes[from], b = nodes[to], steps = compact ? 55 : 130;
      for (let i = 0; i < steps; i++) {
        const t = i / steps, bend = Math.sin(t * Math.PI);
        const position = a.map((v, j) => v + (b[j] - v) * t + bell() * .14 + (j === 1 ? bend * .65 : 0));
        point(position, still, [0, from * .4], [...mix(blue, violet, t), .13 + random() * .24], 1.2 + random() * 1.1);
        if (i % 10 === 0) point(position, still, [from, t], [...violet, .085], 25 + random() * 30, 1);
      }
    }
    nodes.forEach((node, index) => {
      for (let i = 0; i < (compact ? 24 : 70); i++) {
        point(node.map(v => v + bell() * .56), still, [0, 0], [...mix(gold, white, random()), .28 + random() * .4], 1.1 + random() * 1.7);
      }
      point([0, 0, 0], [...node, 0], [.35 + random() * .4, index], [...white, .75], 14 + random() * 14, 2);
      counts.galaxies++;
    });

    // Broad nebular rivers: cool teal-violet gas and a restrained amber star nursery.
    for (let i = 0; i < (compact ? 105 : 195); i++) {
      const t = random(), branch = i % 3;
      const x = (t - .5) * (compact ? 12 : 31);
      const y = Math.sin(t * 5.2 + branch * .7) * 3.6 + (branch - 1) * 2.6 + bell() * 1.2;
      const tint = branch === 2 ? mix([.78, .27, .13], [.4, .22, .6], t) : mix([.13, .4, .5], violet, t);
      point([x, y, -6 - random() * 9], still, [random() * 5, random() * 5],
        [...tint, .12 + random() * .13], 100 + random() * 105, 1);
      counts.nebulae++;
    }
    // Draw opaque foreground bodies last so their unlit sides occlude the star field.
    const opaqueOffset = particles.length / 15;
    // Move the black hole from z=1.6 to z=-9 and scale x/y/size by the same
    // depth ratio: it keeps its apparent size and position, but sits behind worlds.
    const blackHoleDepthScale = 25 / 14.4;
    point([0, 0, 0], [(compact ? -1.65 : 1.9) * blackHoleDepthScale, (compact ? -.45 : 3.3) * blackHoleDepthScale, -9, 0],
      [.17, -.08], [...gold, 1], (compact ? 72 : 106) * blackHoleDepthScale, 4);
    point([0, 0, 0], [compact ? 1.45 : 6.7, compact ? -2.55 : -3.15, 5.5, 0], [0, 0], [.35, .52, .66, 1], compact ? 115 : 150, 5);
    point([0, 0, 0], [compact ? -1.65 : -8, compact ? -4.1 : -4.8, 6.5, 0], [0, 0], [.48, .36, .58, 1], compact ? 58 : 76, 3);
    counts.worlds = 3;
    return { data: new Float32Array(particles), opaqueOffset, counts };
  }

  function mountUniverse(host) {
    const canvas = host.querySelector('canvas');
    if (!canvas) return () => {};
    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true, powerPreference: 'low-power' });
    } catch { return () => {}; }
    if (!gl) return () => {}; // The layered CSS space scene remains visible.
    const controller = new AbortController();
    const { signal } = controller;
    const art = host.closest('.orbit-hero') || host.closest('.orbit-art') || host;
    const compact = (window.innerWidth || host.clientWidth) < 769;
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
    const canAnimate = () => !disposed && !lost && visible && !document.hidden;

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
        gl.bufferData(gl.ARRAY_BUFFER, geometry.data, gl.STATIC_DRAW);
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
        host.dataset.universeLayers = Object.keys(geometry.counts).join(' ');
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
      // Additive light for gas and stars; normal alpha for dark foreground bodies.
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, geometry.opaqueOffset);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, geometry.opaqueOffset, geometry.data.length / 15 - geometry.opaqueOffset);
    }
    function tick(now) {
      frame = 0;
      if (!canAnimate()) { previous = 0; return; }
      if (previous) elapsed += Math.min((now - previous) / 1000, 0.05);
      previous = now;
      // 30fps is plenty for this slow scene and keeps laptop GPU use modest.
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
      // A panoramic canvas should not multiply GPU cost on high-density 4K displays.
      pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5, Math.sqrt(1600000 / (width * height)));
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
    document.addEventListener('visibilitychange', sync, { signal });
    art.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
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
    // Next navigation mounts and releases the same renderer as the static page.
    new MutationObserver(records => {
      if (!scanFrame && records.some(record => record.addedNodes.length || record.removedNodes.length)) scanFrame = requestAnimationFrame(scan);
    }).observe(document.body, { childList: true, subtree: true });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();