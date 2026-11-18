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

      vec2 look = uPointer + vec2(sin(uTime * .028) * .022, cos(uTime * .021) * .013);
      p.xz = mat2(cos(look.x), sin(look.x), -sin(look.x), cos(look.x)) * p.xz;
      p.yz = mat2(cos(look.y), sin(look.y), -sin(look.y), cos(look.y)) * p.yz;
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

  const lensVertex = `
    attribute vec2 aCorner;
    varying vec2 vUv;
    void main() {
      vUv = aCorner * .5 + .5;
      gl_Position = vec4(aCorner, 0., 1.);
    }
  `;
  const lensFragment = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uSky;
    uniform vec2 uSize;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * .1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
    }
    // A narrow dust lane supplies a recognizable feature behind the lens.
    vec3 sky(vec2 uv) {
      vec2 p = (uv-uCenter)*uSize/uRadius;
      float grain = noise(p*2.)*.5 + noise(p*6.)*.3 + noise(p*17.)*.2;
      float lane = p.y - .35*p.x - .62 + .2*sin(p.x*.8);
      float cloud = exp(-abs(lane)*2.8)*pow(grain,2.) + exp(-abs(lane+.24)*9.)*grain*.36;
      vec3 field = texture2D(uSky,clamp(uv,vec2(.001),vec2(.999))).rgb;
      return vec3(.014,.021,.032) + field*vec3(.48,.46,.42) + vec3(.32,.38,.43)*cloud;
    }

    void main() {
      vec2 p = (vUv-uCenter)*uSize/uRadius;
      float r = length(p);
      // Inverse screen-space lens mapping. Distant background samples stay fixed.
      float influence = 1.-smoothstep(2.1,4.8,r);
      vec2 bend = p*(1.22/max(r*r,.15))*influence;
      vec3 color = sky(vUv-bend*uRadius/uSize);
      vec2 q = mat2(.978,-.208,.208,.978)*p;
      float azimuth = atan(q.y,q.x);
      float shadow = 1.-smoothstep(.979,1.006,r);
      color = mix(color,vec3(.006,.008,.012),shadow);
      // Trace the same flowing bands along the direct disk and its two far-side images.
      float upper = step(0.,q.y);
      float arcR = length(vec2(q.x,q.y/mix(.80,1.06,upper)));
      float arcDepth = (arcR-1.)/.29;
      float arc = smoothstep(-.06,.1,arcDepth)*(1.-smoothstep(.12,1.25,arcDepth));
      arc *= mix(.22,1.,upper) * (.55+.45*smoothstep(.0,.44,abs(q.y)));
      float diskR = length(vec2(q.x,(q.y+.09)/.13));
      float disk = (1.-smoothstep(1.15,3.95,diskR))*smoothstep(.4,1.05,diskR);
      // Near-side gas crosses the silhouette; the far half disappears behind it.
      disk *= 1.-shadow*smoothstep(-.12,.025,q.y);
      float phase = uTime*.17;
      float diskAngle = atan((q.y+.09)/.13,q.x);
      vec2 orbit = vec2(cos(diskAngle-phase),sin(diskAngle-phase));
      float diskGrain = noise(orbit*7.+diskR*8.);
      float softness = smoothstep(40.,120.,uRadius);
      float ribbons = sin(diskR*31.+diskGrain*4.);
      float detail = sin(diskR*62.+diskGrain*7.);
      float bands = .65 + .22*ribbons + .09*detail*softness + .11*(diskGrain-.5);
      float arcGrain = noise(vec2(cos(azimuth-phase),sin(azimuth-phase))*8.+arcR*22.);
      float contours = .67+.19*sin(arcDepth*20.+3.6*arcGrain)+.09*sin(arcDepth*48.)*softness;
      float beam = mix(1.35,.54,smoothstep(-1.4,1.4,q.x));
      float flux = beam*(disk*bands*(.8+.4*diskGrain)+arc*contours);
      float photon = exp(-abs(r-.994)*112.)*(.46+.22*sin(azimuth));
      float bloom = exp(-abs(arcR-1.08)*7.)*(1.-shadow)*mix(.025,.12,upper);
      bloom += exp(-abs(q.y+.09)*6.2)*exp(-abs(q.x)*.94)*.20*(1.-shadow);
      color += vec3(.92,.43,.15)*(flux+bloom);
      color += vec3(.63,.61,.55)*(smoothstep(.22,.95,flux)*.85+photon);
      gl_FragColor = vec4(min(color,vec3(1.)),1.);
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
    point([0, 0, 0], [compact ? 1.45 : 6.7, compact ? -2.55 : -3.15, 5.5, 0], [0, 0], [.35, .52, .66, 1], compact ? 115 : 150, 5);
    point([0, 0, 0], [compact ? -1.65 : -8, compact ? -4.1 : -4.8, 6.5, 0], [0, 0], [.48, .36, .58, 1], compact ? 58 : 76, 3);
    counts.worlds = 2;
    return { data: new Float32Array(particles), opaqueOffset, counts };
  }

  function mountUniverse(host) {
    const canvas = host.querySelector('canvas');
    if (!canvas) return () => {};
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let gl;
    function acquireContext() {
      try {
        return canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
      } catch { return null; }
    }

    const controller = new AbortController();
    const { signal } = controller;
    const art = host.closest('.orbit-hero') || host.closest('.orbit-art') || host;
    const compact = (window.innerWidth || host.clientWidth) < 769;
    let geometry;
    const pointer = [0, 0];
    const target = [0, 0];
    let program;
    let buffer;
    let uniforms;
    let lensProgram, quad, skyTexture, framebuffer, lensUniforms, corner;
    let attributes = [];
    const paused = () => Boolean(reduced?.matches || document.documentElement.dataset.orbitMotion === 'paused');

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
    const resolutionScales = [1, .75, .5];
    let qualityLevel = 0;
    let posterOnly = false;
    let sampleStart = 0;
    let samples = 0;
    let slowSamples = 0;
    function resetSampleWindow() {
      sampleStart = samples = slowSamples = lastDraw = 0;
    }
    const canAnimate = () => !disposed && !lost && visible && !document.hidden && !paused() && !posterOnly;

    function release() {
      if (buffer) gl.deleteBuffer(buffer);
      if (quad) gl.deleteBuffer(quad);
      if (program) gl.deleteProgram(program);
      if (lensProgram) gl.deleteProgram(lensProgram);
      if (skyTexture) gl.deleteTexture(skyTexture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      quad = buffer = program = lensProgram = skyTexture = framebuffer = null;
      delete host.dataset.universeReady;
    }
    function compile(vertex, fragment) {
      const result = gl.createProgram();
      const shaders = [];
      try {
        for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
          const shader = gl.createShader(type);
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
          gl.attachShader(result, shader);
        }
        gl.linkProgram(result);
        if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error('Program linking failed');
        return result;
      } catch (error) {
        gl.deleteProgram(result);
        throw error;
      } finally {
        shaders.forEach(shader => gl.deleteShader(shader));
      }
    }
    function setup() {
      try {
        geometry ||= createParticles(compact);
        program = compile(vertexSource, fragmentSource);
        lensProgram = compile(lensVertex, lensFragment);
        buffer = gl.createBuffer();
        quad = gl.createBuffer();
        framebuffer = gl.createFramebuffer();
        skyTexture = gl.createTexture();
        if (!buffer || !quad || !framebuffer || !skyTexture) throw new Error('Scene allocation failed');
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.data, gl.STATIC_DRAW);
        let offset = 0;
        attributes = [['aPosition',3],['aCenter',4],['aTilt',2],['aColor',4],['aSize',2]].map(([name,size]) => {
          const attribute = { location: gl.getAttribLocation(program,name), size, offset };
          offset += size*4;
          return attribute;
        });
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
        corner = gl.getAttribLocation(lensProgram,'aCorner');
        const locations = (target,names) => Object.fromEntries(names.map(name => [name,gl.getUniformLocation(target,name)]));
        uniforms = locations(program,['uTime','uAspect','uPixelRatio','uMaxPointSize','uPointer']);
        lensUniforms = locations(lensProgram,['uSize','uCenter','uRadius','uTime','uSky']);
        gl.useProgram(program);
        gl.uniform1f(uniforms.uMaxPointSize,gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
        gl.bindTexture(gl.TEXTURE_2D,skyTexture);
        for (const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
        for (const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D,null);
        host.dataset.universeLayers = Object.keys(geometry.counts).join(' ') + ' lens';
        return true;
      } catch {
        release();
        return false;
      }
    }
    function bindParticles() {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for (const {location,size,offset} of attributes) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location,size,gl.FLOAT,false,60,offset);
      }
      gl.enable(gl.BLEND);
    }
    function draw() {
      if (!program || lost || disposed || paused()) return;
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.clearColor(0,0,0,1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      bindParticles();
      gl.uniform1f(uniforms.uTime,elapsed);
      gl.uniform1f(uniforms.uAspect,width/height);
      gl.uniform1f(uniforms.uPixelRatio,pixelRatio);
      gl.uniform2f(uniforms.uPointer,pointer[0],pointer[1]);
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS,0,geometry.opaqueOffset);
      for (const {location} of attributes) gl.disableVertexAttribArray(location);

      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.useProgram(lensProgram);
      gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER,quad);
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner,2,gl.FLOAT,false,0,0);
      gl.bindTexture(gl.TEXTURE_2D,skyTexture);
      gl.uniform1i(lensUniforms.uSky,0);
      const narrow = (window.innerWidth || width) < 769;
      gl.uniform2f(lensUniforms.uSize,width,height);
      gl.uniform2f(lensUniforms.uCenter,narrow ? .53 : .72,narrow ? .69 : .51);
      gl.uniform1f(lensUniforms.uRadius,Math.min(width*(narrow ? .17 : .082),height*(narrow ? .15 : .185)));
      gl.uniform1f(lensUniforms.uTime,elapsed);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindTexture(gl.TEXTURE_2D,null);
      gl.disableVertexAttribArray(corner);

      bindParticles();
      gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS,geometry.opaqueOffset,geometry.data.length/15-geometry.opaqueOffset);
      host.dataset.universeReady = 'true';
    }
    // Ignore startup, GPU reallocation and hidden time. Eight slow submissions
    // within a ten-frame sample identify a sustained cost rather than a single stall.
    function adaptResolution(now) {
      if (!sampleStart) sampleStart = now;
      if (!lastDraw || now - sampleStart < 1200) return false;
      const lowest = qualityLevel === resolutionScales.length - 1;
      if (now - lastDraw > (lowest ? 100 : 70)) slowSamples++;
      if (++samples < 10) return false;
      const overBudget = slowSamples >= 8;
      samples = slowSamples = 0;
      if (!overBudget) return false;
      if (lowest) {
        posterOnly = true;
        host.dataset.universeQuality = 'poster';
        release();
      } else {
        qualityLevel++;
        resize();
      }
      return true;
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
        if (!adaptResolution(now)) {
          draw();
          lastDraw = now;
        }
      }
      if (canAnimate() && program) frame = requestAnimationFrame(tick);
    }
    function sync() {
      if (canAnimate() && program && !frame) frame = requestAnimationFrame(tick);
      else if (!canAnimate() || !program) { cancelAnimationFrame(frame); frame = 0; previous = 0; resetSampleWindow(); }
    }
    function resize() {
      resetSampleWindow();
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      // A panoramic canvas should not multiply GPU cost on high-density 4K displays.
      pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5, Math.sqrt(1600000 / (width * height))) * resolutionScales[qualityLevel];
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      if (!program || lost || paused() || posterOnly) return;
      host.dataset.universeQuality = String(resolutionScales[qualityLevel]);
      gl.bindTexture(gl.TEXTURE_2D,skyTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,canvas.width,canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,skyTexture,0);
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.bindTexture(gl.TEXTURE_2D,null);
      if (!complete) { release(); sync(); return; }
      draw();
    }

    function motionChanged() {
      if (paused()) {
        delete host.dataset.universeReady;
      } else if (!lost && !posterOnly) {
        gl ||= acquireContext();
        if (gl && (program || setup())) resize();
      }
      sync();
    }
    reduced?.addEventListener('change',motionChanged,{signal});
    const motionObserver = new MutationObserver(motionChanged);
    motionObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-orbit-motion']});

    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(host);
    const viewObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }) : null;
    viewObserver?.observe(host);
    document.addEventListener('visibilitychange', sync, { signal });
    art.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || !program || !canAnimate()) return;
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
      release(); motionChanged();
    }, { signal });
    motionChanged();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      controller.abort();
      motionObserver.disconnect();
      sizeObserver.disconnect();
      viewObserver?.disconnect();
      delete host.dataset.universeQuality;
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