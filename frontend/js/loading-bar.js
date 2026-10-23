/**
 * TopLoadingBar Class (YouTube / GitHub / Next.js Style Top Loading Bar)
 * Engineered with emil-design-eng micro-interactions & tactile glow
 * Manages top page progress bar during page navigations, async API operations,
 * and initial document loading.
 */
export class TopLoadingBar {
  constructor() {
    this.status = null; // null when idle, 0.0 to 1.0 when active
    this.activeRequests = 0;
    this.trickleTimer = null;
    this.safetyTimeout = null;
    this.finishTimeout = null;
    this.resetTimeout = null;
    this.container = null;
    this.progressEl = null;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // Early Theme Hydration to prevent theme flash
      try {
        const savedTheme = localStorage.getItem('cai_skill_theme');
        if (savedTheme && document.documentElement.getAttribute('data-theme') !== savedTheme) {
          document.documentElement.setAttribute('data-theme', savedTheme);
        }
      } catch {}

      this.#initDom();
      this.#initListeners();

      // If document is still loading, start bar immediately for initial page boot
      if (document.readyState === 'loading') {
        this.start();
      }
    }
  }

  #initDom() {
    if (this.container && this.progressEl) return;
    let el = document.getElementById('top-loading-bar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'top-loading-bar';
      el.className = 'top-loading-bar';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `
        <div class="top-loading-bar-progress">
          <div class="top-loading-bar-peg"></div>
        </div>
      `;
      if (document.body) {
        document.body.prepend(el);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (!document.getElementById('top-loading-bar')) {
            document.body.prepend(el);
          }
        }, { once: true });
      }
    }
    this.container = el;
    this.progressEl = el.querySelector('.top-loading-bar-progress');
  }

  #getElements() {
    if (!this.container || !this.progressEl) {
      this.#initDom();
    }
    return { container: this.container, progress: this.progressEl };
  }

  /**
   * Check whether the loading bar is currently active
   */
  isStarted() {
    return this.status !== null;
  }

  /**
   * Start the progress bar or increment in-flight task counter.
   */
  start() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return this;

    this.activeRequests++;

    // Refresh safety timeout (auto-cleanup after 5s to prevent stuck bar)
    clearTimeout(this.safetyTimeout);
    this.safetyTimeout = setTimeout(() => {
      this.done(true);
    }, 5000);

    if (this.status !== null) {
      // Already running: gently advance if in early stages
      if (this.status < 0.65) {
        this.inc(0.04);
      }
      return this;
    }

    const { container, progress } = this.#getElements();
    if (!container || !progress) return this;

    clearTimeout(this.finishTimeout);
    clearTimeout(this.resetTimeout);
    clearInterval(this.trickleTimer);

    // Reset visually without transition
    container.classList.remove('is-finishing');
    progress.style.transition = 'none';
    progress.style.width = '0%';
    this.status = 0;

    // Force DOM layout reflow so the transition reset takes effect
    void container.offsetWidth;

    // Reveal and animate initial spring jump (~22%)
    container.classList.add('is-active');
    progress.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms cubic-bezier(0.22, 1, 0.36, 1)';
    this.set(0.22);

    // Auto-trickle forward smoothly
    this.trickleTimer = setInterval(() => {
      this.#trickle();
    }, 280);

    return this;
  }

  /**
   * Set explicit progress between 0.0 and 1.0 (or 0 to 100)
   */
  set(val) {
    if (typeof window === 'undefined') return this;

    let n = typeof val === 'number' ? val : 0;
    if (n > 1) n = n / 100;
    n = Math.max(0, Math.min(1, n));

    this.status = n;
    const { progress } = this.#getElements();
    if (progress) {
      progress.style.width = `${Math.round(n * 100)}%`;
    }
    return this;
  }

  /**
   * Increment progress with natural easing curves
   */
  inc(amount) {
    if (this.status === null) {
      return this.start();
    }
    let n = this.status;
    let add = amount;
    if (typeof add !== 'number') {
      if (n < 0.25) add = 0.09;
      else if (n < 0.65) add = 0.038;
      else if (n < 0.85) add = 0.016;
      else if (n < 0.98) add = 0.005;
      else add = 0;
    }
    return this.set(n + add);
  }

  #trickle() {
    this.inc();
  }

  /**
   * Finish and hide the progress bar.
   * @param {boolean} force - If true, immediately finishes regardless of active request count.
   */
  done(force = false) {
    if (typeof window === 'undefined') return this;

    if (force) {
      this.activeRequests = 0;
    } else if (this.activeRequests > 0) {
      this.activeRequests--;
      if (this.activeRequests > 0) {
        return this; // Remaining requests still in flight
      }
    }

    clearTimeout(this.safetyTimeout);
    clearInterval(this.trickleTimer);

    if (this.status === null) {
      return this;
    }

    const { container, progress } = this.#getElements();

    if (progress) {
      progress.style.transition = 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)';
      progress.style.width = '100%';
    }

    this.status = 1;

    // Brief tactile pause at 100%, then smooth fade-out exit
    clearTimeout(this.finishTimeout);
    this.finishTimeout = setTimeout(() => {
      if (container) {
        container.classList.add('is-finishing');
      }

      clearTimeout(this.resetTimeout);
      this.resetTimeout = setTimeout(() => {
        if (container) {
          container.classList.remove('is-active', 'is-finishing');
        }
        if (progress) {
          progress.style.transition = 'none';
          progress.style.width = '0%';
        }
        this.status = null;
      }, 260);
    }, 120);

    return this;
  }

  #initListeners() {
    // 1. Intercept internal navigational link clicks
    document.addEventListener('click', (e) => {
      // Ignore right clicks, middle clicks, and modifier-key clicks (new tab/window)
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const anchor = e.target.closest('a');
      if (!anchor) return;

      // Ignore external tabs, downloads, and pseudo-links
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href === '#' || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      try {
        const url = new URL(anchor.href, window.location.href);

        // Ignore cross-origin navigations
        if (url.origin !== window.location.origin) return;

        // Ignore links pointing to the current page (with or without hash)
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }

        // Internal navigation starting -> kick off loading bar immediately!
        this.start();
      } catch {
        // ignore invalid URL strings
      }
    });

    // 2. Intercept normal form submissions
    document.addEventListener('submit', (e) => {
      if (e.defaultPrevented) return;
      const form = e.target;
      if (form && (!form.target || form.target === '_self')) {
        this.start();
      }
    });

    // 3. Browser pageshow (handles back/forward cache navigation restore)
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        this.done(true);
      }
    });

    // 4. Dismiss any orphaned or lingering bar when returning to tab
    window.addEventListener('focus', () => {
      if (this.activeRequests <= 0) {
        this.done(true);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.activeRequests <= 0) {
        this.done(true);
      }
    });

    // 5. Complete initial document boot bar once window finishes loading
    if (document.readyState === 'complete') {
      this.done(true);
    } else {
      window.addEventListener('load', () => {
        this.done(true);
      }, { once: true });
    }
  }
}

// Singleton instance
export const loadingBar = new TopLoadingBar();

if (typeof window !== 'undefined') {
  window.LoadingBar = loadingBar;
}

export default loadingBar;
