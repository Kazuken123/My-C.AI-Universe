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
    vec4 planet(vec2 p, float radius, float atmosphere) {
      vec2 q = p / radius;
      float r = dot(q, q);
      if (r > 1.13) return vec4(0.);
      float edge = 1.0 - smoothstep(.965, 1.025, r);
      vec3 n = vec3(q.x, -q.y, sqrt(max(0., 1.0 - r)));
      // A source behind the silhouette lights one crescent of its visible sphere.
      vec3 star = normalize(vec3(vShape, mix(-.83, -.25, atmosphere)));
      float light = max(0., dot(n, star));
      vec2 surfaceUv = n.xy + n.z * vec2(.37, .68);
      float terrain = .64 * noise(surfaceUv * 7.) + .36 * noise(surfaceUv * 23. + 8.);
      float surface = .28 + .72 * smoothstep(.15, .85, terrain);
      vec3 color = vec3(.008, .011, .019) + vColor.rgb * surface * light * mix(.65, 1.05, atmosphere);
      float litLimb = pow(max(.0001, dot(normalize(n.xy + vec2(.0001)), normalize(star.xy))), 2.2);
      float rim = exp(-n.z * mix(7., 12., atmosphere)) * litLimb;
      vec3 rimColor = mix(vColor.rgb, vec3(.78, .73, .66), atmosphere * .5);
      color += rimColor * rim * mix(.15, .72, atmosphere);
      float halo = exp(-max(0., r - 1.) * 51.) * litLimb * .22 * atmosphere;
      return vec4(mix(vColor.rgb * .58, color, edge), max(edge, halo));
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
        gl_FragColor = planet(p, .81, .0);
      } else {
        gl_FragColor = planet(p, .87, 1.);
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
      vec3 q = fract(vec3(p.xyx) * 0.1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    // Exact integer-periodic angular noise for strictly one-way, seam-free orbital flow.
    float pnoise(float u, float v, float period) {
      float iu = floor(u);
      float fu = u - iu;
      fu = fu * fu * (3.0 - 2.0 * fu);
      float iv = floor(v);
      float fv = v - iv;
      fv = fv * fv * (3.0 - 2.0 * fv);
      float u0 = mod(iu, period);
      u0 = floor(u0 + 0.5);
      if (u0 < 0.0) u0 += period;
      if (u0 >= period) u0 -= period;
      float u1 = u0 + 1.0;
      if (u1 >= period) u1 -= period;
      return mix(
        mix(hash(vec2(u0, iv)), hash(vec2(u1, iv)), fu),
        mix(hash(vec2(u0, iv + 1.0)), hash(vec2(u1, iv + 1.0)), fu),
        fv
      );
    }

    // Co-moving domain-warped braided silk filaments: strictly one-way orbital advection,
    // zero radial pumping, zero half-orbit reversal, zero atan seam.
    float diskFilaments(float hr, float ang, float archMix, float leftWing, float coreGlow) {
      float lr = log(max(hr, 1.05));
      float phase = ang / 6.2831853 + 0.5 + fract(uTime * 0.048);
      float warpAmp = mix(0.42, 1.08, archMix);
      float warp = (pnoise(phase * 4.0, lr * 7.5, 4.0) * 1.95 + pnoise(phase * 10.0, lr * 18.0, 10.0) * 0.60) * warpAmp;
      float broad = pnoise(phase * 5.0, lr * 15.0 + warp, 5.0);
      float fine = pnoise(phase * 14.0, lr * 56.0 + warp * 2.0, 14.0);
      float thread = pnoise(phase * 22.0, lr * 112.0 + warp * 3.8, 22.0);
      float threadFade = 1.0 - smoothstep(5.2, 13.0, hr);
      float lanes = 0.16 + 1.18 * pow(max(broad, 0.0001), 1.72);
      float threads = 0.34 + 0.78 * fine + 0.46 * thread * threadFade;
      float turb = pnoise(phase * 16.0, lr * 34.0, 16.0) * pnoise(phase * 32.0, lr * 68.0, 32.0);
      return lanes * threads + leftWing * coreGlow * 0.45 * turb;
    }

    vec4 evalDisk(vec3 hit, vec3 rayVel, float layerScale) {
      float hr = length(hit.xz);
      if (hr < 1.36 || hr > 16.5) return vec4(0.0);

      // Approaching left wing stretches diagonally into space; front/right wraps softly around the shadow.
      float ang = atan(hit.z, hit.x);
      float leftRatio = smoothstep(0.30, -0.92, hit.x / max(hr, 0.001));
      float backTrim = smoothstep(4.2, 0.3, hit.z);
      float leftWing = leftRatio * mix(0.24, 1.0, backTrim);
      float outerExtent = mix(6.5, 17.0, leftWing);

      float innerEdge = smoothstep(1.36, 1.92, hr);
      // Soft exponential atmospheric decay so outer edges dissolve like glowing mist.
      float radialDiff = max(hr - 2.0, 0.0) / max(outerExtent * 0.48, 1.0);
      float outerMist = exp(-pow(max(radialDiff, 0.0001), 1.50));
      float coreGlow = exp(-max(hr - 1.85, 0.0) * mix(0.55, 0.18, leftWing));
      float mask = innerEdge * outerMist * (0.34 + 0.78 * coreGlow) * layerScale;
      if (mask < 0.002) return vec4(0.0);

      float archMix = smoothstep(1.2, -1.2, hit.z);
      float tex = diskFilaments(hr, ang, archMix, leftWing, coreGlow);

      // Relativistic Doppler beaming: approaching gas on the left (-x) beams toward the camera (+z).
      vec3 tang = normalize(vec3(hit.z, 0.0, -hit.x));
      float doppler = clamp(1.0 + 0.56 * dot(tang, -normalize(rayVel)) / sqrt(max(hr, 1.35)), 0.40, 2.20);

      float intensity = mask * tex * doppler;
      float diffuseHalo = innerEdge * outerMist * 0.06 * doppler * layerScale;
      float total = intensity + diffuseHalo;
      float heat = clamp(total * (0.58 + 0.76 * exp(-(hr - 1.65) * 0.38)), 0.0, 2.8);

      // Braided champagne-ivory over deep smoky espresso-sepia valleys.
      vec3 col = mix(vec3(0.24, 0.13, 0.11), vec3(0.76, 0.49, 0.36), smoothstep(0.02, 0.42, heat));
      col = mix(col, vec3(0.96, 0.84, 0.70), smoothstep(0.36, 0.96, heat));
      col = mix(col, vec3(1.00, 0.94, 0.84), smoothstep(0.85, 1.58, heat));
      col = mix(col, vec3(1.00, 0.98, 0.94), smoothstep(1.45, 2.35, heat));

      float alpha = clamp(total * mix(0.36, 0.92, exp(-(hr - 1.7) * 0.24)), 0.0, 0.95);
      return vec4(col * (total * 1.38), alpha);
    }

    vec2 mirrorUv(vec2 uv) {
      vec2 w = mod(mod(uv + 1.0, 2.0) + 2.0, 2.0);
      return clamp(abs(w - 1.0), vec2(0.002), vec2(0.998));
    }

    vec3 sky(vec2 uv) {
      vec2 safeUv = mirrorUv(uv);
      vec2 p = (safeUv - uCenter) * uSize / max(uRadius, 1.0);
      float grain = noise(p * 2.0) * 0.5 + noise(p * 6.0) * 0.3 + noise(p * 17.0) * 0.2;
      float lane = p.y - 0.35 * p.x - 0.62 + 0.2 * sin(p.x * 0.8);
      float cloud = exp(-abs(lane) * 2.8) * pow(max(grain, 0.0001), 2.0) + exp(-abs(lane + 0.24) * 9.0) * grain * 0.36;
      vec3 field = texture2D(uSky, safeUv).rgb;
      return vec3(0.014, 0.018, 0.032) + field * vec3(0.56, 0.53, 0.52) + vec3(0.30, 0.34, 0.44) * cloud;
    }

    vec3 acesFilmic(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }

    void main() {
      vec2 sp = (vUv - uCenter) * uSize / max(uRadius, 1.0);
      // Tilt equatorial plane ~22.5 deg from bottom-left to top-right.
      vec2 p = mat2(0.9239, -0.3827, 0.3827, 0.9239) * sp;
      float sr = length(p);

      float camDist = 14.0;
      float inc = 0.095;
      float fovScale = 0.189;
      float sInc = sin(inc), cInc = cos(inc);
      vec3 camPos = vec3(0.0, camDist * sInc, camDist * cInc);
      vec3 fwd = vec3(0.0, -sInc, -cInc);
      vec3 right = vec3(1.0, 0.0, 0.0);
      vec3 up = vec3(0.0, cInc, -sInc);
      vec3 initVel = normalize(fwd + p.x * fovScale * right + p.y * fovScale * up);

      vec3 hVec = cross(camPos, initVel);
      float h2 = dot(hVec, hVec);

      vec3 pos = camPos;
      vec3 vel = initVel;
      vec3 fgAccum = vec3(0.0);
      float fgTransmit = 1.0;
      vec3 farAccum = vec3(0.0);
      float farTransmit = 1.0;
      bool hitHorizon = false;
      bool crossed = false;
      float bestY = 99.0;
      vec3 bestPos = pos;
      vec3 bestVel = vel;

      // Skip full geodesic integration in far-field corners outside 16.5 Schwarzschild radii.
      if (h2 <= 280.0) {
        for (int i = 0; i < 48; i++) {
          float r2 = dot(pos, pos);
          float r = sqrt(r2);
          if (r < 1.04) { hitHorizon = true; break; }
          if (r > 24.0 && dot(pos, vel) > 0.0) break;
          if (abs(pos.y) < bestY && r < 16.2) { bestY = abs(pos.y); bestPos = pos; bestVel = vel; }

          float speed = length(vel);
          float dt = clamp(r * 0.25 / max(speed, 0.55), 0.085, 2.20);

          float invR = 1.0 / max(r, 0.25);
          float invR5 = invR * invR * invR * invR * invR;
          vec3 acc = -1.5 * h2 * pos * invR5;
          vec3 npos = pos + vel * dt + 0.5 * acc * dt * dt;

          if (pos.y * npos.y <= 0.0) {
            float f = abs(pos.y) / (abs(pos.y) + abs(npos.y) + 0.00001);
            vec3 hit = pos + (npos - pos) * f;
            if (hit.z > 0.0) {
              if (fgTransmit > 0.02) {
                vec4 fgSample = evalDisk(hit, vel, 1.0);
                if (fgSample.a > 0.002) {
                  crossed = true;
                  fgAccum += fgTransmit * fgSample.rgb;
                  fgTransmit *= (1.0 - fgSample.a);
                }
              }
            } else if (farTransmit > 0.02) {
              float farScale = mix(0.62, 1.0, smoothstep(0.18, -0.18, vel.y));
              vec4 farSample = evalDisk(hit, vel, farScale);
              if (farSample.a > 0.002) {
                crossed = true;
                farAccum += farTransmit * farSample.rgb;
                farTransmit *= (1.0 - farSample.a);
              }
            }
          }

          float nr = length(npos);
          float invNR = 1.0 / max(nr, 0.25);
          float invNR5 = invNR * invNR * invNR * invNR * invNR;
          vec3 nacc = -1.5 * h2 * npos * invNR5;
          vel += 0.5 * (acc + nacc) * dt;
          pos = npos;
        }
      }

      // Soft volumetric wispy halo for grazing rays skimming the sweeping left tail without crossing y = 0.
      if (!crossed && !hitHorizon && bestY < 0.52 && bestPos.x < -0.5 && fgTransmit > 0.05) {
        float wingFeather = exp(-bestY * bestY * 9.5) * 0.42;
        vec4 tailSample = evalDisk(vec3(bestPos.x, 0.0, bestPos.z), bestVel, wingFeather);
        fgAccum += fgTransmit * tailSample.rgb;
        fgTransmit *= (1.0 - tailSample.a);
      }

      vec3 bg;
      if (hitHorizon) {
        farAccum = vec3(0.0);
        farTransmit = 1.0;
        float dome = exp(-length((p - vec2(-0.46, -0.26)) * 1.38));
        float rimHaze = smoothstep(0.55, 1.0, sr);
        bg = mix(vec3(0.014, 0.009, 0.014), vec3(0.052, 0.032, 0.042), clamp(dome * 0.65 + rimHaze * 0.35, 0.0, 1.0));
      } else {
        vec2 dP = vec2(0.0);
        if (sr < 4.4 && h2 <= 280.0) {
          vec3 deflect = normalize(vel) - initVel;
          dP = vec2(dot(deflect, right), dot(deflect, up)) / fovScale;
          // Refined astronomical gravitational bend without over-stretching nearby nebulae into rings.
          dP = (dP / (1.0 + length(dP) * 0.45)) * 0.42 * (1.0 - smoothstep(1.8, 4.4, sr));
        }
        vec2 dSp = mat2(0.9239, 0.3827, -0.3827, 0.9239) * dP;
        vec2 lensedUv = vUv + dSp * uRadius / uSize;
        bg = sky(lensedUv);
        // Delicate Einstein-ring background magnification hugging the photon sphere.
        float einsteinBand = exp(-max(sr - 1.015, 0.0) * 6.0) * smoothstep(0.99, 1.04, sr);
        bg *= (1.0 + 0.22 * einsteinBand);
      }

      // Delicate warm ivory-gold inner photon ring hugging the shadow rim behind the foreground sheet.
      float pw = max(0.0045, 0.85 / max(uRadius, 1.0));
      float pr = (sr - 1.003) / pw;
      float pRing = exp(-pr * pr);
      float rimGlow = exp(-max(sr - 1.003, 0.0) * 24.0) * step(0.995, sr);
      float ringAsym = 0.42 + 0.68 * smoothstep(0.65, -0.85, p.x);
      vec3 photonCol = vec3(1.00, 0.91, 0.78);
      vec3 photon = photonCol * (pRing * 0.62 + rimGlow * 0.14) * ringAsym * mix(0.24, 1.0, fgTransmit);

      // Soft champagne shoulder bloom + restrained dusty sepia-rose atmospheric scatter.
      vec3 shoulderBloom = vec3(0.88, 0.66, 0.50) * exp(-length((p - vec2(-1.26, -0.04)) * vec2(0.72, 1.25)) * 1.40) * 0.24;
      vec3 ringAtmosphere = vec3(0.46, 0.22, 0.22) * exp(-abs(sr - 1.38) * 2.05) * (0.08 + 0.14 * smoothstep(0.3, -1.0, p.x));

      vec3 behindFg = bg * farTransmit + farAccum + photon;
      vec3 raw = behindFg * fgTransmit + fgAccum + shoulderBloom + ringAtmosphere;
      vec3 mapped = acesFilmic(raw);
      gl_FragColor = vec4(mapped, 1.0);
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
    galaxy([compact ? 1.3 : 1.4, compact ? -1.8 : 2.2, -3.5, .065], [.78, -.45], 2.2, compact ? 1250 : 2850, 4);
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
    point([0, 0, 0], [compact ? 3.4 : 5.7, compact ? -1.4 : -3.85, 4.7, 0], [-.26, .94], [.37, .49, .57, 1], compact ? 38 : 56, 5);
    point([0, 0, 0], [compact ? -1.15 : -6.18, compact ? -3.72 : 2.73, 6.5, 0], [.58, .8], [.56, .49, .43, 1], compact ? 10 : 17, 3);
    counts.worlds = 2;
    return { data: new Float32Array(particles), opaqueOffset, counts };
  }

  function mountUniverse(host) {
    const canvas = host.querySelector('canvas');
    const fallbackVideo = host.querySelector('video');
    let gl;
    function acquireContext() {
      try {
        return canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
      } catch { return null; }
    }

    const controller = new AbortController();
    const { signal } = controller;
    const art = host.closest('.orbit-hero') || host.closest('.orbit-art') || host;
    let compact = (window.innerWidth || host.clientWidth) < 769;
    let geometry;
    const pointer = [0, 0];
    const target = [0, 0];
    let program;
    let buffer;
    let uniforms;
    let lensProgram, quad, skyTexture, framebuffer, lensUniforms, corner;
    let attributes = [];
    let frame = 0;
    let visible = !('IntersectionObserver' in window);
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
    const sceneIsActive = () => visible && !document.hidden;
    const canAnimate = () => !disposed && !lost && sceneIsActive() && !posterOnly;

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
      if (!program || lost || disposed) return;
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
      gl.uniform2f(lensUniforms.uCenter,narrow ? .78 : .77,narrow ? .66 : .58);
      gl.uniform1f(lensUniforms.uRadius,Math.min(width*(narrow ? .21 : .168),height*(narrow ? .19 : .31)));
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
        sync();
      } else {
        qualityLevel++;
        resize();
      }
      return true;
    }
    function tick(now) {
      frame = 0;
      if (!canAnimate()) { previous = 0; return; }
      if (previous) elapsed += (now - previous) / 1000;
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
    function syncFallback() {
      if (!fallbackVideo) return;
      if (!sceneIsActive() || host.dataset.universeReady === 'true') {
        if (!fallbackVideo.paused) fallbackVideo.pause();
        return;
      }
      const narrow = (window.innerWidth || host.clientWidth) < 769;
      const source = '/images/atlas-horizon-' + (narrow ? 'compact' : 'wide') + '.mp4';
      if (fallbackVideo.getAttribute('src') !== source) {
        delete fallbackVideo.dataset.ready;
        fallbackVideo.muted = true;
        fallbackVideo.src = source;
      }
      if (fallbackVideo.paused) fallbackVideo.play().catch(() => {});
    }
    function sync() {
      syncFallback();
      host.dataset.sceneActive = String(sceneIsActive());
      if (canAnimate() && program && !frame) frame = requestAnimationFrame(tick);
      else if (!canAnimate() || !program) { cancelAnimationFrame(frame); frame = 0; previous = 0; resetSampleWindow(); }
    }
    function resize() {
      resetSampleWindow();
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      const narrow = (window.innerWidth || width) < 769;
      if (compact !== narrow) {
        compact = narrow;
        geometry = null;
        if (program && !lost && !posterOnly) {
          geometry = createParticles(compact);
          gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
          gl.bufferData(gl.ARRAY_BUFFER,geometry.data,gl.STATIC_DRAW);
        }
      }
      // A panoramic canvas should not multiply GPU cost on high-density 4K displays.
      pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5, Math.sqrt(1600000 / (width * height))) * resolutionScales[qualityLevel];
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      if (!program || lost || posterOnly) return;
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

    function start() {
      if (!lost && !posterOnly) {
        gl ||= acquireContext();
        if (gl && (program || setup())) resize();
      }
      sync();
    }

    fallbackVideo?.addEventListener('playing', () => { fallbackVideo.dataset.ready = ''; }, { signal });
    fallbackVideo?.addEventListener('error', () => { delete fallbackVideo.dataset.ready; }, { signal });
    window.matchMedia?.('(max-width: 768px)').addEventListener?.('change', syncFallback, { signal });
    const sizeObserver = canvas ? new ResizeObserver(resize) : null;
    sizeObserver?.observe(host);
    const viewObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      host.dataset.universeVisible = String(visible);
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
    canvas?.addEventListener('webglcontextlost', event => {
      event.preventDefault(); lost = true; delete host.dataset.universeReady; sync();
    }, { signal });
    canvas?.addEventListener('webglcontextrestored', () => {
      lost = false;
      release(); start();
    }, { signal });
    if (canvas) start();
    else sync();
    return () => {
      disposed = true;
      if (fallbackVideo && !fallbackVideo.paused) fallbackVideo.pause();
      cancelAnimationFrame(frame);
      controller.abort();
      sizeObserver?.disconnect();
      viewObserver?.disconnect();
      delete host.dataset.sceneActive;
      delete host.dataset.universeQuality;
      delete host.dataset.universeVisible;
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
