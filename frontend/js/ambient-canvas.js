/**
 * AmbientMotionCanvas Singleton
 * High-Performance 60fps HTML5 Canvas Kinetic Motion Engine
 * Generates living, moving thematic backdrops for each design system mode:
 * - Higgsfield: 3D traveling deep space cosmic starfield & drifting aurora nebula
 * - Vanguard: 3D perspective cyber grid warp & streaming data vectors
 * - Telemetry: 360° tactical avionics radar PPI sweep with phosphor target blips
 * - Editorial: Floating archival paper dust motes & subtle ambient architectural light
 */

export class AmbientMotionCanvas {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.animId = null;
    this.lastTime = 0;
    this.currentTheme = 'higgsfield';
    this.isRunning = false;

    // Simulation states
    this.stars = [];
    this.nebulae = [];
    this.cyberGridLines = [];
    this.cyberStreams = [];
    this.radarAngle = 0;
    this.radarBlips = [];
    this.editorialMotes = [];

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.#init();
    }
  }

  #init() {
    // Check reduced motion preference
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
      if (this.reducedMotion) {
        this.pause();
      } else {
        this.resume();
      }
    });

    this.#initDom();
    this.#updateTheme();
    this.#resize();
    this.#initParticles();

    // Event listeners
    window.addEventListener('resize', () => this.#resize(), { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else if (!this.reducedMotion) {
        this.resume();
      }
    });

    // Theme mutation observer
    const themeObserver = new MutationObserver(() => {
      this.#updateTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    if (!this.reducedMotion) {
      this.resume();
    }
  }

  #initDom() {
    let el = document.getElementById('ambient-canvas');
    if (!el) {
      el = document.createElement('canvas');
      el.id = 'ambient-canvas';
      el.className = 'ambient-motion-canvas';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;opacity:0.95;transition:opacity 0.6s ease;';

      if (document.body) {
        document.body.prepend(el);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (!document.getElementById('ambient-canvas')) {
            document.body.prepend(el);
          }
        }, { once: true });
      }
    }
    this.canvas = el;
    this.ctx = el.getContext('2d', { alpha: true });
  }

  #updateTheme() {
    const theme = document.documentElement.getAttribute('data-theme') || 'higgsfield';
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      this.#initParticles();
    }
  }

  #resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  #initParticles() {
    const w = this.width || 1200;
    const h = this.height || 800;

    // 1. Higgsfield Particles
    if (this.currentTheme === 'higgsfield') {
      this.stars = [];
      const starCount = 85;
      for (let i = 0; i < starCount; i++) {
        this.stars.push({
          x: (Math.random() - 0.5) * w * 1.5,
          y: (Math.random() - 0.5) * h * 1.5,
          z: Math.random() * w,
          prevZ: 0,
          colorType: Math.random(),
          size: Math.random() * 1.4 + 0.6,
          twinkleSpeed: Math.random() * 0.04 + 0.01,
          twinkleOffset: Math.random() * Math.PI * 2
        });
      }

      this.nebulae = [
        { x: w * 0.25, y: h * 0.3, radius: w * 0.35, vx: 0.15, vy: 0.08, color: 'rgba(139, 92, 246, 0.05)' },
        { x: w * 0.75, y: h * 0.6, radius: w * 0.4, vx: -0.12, vy: -0.1, color: 'rgba(6, 182, 212, 0.04)' }
      ];
    }

    // 2. Vanguard Particles
    if (this.currentTheme === 'vanguard') {
      this.cyberGridLines = [];
      const lineCount = 14;
      for (let i = 0; i < lineCount; i++) {
        this.cyberGridLines.push({
          progress: i / lineCount
        });
      }

      this.cyberStreams = [];
      const streamCount = 28;
      for (let i = 0; i < streamCount; i++) {
        this.cyberStreams.push({
          lane: (Math.random() - 0.5) * 1.2,
          progress: Math.random(),
          speed: Math.random() * 0.006 + 0.003,
          length: Math.random() * 0.15 + 0.05,
          color: Math.random() > 0.4 ? 'rgba(6, 182, 212,' : 'rgba(139, 92, 246,'
        });
      }
    }

    // 3. Telemetry Radar Blips
    if (this.currentTheme === 'telemetry') {
      this.radarAngle = 0;
      this.radarBlips = [
        { distRatio: 0.28, angle: 0.4, label: 'TRG-01', intensity: 0.2 },
        { distRatio: 0.52, angle: 1.8, label: 'EVA-09', intensity: 0.2 },
        { distRatio: 0.74, angle: 3.2, label: 'SAT-CANON', intensity: 0.2 },
        { distRatio: 0.38, angle: 4.5, label: 'NODE-X', intensity: 0.2 },
        { distRatio: 0.82, angle: 5.6, label: 'TAC-44', intensity: 0.2 }
      ];
    }

    // 4. Editorial Archival Motes
    if (this.currentTheme === 'editorial') {
      this.editorialMotes = [];
      const moteCount = 38;
      for (let i = 0; i < moteCount; i++) {
        this.editorialMotes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: Math.random() * 1.5 + 0.5,
          vx: (Math.random() - 0.5) * 0.2,
          vy: -(Math.random() * 0.25 + 0.08),
          alpha: Math.random() * 0.18 + 0.05,
          pulseSpeed: Math.random() * 0.02 + 0.005,
          pulseOffset: Math.random() * Math.PI * 2
        });
      }
    }
  }

  resume() {
    if (this.isRunning || this.reducedMotion) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.isRunning) return;
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.#render(now, dt);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  pause() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  #render(now, dt) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    switch (this.currentTheme) {
      case 'higgsfield':
        this.#renderHiggsfield(ctx, now, dt, w, h);
        break;
      case 'vanguard':
        this.#renderVanguard(ctx, now, dt, w, h);
        break;
      case 'telemetry':
        this.#renderTelemetry(ctx, now, dt, w, h);
        break;
      case 'editorial':
        this.#renderEditorial(ctx, now, dt, w, h);
        break;
      default:
        this.#renderHiggsfield(ctx, now, dt, w, h);
    }
  }

  // --------------------------------------------------------------------------
  // 1. HIGGSFIELD: Traveling Cosmic Starfield & Ambient Aurora Nebula
  // --------------------------------------------------------------------------
  #renderHiggsfield(ctx, now, dt, w, h) {
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Drifting soft nebula clouds
    for (const neb of this.nebulae) {
      neb.x += neb.vx;
      neb.y += neb.vy;
      if (neb.x < 0 || neb.x > w) neb.vx *= -1;
      if (neb.y < 0 || neb.y > h) neb.vy *= -1;

      const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
      grad.addColorStop(0, neb.color);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3D Traveling starfield
    const speed = 65 * dt;
    for (const star of this.stars) {
      star.prevZ = star.z;
      star.z -= speed;

      if (star.z <= 0) {
        star.z = w;
        star.prevZ = w;
        star.x = (Math.random() - 0.5) * w * 1.5;
        star.y = (Math.random() - 0.5) * h * 1.5;
      }

      const k = 250 / star.z;
      const px = cx + star.x * k;
      const py = cy + star.y * k;

      if (px < -10 || px > w + 10 || py < -10 || py > h + 10) {
        star.z = w;
        star.prevZ = w;
        continue;
      }

      const prevK = 250 / star.prevZ;
      const prevPx = cx + star.x * prevK;
      const prevPy = cy + star.y * prevK;

      const depthRatio = Math.max(0, 1 - star.z / w);
      const twinkle = 0.5 + 0.5 * Math.sin(now * star.twinkleSpeed + star.twinkleOffset);
      const alpha = Math.min(1, depthRatio * 1.2 * twinkle);

      ctx.beginPath();
      ctx.moveTo(prevPx, prevPy);
      ctx.lineTo(px, py);

      if (star.colorType < 0.25) {
        ctx.strokeStyle = `rgba(167, 139, 250, ${alpha * 0.9})`; // Violet
      } else if (star.colorType < 0.45) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.85})`; // Cyan
      } else {
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`; // Starlight White
      }

      ctx.lineWidth = star.size * (0.8 + depthRatio * 1.2);
      ctx.stroke();
    }
  }

  // --------------------------------------------------------------------------
  // 2. VANGUARD: 3D Perspective Cyber Grid Warp & Digital Stream Vectors
  // --------------------------------------------------------------------------
  #renderVanguard(ctx, now, dt, w, h) {
    const horizon = h * 0.38;
    const vpX = w * 0.5;

    // Moving horizontal grid lines
    const lineSpeed = 0.18 * dt;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.16)';
    ctx.lineWidth = 1;

    for (const line of this.cyberGridLines) {
      line.progress += lineSpeed;
      if (line.progress >= 1) line.progress -= 1;

      // Exponential perspective curve
      const y = horizon + Math.pow(line.progress, 2.8) * (h - horizon);
      const alpha = Math.sin(line.progress * Math.PI) * 0.35;

      ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Perspective ray lines radiating from horizon
    const rayCount = 18;
    for (let i = -rayCount / 2; i <= rayCount / 2; i++) {
      const spreadX = vpX + (i / (rayCount / 2)) * w * 0.9;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.beginPath();
      ctx.moveTo(vpX, horizon);
      ctx.lineTo(spreadX, h);
      ctx.stroke();
    }

    // Streaming cyber data packets
    for (const stream of this.cyberStreams) {
      stream.progress += stream.speed * 60 * dt;
      if (stream.progress >= 1) {
        stream.progress = 0;
        stream.lane = (Math.random() - 0.5) * 1.3;
      }

      const p1 = stream.progress;
      const p2 = Math.min(1, stream.progress + stream.length);

      const y1 = horizon + Math.pow(p1, 2.8) * (h - horizon);
      const x1 = vpX + stream.lane * (w * 0.6) * Math.pow(p1, 1.8);

      const y2 = horizon + Math.pow(p2, 2.8) * (h - horizon);
      const x2 = vpX + stream.lane * (w * 0.6) * Math.pow(p2, 1.8);

      const alpha = Math.sin(stream.progress * Math.PI) * 0.7;
      ctx.strokeStyle = `${stream.color} ${alpha})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // --------------------------------------------------------------------------
  // 3. TELEMETRY: 360° Tactical Radar Sweep PPI & Phosphor Blips
  // --------------------------------------------------------------------------
  #renderTelemetry(ctx, now, dt, w, h) {
    const rx = w * 0.5;
    const ry = h * 0.45;
    const maxRadius = Math.max(w, h) * 0.65;

    // Rotate sweep
    const sweepSpeed = 0.95 * dt; // Full 360 turn in ~6.6 seconds
    this.radarAngle = (this.radarAngle + sweepSpeed) % (Math.PI * 2);

    // Faint concentric range rings
    ctx.strokeStyle = 'rgba(230, 25, 25, 0.07)';
    ctx.lineWidth = 1;
    for (let r = 0.25; r <= 1; r += 0.25) {
      ctx.beginPath();
      ctx.arc(rx, ry, maxRadius * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Radar coordinate crosshairs
    ctx.beginPath();
    ctx.moveTo(rx - maxRadius, ry);
    ctx.lineTo(rx + maxRadius, ry);
    ctx.moveTo(rx, ry - maxRadius);
    ctx.lineTo(rx, ry + maxRadius);
    ctx.stroke();

    // Radar sweep phosphor trail
    const tailAngle = 0.55; // ~31 degrees tail
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const a1 = this.radarAngle - (i / steps) * tailAngle;
      const a2 = this.radarAngle - ((i + 1) / steps) * tailAngle;
      const alpha = (1 - i / steps) * 0.14;

      ctx.fillStyle = `rgba(230, 25, 25, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, maxRadius, a2, a1);
      ctx.closePath();
      ctx.fill();
    }

    // High-visibility leading sweep beam
    ctx.strokeStyle = 'rgba(255, 70, 70, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + Math.cos(this.radarAngle) * maxRadius, ry + Math.sin(this.radarAngle) * maxRadius);
    ctx.stroke();

    // Tactical target blips
    for (const blip of this.radarBlips) {
      const bx = rx + Math.cos(blip.angle) * (maxRadius * blip.distRatio);
      const by = ry + Math.sin(blip.angle) * (maxRadius * blip.distRatio);

      // Check angular proximity to sweep line to trigger flash
      let diff = Math.abs(this.radarAngle - blip.angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;

      if (diff < 0.08) {
        blip.intensity = 1.0;
      } else {
        blip.intensity = Math.max(0.18, blip.intensity - 0.45 * dt);
      }

      const blipAlpha = blip.intensity;
      ctx.fillStyle = `rgba(255, 60, 60, ${blipAlpha})`;
      ctx.strokeStyle = `rgba(255, 60, 60, ${blipAlpha * 0.8})`;

      // Crosshair marker
      const s = 4;
      ctx.beginPath();
      ctx.moveTo(bx - s, by);
      ctx.lineTo(bx + s, by);
      ctx.moveTo(bx, by - s);
      ctx.lineTo(bx, by + s);
      ctx.stroke();

      // Echo ping ring if recently triggered
      if (blip.intensity > 0.6) {
        const ringR = (1 - blip.intensity) * 28;
        ctx.strokeStyle = `rgba(255, 80, 80, ${blip.intensity * 0.5})`;
        ctx.beginPath();
        ctx.arc(bx, by, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Small tactical label
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = `rgba(255, 100, 100, ${blipAlpha * 0.85})`;
      ctx.fillText(blip.label, bx + 6, by - 4);
    }
  }

  // --------------------------------------------------------------------------
  // 4. EDITORIAL: Subtle Floating Archival Dust Motes & Ambient Light Shift
  // --------------------------------------------------------------------------
  #renderEditorial(ctx, now, dt, w, h) {
    // Subtle architectural light ray
    const lightAngle = Math.sin(now * 0.0002) * 0.04;
    const grad = ctx.createLinearGradient(0, 0, w * (0.8 + lightAngle), h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.025)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.008)');
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Archival paper dust motes drifting upward with gentle brownian motion
    for (const mote of this.editorialMotes) {
      mote.x += (mote.vx + Math.sin(now * 0.001 + mote.pulseOffset) * 0.25) * 60 * dt;
      mote.y += mote.vy * 60 * dt;

      // Wrap around edges seamlessly
      if (mote.y < -10) mote.y = h + 10;
      if (mote.x < -10) mote.x = w + 10;
      if (mote.x > w + 10) mote.x = -10;

      const pulse = 0.6 + 0.4 * Math.sin(now * mote.pulseSpeed + mote.pulseOffset);
      const alpha = mote.alpha * pulse;

      ctx.fillStyle = `rgba(244, 244, 245, ${alpha})`;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Auto-initialize browser singleton
export const ambientCanvas = new AmbientMotionCanvas();
