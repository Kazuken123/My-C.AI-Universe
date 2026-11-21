/**
 * AmbientMotionCanvas Singleton
 * High-Performance 60fps HTML5 Canvas Kinetic Motion Engine
 * - Higgsfield: Dynamic traveling starfield, undulating chromatic aurora waves & shooting stars
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

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.#init();
    }
  }

  #init() {
    // Keep ambient motion active in browser even when OS animations are turned off.
    this.reducedMotion = false;
    try { localStorage.removeItem('ambient_motion_disabled'); } catch {}

    this.#initDom();
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

    this.resume();
  }

  // Compatibility for callers that toggle or force-start ambient motion.
  toggleMotion() { this.forceStart(); return true; }

  forceStart() {
    this.reducedMotion = false;
    try { localStorage.removeItem('ambient_motion_disabled'); } catch {}
    this.resume();
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

  resume() {
    if (this.isRunning || this.reducedMotion || document.hidden || !this.ctx) return;
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
    this.#renderHiggsfield(ctx, now, dt, w, h);
  }

  // --------------------------------------------------------------------------
  // 1. HIGGSFIELD (GETLAYERS CINEMA): Traveling Starfield, Warm Peach & Periwinkle Ribbons
  // --------------------------------------------------------------------------
  #renderHiggsfield(ctx, now, dt, w, h) {
    this.auroraPhase += 0.45 * dt;

    // A. Undulating GetLayers Cinema Volumetric Light Ribbons
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
        grad.addColorStop(0, 'rgba(178, 148, 250, 0.14)');
        grad.addColorStop(0.5, 'rgba(207, 186, 255, 0.06)');
        grad.addColorStop(1, 'transparent');
      } else if (b === 1) {
        grad.addColorStop(0, 'rgba(115, 186, 236, 0.11)');
        grad.addColorStop(0.6, 'rgba(232, 234, 239, 0.05)');
        grad.addColorStop(1, 'transparent');
      } else {
        grad.addColorStop(0, 'rgba(178, 148, 250, 0.08)');
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
          const linkAlpha = (1 - Math.sqrt(distSq) / 75) * 0.16;
          ctx.strokeStyle = `rgba(178, 148, 250, ${linkAlpha})`;
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
        color = `rgba(178, 148, 250, ${alpha})`; // Nebula Violet
      } else if (star.colorType < 0.5) {
        color = `rgba(115, 186, 236, ${alpha})`; // Starlight Blue
      } else {
        color = `rgba(232, 234, 239, ${alpha})`; // Platinum Chrome
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();

      // Subtle halo for larger stars
      if (star.size > 1.8) {
        ctx.fillStyle = `rgba(178, 148, 250, ${alpha * 0.22})`;
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
      grad.addColorStop(0.3, `rgba(178, 148, 250, ${alpha * 0.8})`);
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
}

// Auto-initialize browser singleton
export const ambientCanvas = new AmbientMotionCanvas();
if (typeof window !== 'undefined') {
  window.ambientCanvas = ambientCanvas;
}
