/** Dashboard controls shared by Express and Next. No duplicate API requests. */
function createUniverseControls() {
  const islands = new Map();
  const rails = new Map();
  const motionAllowed = () => document.documentElement.dataset.orbitMotion !== 'paused';

  function bindIsland(island) {
    const trigger = island.querySelector('.island-trigger');
    const menu = island.querySelector('.island-menu');
    if (!trigger || !menu) return () => {};
    const controller = new AbortController();
    const { signal } = controller;
    let open = false;
    let pinned = false;
    let closeTimer;
    let hideTimer;
    let ignoreFocus = false;
    const resize = () => {
      if (open) island.style.setProperty('--island-height', `${Math.min(menu.scrollHeight, parseFloat(getComputedStyle(menu).maxHeight) || menu.scrollHeight) + trigger.offsetHeight + 2}px`);
    };
    function setOpen(value, restoreFocus = false) {
      clearTimeout(closeTimer);
      clearTimeout(hideTimer);
      open = value;
      trigger.setAttribute('aria-expanded', String(value));
      trigger.setAttribute('aria-label', value ? 'Close universe navigation' : 'Open universe navigation');
      if (value) {
        menu.hidden = false;
        menu.inert = false;
        island.classList.add('is-open');
        resize();
      } else {
        pinned = false;
        menu.inert = true;
        island.classList.remove('is-open');
        hideTimer = setTimeout(() => { if (!open) menu.hidden = true; }, motionAllowed() ? 550 : 0);
        if (restoreFocus) {
          ignoreFocus = true;
          trigger.focus({ preventScroll: true });
          ignoreFocus = false;
        }
      }
    }
    island.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') setOpen(true);
    }, { signal });
    island.addEventListener('pointerleave', () => {
      if (!pinned && !menu.contains(document.activeElement) && !trigger.matches(':focus-visible') && !document.getElementById('personaQuickSwitcherPopover')) closeTimer = setTimeout(() => setOpen(false), 180);
    }, { signal });
    trigger.addEventListener('click', () => {
      if (pinned) setOpen(false); else { pinned = true; setOpen(true); }
    }, { signal });
    island.addEventListener('focusin', event => {
      if (!ignoreFocus && (event.target !== trigger || trigger.matches(':focus-visible'))) setOpen(true);
    }, { signal });
    island.addEventListener('focusout', () => {
      queueMicrotask(() => { if (!island.contains(document.activeElement) && !island.matches(':hover') && !document.getElementById('personaQuickSwitcherPopover')) setOpen(false); });
    }, { signal });
    island.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.getElementById('personaQuickSwitcherPopover')) { event.preventDefault(); setOpen(false, true); }
      if (event.key === 'ArrowDown' && event.target === trigger) {
        event.preventDefault(); setOpen(true); menu.querySelector('a, button')?.focus();
      }
    }, { signal });
    document.addEventListener('pointerdown', event => {
      if (open && !island.contains(event.target) && !event.target.closest?.('.persona-quick-switcher-popover')) setOpen(false);
    }, { signal });
    menu.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link && link.dataset.sourceKey !== 'sidebar-persona-pill') setOpen(false);
    }, { signal });
    const observer = new ResizeObserver(resize);
    observer.observe(menu);
    let stopMirror = () => {};
    if (island.hasAttribute('data-mirror-sidebar')) stopMirror = mirrorSidebar(island, resize, signal);
    return () => { controller.abort(); clearTimeout(closeTimer); clearTimeout(hideTimer); observer.disconnect(); stopMirror(); };
  }

  function mirrorSidebar(island, resize, signal) {
    const sidebar = document.querySelector('.sidebar');
    const host = island.querySelector('[data-island-content]');
    if (!sidebar || !host) return () => {};
    let frame;
    let snapshot = '';
    const sourceMap = new Map();
    function makeControl(source, label, className = '') {
      const element = document.createElement(source.tagName === 'A' ? 'a' : 'button');
      if (element.tagName === 'A') element.href = source.href;
      else element.type = 'button';
      element.className = className;
      element.dataset.sourceKey = source.id || source.getAttribute('href') || label;
      sourceMap.set(element.dataset.sourceKey, source);
      const icon = source.querySelector('i')?.cloneNode(true);
      if (icon) element.append(icon);
      const text = document.createElement('span');
      text.textContent = label;
      element.append(text);
      element.setAttribute('aria-label', source.getAttribute('aria-label') || label);
      if (source.classList.contains('active')) element.setAttribute('aria-current', 'page');
      return element;
    }
    function sync() {
      frame = 0;
      const nav = [...sidebar.querySelectorAll('.sidebar-nav a')];
      const threads = [...sidebar.querySelectorAll('.recent-chat-item')];
      const signedIn = !sidebar.querySelector('#authUserView')?.classList.contains('hidden');
      const userName = signedIn ? sidebar.querySelector('#authUserName')?.textContent : 'Sign in / Register';
      const state = JSON.stringify([nav.map(a => [a.href, a.textContent, a.className]), threads.map(a => [a.href, a.textContent]), signedIn, userName, sidebar.querySelector('#sidebar-persona-name')?.textContent, sidebar.querySelector('#themeModeLabel')?.textContent]);
      if (state === snapshot) return;
      snapshot = state;
      const focusKey = host.contains(document.activeElement) ? document.activeElement.dataset.sourceKey : null;
      sourceMap.clear();
      const fragment = document.createDocumentFragment();
      const navigation = document.createElement('nav'); navigation.className = 'island-nav'; navigation.setAttribute('aria-label', 'Universe navigation');
      nav.forEach(a => navigation.append(makeControl(a, a.querySelector('span')?.textContent.trim() || a.textContent.trim())));
      fragment.append(navigation);
      const cta = sidebar.querySelector('.sidebar-cta-wrap a');
      if (cta) fragment.append(makeControl(cta, cta.querySelector('span')?.textContent.trim() || 'New story', 'island-new-story'));
      const history = document.createElement('div'); history.className = 'island-history';
      const heading = document.createElement('div'); heading.className = 'island-section-label'; heading.textContent = `Active storylines · ${threads.length}`; history.append(heading);
      if (threads.length) threads.forEach(a => history.append(makeControl(a, a.querySelector('.recent-chat-name')?.textContent.trim() || 'Continue story', 'island-thread')));
      else { const p = document.createElement('p'); p.textContent = signedIn ? 'Your next story starts with a hello.' : 'Sign in to pick up your stories.'; history.append(p); }
      fragment.append(history);
      const account = document.createElement('div'); account.className = 'island-account';
      const userLink = sidebar.querySelector(signedIn ? '#sidebar-persona-pill' : '#authGuestView a');
      if (userLink) account.append(makeControl(userLink, userName || 'Your profile'));
      const signOut = sidebar.querySelector('#authSignOutBtn');
      if (signedIn && signOut) account.append(makeControl(signOut, 'Sign out'));
      fragment.append(account);
      const tools = document.createElement('div'); tools.className = 'island-tools';
      const settings = sidebar.querySelector('.sidebar-settings-link');
      if (settings) tools.append(makeControl(settings, 'Settings'));
      const theme = sidebar.querySelector('#themeToggleBtn');
      if (theme) tools.append(makeControl(theme, 'Theme'));
      if (signedIn && userLink) tools.append(makeControl(userLink, sidebar.querySelector('#sidebar-persona-name')?.textContent.trim() || 'Personas'));
      fragment.append(tools);
      host.replaceChildren(fragment);
      if (focusKey) [...host.querySelectorAll('[data-source-key]')].find(el => el.dataset.sourceKey === focusKey)?.focus({ preventScroll: true });
      resize();
    }
    host.addEventListener('click', event => {
      const control = event.target.closest('[data-source-key]');
      if (!control || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const source = sourceMap.get(control.dataset.sourceKey);
      if (!source) return;
      event.preventDefault();
      // Keep the real persona switcher and anchor it to the visible island control.
      if (source.id === 'sidebar-persona-pill') source.__popoverAnchor = control;
      try { source.click(); } finally { delete source.__popoverAnchor; }
    }, { signal });
    island.querySelector('[data-island-sidebar]')?.addEventListener('click', () => {
      document.getElementById(innerWidth <= 1024 ? 'mobileMenuBtn' : 'sidebarCollapseBtn')?.click();
    }, { signal });
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(sync); });
    observer.observe(sidebar, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'href'] });
    sync();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }

  function bindRail(rail) {
    const track = rail.querySelector('.character-track');
    const previous = rail.querySelector('[data-rail-prev]');
    const next = rail.querySelector('[data-rail-next]');
    const status = rail.querySelector('[data-rail-status]');
    if (!track || !previous || !next) return () => {};
    const controller = new AbortController();
    const { signal } = controller;
    let frame;
    let statusTimer;
    const cards = () => [...track.querySelectorAll(':scope > .bento-cell:has([data-char-card])')];
    function update() {
      frame = 0;
      const items = cards();
      const max = track.scrollWidth - track.clientWidth;
      const busy = track.getAttribute('aria-busy') === 'true';
      const atStart = busy || !items.length || track.scrollLeft <= 2;
      const atEnd = busy || !items.length || max < 2 || track.scrollLeft >= max - 2;
      for (const [button, hide] of [[previous, atStart], [next, atEnd]]) {
        if (hide && document.activeElement === button) track.focus({ preventScroll: true });
        button.hidden = hide;
      }
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        if (!items.length || busy) { status.textContent = ''; return; }
        const bounds = track.getBoundingClientRect();
        const visible = items.map((card, index) => ({ rect: card.getBoundingClientRect(), index })).filter(item => item.rect.right > bounds.left + 4 && item.rect.left < bounds.right - 4);
        if (visible.length) status.textContent = `Characters ${visible[0].index + 1}–${visible.at(-1).index + 1} of ${items.length}`;
      }, 180);
    }
    function queueUpdate() { if (!frame) frame = requestAnimationFrame(update); }
    function move(direction) {
      const item = cards()[0];
      if (!item) return;
      const stride = item.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
      const count = Math.max(1, Math.floor(track.clientWidth / stride));
      track.scrollBy({ left: direction * stride * count, behavior: motionAllowed() ? 'smooth' : 'instant' });
    }
    previous.addEventListener('click', () => move(-1), { signal });
    next.addEventListener('click', () => move(1), { signal });
    track.addEventListener('scroll', queueUpdate, { passive: true, signal });
    track.addEventListener('keydown', event => {
      if (event.target !== track) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); track.scrollTo({ left: event.key === 'Home' ? 0 : track.scrollWidth, behavior: motionAllowed() ? 'smooth' : 'instant' }); }
    }, { signal });
    const size = new ResizeObserver(queueUpdate); size.observe(track);
    const content = new MutationObserver(queueUpdate); content.observe(track, { childList: true, attributes: true, attributeFilter: ['aria-busy'] });
    update();
    return () => { controller.abort(); size.disconnect(); content.disconnect(); cancelAnimationFrame(frame); clearTimeout(statusTimer); };
  }
  return () => {
    for (const collection of [islands, rails]) for (const [element, cleanup] of collection) if (!element.isConnected) { cleanup(); collection.delete(element); }
    document.querySelectorAll('[data-universe-island]').forEach(el => { if (!islands.has(el)) islands.set(el, bindIsland(el)); });
    document.querySelectorAll('[data-character-rail]').forEach(el => { if (!rails.has(el)) rails.set(el, bindRail(el)); });
  };
}

/** Shared progressive enhancement. Works with static pages and Next route changes. */
function initOrbitMotion() {
  if (window.__orbitMotion) return;
  window.__orbitMotion = true;
  const root = document.documentElement;
  const scanUniverseControls = createUniverseControls();
  let paused = false;
  try { paused = localStorage.getItem('ambient_motion_disabled') === 'true'; } catch {}
  root.dataset.orbitMotion = paused ? 'paused' : 'running';
  const observed = new WeakSet();
  const buttons = new WeakSet();
  let scrollFrame = 0;
  function updateScroll() {
    scrollFrame = 0;
    document.querySelectorAll('.main-workspace').forEach(scroller => {
      // Mobile pages scroll the document; desktop uses the workspace panel.
      const source = getComputedStyle(scroller).overflowY === 'visible' ? document.scrollingElement : scroller;
      if (!source) return;
      const bar = scroller.querySelector('.orbit-topbar');
      document.querySelector('[data-universe-island]')?.classList.toggle('is-scrolled', source.scrollTop > 24);
      bar?.classList.toggle('is-scrolled', source.scrollTop > 24);
      const max = source.scrollHeight - source.clientHeight;
      bar?.style.setProperty('--scroll-progress', String(max > 0 ? source.scrollTop / max : 0));
      scroller.querySelector('.orbit-art')?.style.setProperty('--orbit-parallax', `${paused ? 0 : Math.min(source.scrollTop * .08, 28)}px`);
    });
  }
  function queueScrollUpdate() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }
  window.addEventListener('scroll', queueScrollUpdate, { passive: true, capture: true });
  window.addEventListener('resize', queueScrollUpdate, { passive: true });
  const revealSelector = '.orbit-hero-copy, .orbit-art, .orbit-strip, .orbit-section-heading, .bento-cell, .orbit-continue, .orbit-footer, .studio-card, .persona-card';
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (target.matches('.orbit-art')) target.dataset.inView = String(isIntersecting);
      if (isIntersecting) {
        target.dataset.reveal = 'visible';
        if (!target.matches('.orbit-art')) observer.unobserve(target);
      }
    });
  }, { threshold: .06 }) : null;

  function scan() {
    scanUniverseControls();
    document.querySelectorAll(revealSelector).forEach((el, index) => {
      if (observed.has(el)) return;
      observed.add(el);
      el.classList.add('orbit-reveal');
      el.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`;
      // Content remains visible if this enhancement cannot run.
      el.dataset.reveal = observer && !paused ? 'waiting' : 'visible';
      observer?.observe(el);
    });
    queueScrollUpdate();
    document.querySelectorAll('[data-motion-toggle]').forEach(button => {
      if (buttons.has(button)) return;
      const update = () => {
        button.setAttribute('aria-pressed', String(!paused));
        button.setAttribute('aria-label', paused ? 'Enable animations' : 'Pause animations');
        button.title = paused ? 'Enable animations' : 'Pause animations';
        button.textContent = paused ? '▷' : 'Ⅱ';
      };
      update();
      buttons.add(button);
      button.addEventListener('click', () => {
        paused = !paused;
        root.dataset.orbitMotion = paused ? 'paused' : 'running';
        queueScrollUpdate();
        try { localStorage.setItem('ambient_motion_disabled', String(paused)); } catch {}
        if (window.ambientCanvas) {
          window.ambientCanvas.reducedMotion = paused;
          if (paused) window.ambientCanvas.pause(); else window.ambientCanvas.resume();
        }
        document.querySelectorAll('[data-motion-toggle]').forEach(b => {
          b.setAttribute('aria-pressed', String(!paused));
          b.setAttribute('aria-label', paused ? 'Enable animations' : 'Pause animations');
          b.title = paused ? 'Enable animations' : 'Pause animations';
          b.textContent = paused ? '▷' : 'Ⅱ';
        });
      });
    });
  }

  let scanPending = false;
  new MutationObserver(records => {
    if (scanPending || !records.some(record => record.addedNodes.length || record.removedNodes.length)) return;
    scanPending = true;
    requestAnimationFrame(() => { scanPending = false; scan(); });
  }).observe(document.body, { childList: true, subtree: true });
  // One delegated listener, no per-card handlers or continuous animation loop.
  let pointerFrame = 0;
  document.addEventListener('pointermove', event => {
    if (paused || event.pointerType !== 'mouse' || pointerFrame) return;
    const card = event.target.closest?.('.orbit-discover .card-shell');
    if (!card) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--tilt-x', `${((event.clientX - rect.left) / rect.width - .5) * 5}deg`);
      card.style.setProperty('--tilt-y', `${((event.clientY - rect.top) / rect.height - .5) * -4}deg`);
    });
  }, { passive: true });
  document.addEventListener('visibilitychange', () => root.classList.toggle('orbit-page-hidden', document.hidden));
  scan();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initOrbitMotion, { once: true });
else initOrbitMotion();
