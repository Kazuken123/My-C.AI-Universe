/**
 * AmbientMotionCanvas Singleton
 * High-Performance 60fps HTML5 Canvas Kinetic Motion Engine
 * Delivers living, kinetic thematic backdrops for all design modes:
 * - Higgsfield: Dynamic traveling starfield, undulating chromatic aurora waves & shooting stars
 * - Vanguard: 3D perspective cyber grid warp, streaming data packets & pulse ripples
 * - Telemetry: 360° tactical avionics radar PPI beam sweep with phosphor blip echoes & scanline
 * - Editorial: Volumetric ambient architectural light ray & drifting archival dust motes
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
    this.shootingStars = [];
    this.shootingStarCooldown = 2.5;
    this.auroraPhase = 0;

    this.cyberGridProgress = 0;
    this.cyberStreams = [];
    this.cyberRipples = [];

    this.radarAngle = 0;
    this.radarBlips = [];
    this.radarScanY = 0;

    this.editorialMotes = [];

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.#init();
    }
  }

  #init() {
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

    window.addEventListener('resize', () => {
      this.#resize();
      this.#initParticles();
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
      } else if (!this.reducedMotion) {
        this.resume();
      }
    });

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
      el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;display:block;';

      if (document.body) {
        document.body.prepend(el);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (!document.getElementById('ambient-canvas')) {
            document.body.prepend(el);
          }
          this.#resize();
        }, { once: true });
      }
    } else {
      el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0;display:block;';
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
    this.width = window.innerWidth || 1200;
    this.height = window.innerHeight || 800;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  #initParticles() {
    const w = this.width || 1200;
    const h = this.height || 800;

    // 1. HIGGSFIELD
    if (this.currentTheme === 'higgsfield') {
      this.stars = [];
      const starCount = 135;
      for (let i = 0; i < starCount; i++) {
        this.stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.4 + 0.25, // Gentle rightward drift
          vy: (Math.random() - 0.5) * 0.3 - 0.2, // Gentle upward drift
          size: Math.random() * 1.8 + 0.8,
          baseAlpha: Math.random() * 0.45 + 0.4,
          twinkleSpeed: Math.random() * 0.03 + 0.015,
          twinkleOffset: Math.random() * Math.PI * 2,
          colorType: Math.random()
        });
      }
      this.shootingStars = [];
      this.shootingStarCooldown = 1.5;
    }

    // 2. VANGUARD
    if (this.currentTheme === 'vanguard') {
      this.cyberStreams = [];
      const streamCount = 34;
      for (let i = 0; i < streamCount; i++) {
        this.cyberStreams.push({
          lane: (Math.random() - 0.5) * 1.4,
          progress: Math.random(),
          speed: Math.random() * 0.007 + 0.004,
          length: Math.random() * 0.18 + 0.06,
          color: Math.random() > 0.35 ? '#06b6d4' : '#8b5cf6'
        });
      }
      this.cyberRipples = [
        { progress: 0.1, maxRadius: Math.max(w, h) * 0.7, speed: 0.12 },
        { progress: 0.6, maxRadius: Math.max(w, h) * 0.7, speed: 0.12 }
      ];
    }

    // 3. TELEMETRY
    if (this.currentTheme === 'telemetry') {
      this.radarAngle = 0;
      this.radarScanY = 0;
      this.radarBlips = [
        { xRatio: 0.18, yRatio: 0.22, label: 'TRG-01', intensity: 0.8 },
        { xRatio: 0.84, yRatio: 0.28, label: 'SAT-CANON', intensity: 0.3 },
        { xRatio: 0.92, yRatio: 0.68, label: 'NODE-X', intensity: 0.5 },
        { xRatio: 0.14, yRatio: 0.78, label: 'EVA-09', intensity: 0.2 },
        { xRatio: 0.78, yRatio: 0.88, label: 'TAC-44', intensity: 0.7 },
        { xRatio: 0.28, yRatio: 0.48, label: 'ALPHA-9', intensity: 0.4 }
      ];
    }

    // 4. EDITORIAL
    if (this.currentTheme === 'editorial') {
      this.editorialMotes = [];
      const moteCount = 75;
      for (let i = 0; i < moteCount; i++) {
        this.editorialMotes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: Math.random() * 1.6 + 0.7,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -(Math.random() * 0.5 + 0.2), // Distinct upward drift
          alpha: Math.random() * 0.35 + 0.25,
          pulseSpeed: Math.random() * 0.025 + 0.01,
          pulseOffset: Math.random() * Math.PI * 2,
          isWarm: Math.random() > 0.6
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
  // 1. HIGGSFIELD: Dynamic Traveling Starfield, Undulating Aurora Plasma & Streamers
  // --------------------------------------------------------------------------
  #renderHiggsfield(ctx, now, dt, w, h) {
    this.auroraPhase += 0.45 * dt;

    // A. Undulating Chromatic Aurora Plasma Bands
    const bandCount = 3;
    for (let b = 0; b < bandCount; b++) {
      const yOffset = h * (0.15 + b * 0.35);
      const wavePhase = this.auroraPhase * (0.8 + b * 0.4);
      const amplitude = 45 + b * 25;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, yOffset);

      for (let x = 0; x <= w; x += 40) {
        const wave = Math.sin(x * 0.003 + wavePhase) * amplitude +
                     Math.cos(x * 0.006 - wavePhase * 0.8) * (amplitude * 0.4);
        ctx.lineTo(x, yOffset + wave);
      }

      ctx.lineTo(w, h);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, yOffset - 40, 0, yOffset + 240);
      if (b === 0) {
        grad.addColorStop(0, 'rgba(139, 92, 246, 0.16)');
        grad.addColorStop(0.5, 'rgba(99, 102, 241, 0.08)');
        grad.addColorStop(1, 'transparent');
      } else if (b === 1) {
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.13)');
        grad.addColorStop(0.6, 'rgba(139, 92, 246, 0.06)');
        grad.addColorStop(1, 'transparent');
      } else {
        grad.addColorStop(0, 'rgba(168, 85, 247, 0.1)');
        grad.addColorStop(1, 'transparent');
      }

      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    // B. Viewport Traveling Starfield with Constellation Links
    const speedMultiplier = 60 * dt;
    const len = this.stars.length;

    // Draw constellation links when stars are close
    ctx.lineWidth = 0.8;
    for (let i = 0; i < len; i += 2) {
      for (let j = i + 1; j < Math.min(i + 5, len); j++) {
        const dx = this.stars[i].x - this.stars[j].x;
        const dy = this.stars[i].y - this.stars[j].y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 5625) { // < 75px
          const linkAlpha = (1 - Math.sqrt(distSq) / 75) * 0.18;
          ctx.strokeStyle = `rgba(167, 139, 250, ${linkAlpha})`;
          ctx.beginPath();
          ctx.moveTo(this.stars[i].x, this.stars[i].y);
          ctx.lineTo(this.stars[j].x, this.stars[j].y);
          ctx.stroke();
        }
      }
    }

    // Move & draw stars
    for (const star of this.stars) {
      star.x += star.vx * speedMultiplier;
      star.y += star.vy * speedMultiplier;

      // Wrap around edges seamlessly
      if (star.x < 0) star.x = w;
      if (star.x > w) star.x = 0;
      if (star.y < 0) star.y = h;
      if (star.y > h) star.y = 0;

      const twinkle = 0.65 + 0.35 * Math.sin(now * star.twinkleSpeed + star.twinkleOffset);
      const alpha = star.baseAlpha * twinkle;

      let color;
      if (star.colorType < 0.25) {
        color = `rgba(167, 139, 250, ${alpha})`; // Violet
      } else if (star.colorType < 0.5) {
        color = `rgba(56, 189, 248, ${alpha})`; // Cyan
      } else {
        color = `rgba(255, 255, 255, ${alpha})`; // Pure starlight
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();

      // Subtle halo for larger stars
      if (star.size > 1.8) {
        ctx.fillStyle = `rgba(139, 92, 246, ${alpha * 0.25})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // C. Cosmic Shooting Stars / Streamers
    this.shootingStarCooldown -= dt;
    if (this.shootingStarCooldown <= 0) {
      this.shootingStarCooldown = Math.random() * 3 + 2.5; // Spawn every 2.5 - 5.5s
      const startX = Math.random() * w * 0.9;
      const startY = Math.random() * h * 0.4;
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.3; // ~45 degrees diagonal
      this.shootingStars.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * (w * 0.45 + 300),
        vy: Math.sin(angle) * (w * 0.45 + 300),
        length: Math.random() * 120 + 80,
        life: 0,
        maxLife: Math.random() * 0.6 + 0.6
      });
    }

    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      s.life += dt;
      s.x += (s.vx / s.maxLife) * dt;
      s.y += (s.vy / s.maxLife) * dt;

      const progress = s.life / s.maxLife;
      if (progress >= 1) {
        this.shootingStars.splice(i, 1);
        continue;
      }

      const alpha = Math.sin(progress * Math.PI) * 0.85;
      const headX = s.x;
      const headY = s.y;
      const tailX = s.x - (s.vx / s.maxLife) * (s.length / (w * 0.5));
      const tailY = s.y - (s.vy / s.maxLife) * (s.length / (w * 0.5));

      const grad = ctx.createLinearGradient(headX, headY, tailX, tailY);
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(0.3, `rgba(167, 139, 250, ${alpha * 0.8})`);
      grad.addColorStop(1, 'transparent');

      ctx.lineWidth = 2.2;
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();

      // Glowing star head
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(headX, headY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --------------------------------------------------------------------------
  // 2. VANGUARD: 3D Perspective Cyber-Grid Warp, High-Speed Streams & Sonar Rings
  // --------------------------------------------------------------------------
  #renderVanguard(ctx, now, dt, w, h) {
    const horizon = h * 0.35;
    const vpX = w * 0.5;

    // A. Perspective Cyber Grid Floor
    this.cyberGridProgress = (this.cyberGridProgress + 0.28 * dt) % 1;
    const gridLineCount = 18;

    for (let i = 0; i < gridLineCount; i++) {
      const prog = (i / gridLineCount + this.cyberGridProgress) % 1;
      const y = horizon + Math.pow(prog, 2.6) * (h - horizon);
      const alpha = Math.sin(prog * Math.PI) * 0.32;

      ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
      ctx.lineWidth = 1 + prog * 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Perspective ray lines radiating outward
    const rayCount = 22;
    for (let i = -rayCount / 2; i <= rayCount / 2; i++) {
      const spreadX = vpX + (i / (rayCount / 2)) * w * 1.1;
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(vpX, horizon);
      ctx.lineTo(spreadX, h);
      ctx.stroke();
    }

    // B. High-Speed Digital Data Packets
    for (const stream of this.cyberStreams) {
      stream.progress += stream.speed * 60 * dt;
      if (stream.progress >= 1) {
        stream.progress = 0;
        stream.lane = (Math.random() - 0.5) * 1.4;
      }

      const p1 = stream.progress;
      const p2 = Math.min(1, stream.progress + stream.length);

      const y1 = horizon + Math.pow(p1, 2.6) * (h - horizon);
      const x1 = vpX + stream.lane * (w * 0.65) * Math.pow(p1, 1.6);

      const y2 = horizon + Math.pow(p2, 2.6) * (h - horizon);
      const x2 = vpX + stream.lane * (w * 0.65) * Math.pow(p2, 1.6);

      const alpha = Math.sin(stream.progress * Math.PI) * 0.85;
      ctx.strokeStyle = stream.color === '#06b6d4'
        ? `rgba(6, 182, 212, ${alpha})`
        : `rgba(168, 85, 247, ${alpha})`;

      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Glowing data head
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x2, y2, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // C. Concentric Cybernetic Sonar Rings
    for (const ripple of this.cyberRipples) {
      ripple.progress = (ripple.progress + ripple.speed * dt) % 1;
      const radius = ripple.progress * ripple.maxRadius;
      const alpha = Math.sin((1 - ripple.progress) * Math.PI * 0.5) * 0.22;

      ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(vpX, horizon + 50, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --------------------------------------------------------------------------
  // 3. TELEMETRY: 360° Tactical Military PPI Radar Sweep & Phosphor Blips
  // --------------------------------------------------------------------------
  #renderTelemetry(ctx, now, dt, w, h) {
    const rx = w * 0.5;
    const ry = h * 0.45;
    const maxRadius = Math.max(w, h) * 0.72;

    // Rotate sweep: 1 full turn every 4 seconds
    const sweepSpeed = (Math.PI * 2 / 4) * dt;
    this.radarAngle = (this.radarAngle + sweepSpeed) % (Math.PI * 2);

    // CRT Scanline bar
    this.radarScanY = (this.radarScanY + 140 * dt) % (h + 100);
    const scanBarY = this.radarScanY - 50;
    const scanGrad = ctx.createLinearGradient(0, scanBarY - 40, 0, scanBarY + 40);
    scanGrad.addColorStop(0, 'transparent');
    scanGrad.addColorStop(0.5, 'rgba(230, 25, 25, 0.08)');
    scanGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = scanGrad;
    ctx.fillRect(0, scanBarY - 40, w, 80);

    // Range rings
    ctx.strokeStyle = 'rgba(230, 25, 25, 0.12)';
    ctx.lineWidth = 1;
    for (let r = 0.2; r <= 1; r += 0.2) {
      ctx.beginPath();
      ctx.arc(rx, ry, maxRadius * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(rx - maxRadius, ry);
    ctx.lineTo(rx + maxRadius, ry);
    ctx.moveTo(rx, ry - maxRadius);
    ctx.lineTo(rx, ry + maxRadius);
    ctx.stroke();

    // Phosphor sweep fan
    const tailAngle = 0.65; // ~37 degrees
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const a1 = this.radarAngle - (i / steps) * tailAngle;
      const a2 = this.radarAngle - ((i + 1) / steps) * tailAngle;
      const alpha = Math.pow(1 - i / steps, 1.8) * 0.25;

      ctx.fillStyle = `rgba(230, 25, 25, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, maxRadius, a2, a1);
      ctx.closePath();
      ctx.fill();
    }

    // Leading sweep beam
    ctx.strokeStyle = 'rgba(255, 120, 120, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + Math.cos(this.radarAngle) * maxRadius, ry + Math.sin(this.radarAngle) * maxRadius);
    ctx.stroke();

    // Tactical Target Blips
    for (const blip of this.radarBlips) {
      const bx = blip.xRatio * w;
      const by = blip.yRatio * h;

      const blipAngle = Math.atan2(by - ry, bx - rx);
      let angleDiff = (this.radarAngle - blipAngle) % (Math.PI * 2);
      if (angleDiff < 0) angleDiff += Math.PI * 2;

      // Ping when swept
      if (angleDiff < 0.1) {
        blip.intensity = 1.0;
      } else {
        blip.intensity = Math.max(0.12, blip.intensity - 0.45 * dt);
      }

      const alpha = blip.intensity;

      // Outer ping echo ring
      if (alpha > 0.4) {
        ctx.strokeStyle = `rgba(230, 25, 25, ${(alpha - 0.4) * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, 14 * (1.5 - alpha * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Blip square
      ctx.fillStyle = `rgba(255, 60, 60, ${alpha})`;
      ctx.fillRect(bx - 3, by - 3, 6, 6);

      // Blip tag
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = `rgba(230, 25, 25, ${alpha * 0.85})`;
      ctx.fillText(blip.label, bx + 10, by + 3);
    }
  }

  // --------------------------------------------------------------------------
  // 4. EDITORIAL: Volumetric Ambient Architectural Light & Archival Dust Motes
  // --------------------------------------------------------------------------
  #renderEditorial(ctx, now, dt, w, h) {
    // A. Volumetric Architectural Light Ray
    const lightSway = Math.sin(now * 0.0006) * 0.08;
    const grad = ctx.createLinearGradient(0, 0, w * (0.85 + lightSway), h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.045)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.018)');
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // B. Floating Archival Dust Motes
    const speedMultiplier = 60 * dt;
    for (const mote of this.editorialMotes) {
      mote.x += (mote.vx + Math.sin(now * 0.001 + mote.pulseOffset) * 0.3) * speedMultiplier;
      mote.y += mote.vy * speedMultiplier;

      // Wrap around seamlessly
      if (mote.y < -15) mote.y = h + 15;
      if (mote.x < -15) mote.x = w + 15;
      if (mote.x > w + 15) mote.x = -15;

      const pulse = 0.65 + 0.35 * Math.sin(now * mote.pulseSpeed + mote.pulseOffset);
      const alpha = mote.alpha * pulse;

      ctx.fillStyle = mote.isWarm
        ? `rgba(251, 191, 36, ${alpha})` // Warm archival parchment gold
        : `rgba(244, 244, 245, ${alpha})`; // Crisp museum ivory

      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Auto-initialize browser singleton
export const ambientCanvas = new AmbientMotionCanvas();
