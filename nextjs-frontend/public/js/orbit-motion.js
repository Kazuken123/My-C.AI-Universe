/** Scene Spark uses curated writing prompts and the already loaded catalogue. */
const SCENE_SPARKS = {
  cozy: [
    '*Rain taps against the window of the last cafe still open. There is only one free seat, across from you.* "Mind if I stay until the storm passes?"',
    '*The power goes out just as dinner is ready. You find two candles and a very suspicious board game.* "We could make an evening of this."',
    '*An exhausted stray cat has decided that both of you belong to it. Neither of you is willing to leave first.* "So... joint custody?"',
  ],
  mystery: [
    '*A sealed letter arrives with tomorrow\'s date. Inside is a photograph of the two of you in a place you have never visited.* "Tell me you know what this means."',
    '*At midnight, every clock in the city stops. Only the old payphone beside you keeps ringing.* "Should we answer it?"',
    '*You find your own handwriting in a borrowed book. The final sentence says not to trust the person at the door. Someone knocks.* "Were you expecting anyone?"',
  ],
  adventure: [
    '*The last train leaves in three minutes. In your pocket is a one-way ticket and a map that redraws itself.* "Are you coming, or am I doing something reckless alone?"',
    '*A door appears where there was only a wall yesterday. Warm light spills out onto the pavement, and someone inside calls your name.* "One look. Then we leave. Deal?"',
    '*Your ordinary shortcut ends at a floating market above the clouds. A merchant insists that you have already paid for something.* "I think our afternoon just got complicated."',
  ],
  tension: [
    '*The elevator stops between floors just after an argument neither of you was ready to finish.* "Well. I suppose we have time to talk now."',
    '*You both reach for the same envelope. Neither of you is supposed to be here, and footsteps are getting closer.* "We can explain this badly, or leave together."',
    '*The truth finally comes out, five minutes before you are meant to say goodbye.* "Were you ever going to tell me?"',
  ],
};
function nextSceneSpark(mood, previous = -1, random = Math.random) {
  const prompts = SCENE_SPARKS[mood] || SCENE_SPARKS.cozy;
  const index = previous >= 0 ? (previous + 1 + Math.floor(random() * (prompts.length - 1))) % prompts.length : Math.floor(random() * prompts.length);
  return { index, text: prompts[index] };
}
function sceneSparkHref(base, characterId, prompt) {
  if (!characterId || !prompt.trim() || !['/chat/', '/chat.html'].includes(base)) return '';
  const params = new URLSearchParams({ opener: prompt.trim().slice(0, 1000) });
  if (base === '/chat.html') { params.set('id', characterId); return base + '?' + params; }
  return base + encodeURIComponent(characterId) + '?' + params;
}
function bindSceneSpark(island, signal) {
  const prompt = island.querySelector('[data-spark-prompt]');
  const select = island.querySelector('[data-spark-character]');
  const start = island.querySelector('[data-spark-start]');
  const status = island.querySelector('[data-spark-status]');
  const grid = document.getElementById('discover-grid');
  if (!prompt || !select || !start || !status) return () => {};
  const moods = [...island.querySelectorAll('[data-spark-mood]')];
  let mood = 'cozy';
  let previous = 0;
  let snapshot = '';
  let copyVersion = 0;
  function updateAction() {
    const href = sceneSparkHref(island.dataset.chatBase, select.value, prompt.value);
    start.href = href || '#character-roster';
    start.querySelector('span').textContent = href ? 'Use this scene' : 'Browse characters';
    start.setAttribute('aria-disabled', String(Boolean(select.value && !prompt.value.trim())));
  }
  function generate(nextMood = mood) {
    const result = nextSceneSpark(nextMood, nextMood === mood ? previous : -1);
    mood = nextMood; previous = result.index;
    prompt.value = result.text;
    moods.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sparkMood === mood)));
    status.textContent = 'New scene ready. Edit any part of it.';
    updateAction();
  }
  function syncCharacters() {
    const cards = grid ? [...grid.querySelectorAll('[data-char-card]')] : [];
    const characters = cards.map(card => ({ id: card.dataset.charCard, name: card.querySelector('.cai-card-name')?.textContent.trim() || 'Character' })).filter(character => character.id);
    const loading = grid?.getAttribute('aria-busy') === 'true';
    const signature = JSON.stringify([loading, characters]);
    if (signature === snapshot) return;
    snapshot = signature;
    const selected = select.value;
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = loading ? 'Loading characters...' : characters.length ? 'Choose a character' : 'No characters in the current results';
    select.replaceChildren(placeholder);
    characters.forEach(character => { const option = document.createElement('option'); option.value = character.id; option.textContent = character.name; select.append(option); });
    select.disabled = loading || !characters.length;
    if (!loading && characters.some(character => character.id === selected)) select.value = selected;
    status.textContent = loading ? 'Waiting for the character catalogue...' : characters.length ? 'Choose who joins your scene.' : 'Try clearing the catalogue filters, or copy the prompt for later.';
    updateAction();
  }
  moods.forEach(button => button.addEventListener('click', () => generate(button.dataset.sparkMood), { signal }));
  island.querySelector('[data-spark-reroll]')?.addEventListener('click', () => generate(), { signal });
  prompt.addEventListener('input', () => { copyVersion++; updateAction(); }, { signal });
  select.addEventListener('change', updateAction, { signal });
  start.addEventListener('click', event => {
    if (select.value && !prompt.value.trim()) { event.preventDefault(); status.textContent = 'Write an opening scene first.'; prompt.focus(); }
  }, { signal });
  island.querySelector('[data-spark-copy]')?.addEventListener('click', async () => {
    const value = prompt.value.trim();
    if (!value) { status.textContent = 'Write an opening scene first.'; prompt.focus(); return; }
    const version = ++copyVersion;
    try {
      await navigator.clipboard.writeText(value);
      if (!signal.aborted && version === copyVersion) status.textContent = 'Scene copied.';
    } catch {
      if (!signal.aborted && version === copyVersion) { prompt.focus(); prompt.select(); status.textContent = 'Copy is unavailable here. The scene is selected for manual copying.'; }
    }
  }, { signal });
  const observer = grid ? new MutationObserver(syncCharacters) : null;
  observer?.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
  syncCharacters();
  return () => observer?.disconnect();
}

/** Dashboard controls shared by Express and Next. No duplicate API requests. */
function createUniverseControls() {
  const islands = new Map();
  const rails = new Map();
  const motionAllowed = () => true;

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
      const dockWidth = island.parentElement?.getBoundingClientRect?.().width || 440;
      island.style.setProperty('--island-panel-width', `${Math.max(0, Math.min(440, dockWidth) - 2)}px`);
      if (open) island.style.setProperty('--island-height', `${Math.min(menu.scrollHeight, parseFloat(getComputedStyle(menu).maxHeight) || menu.scrollHeight) + trigger.offsetHeight + 2}px`);
    };
    function setOpen(value, restoreFocus = false) {
      clearTimeout(closeTimer);
      clearTimeout(hideTimer);
      if (value === open) { if (open) resize(); return; }
      open = value;
      trigger.setAttribute('aria-expanded', String(value));
      trigger.setAttribute('aria-label', value ? 'Close Scene Spark' : 'Open Scene Spark');
      if (value) {
        menu.hidden = false;
        menu.inert = false;
        // Commit the collapsed layout before changing geometry, including first hover.
        void island.offsetHeight;
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
      if (!pinned && !menu.contains(document.activeElement) && !trigger.matches(':focus-visible')) closeTimer = setTimeout(() => setOpen(false), 180);
    }, { signal });
    trigger.addEventListener('click', () => {
      if (pinned) setOpen(false); else { pinned = true; setOpen(true); }
    }, { signal });
    island.addEventListener('focusin', event => {
      if (!ignoreFocus && (event.target !== trigger || trigger.matches(':focus-visible'))) setOpen(true);
    }, { signal });
    island.addEventListener('focusout', () => {
      queueMicrotask(() => { if (!island.contains(document.activeElement) && !island.matches(':hover')) setOpen(false); });
    }, { signal });
    island.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false, true); }
      if (event.key === 'ArrowDown' && event.target === trigger) {
        event.preventDefault(); setOpen(true); menu.querySelector('button, textarea, select, a')?.focus();
      }
    }, { signal });
    document.addEventListener('pointerdown', event => {
      if (open && !island.contains(event.target)) setOpen(false);
    }, { signal });
    menu.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link && link.getAttribute('aria-disabled') !== 'true') setOpen(false);
    }, { signal });
    const observer = new ResizeObserver(resize);
    observer.observe(menu);
    const stopSpark = island.hasAttribute('data-scene-spark') ? bindSceneSpark(island, signal) : () => {};
    const dockObserver = island.parentElement ? new ResizeObserver(resize) : null;
    if (dockObserver) dockObserver.observe(island.parentElement);
    return () => { controller.abort(); clearTimeout(closeTimer); clearTimeout(hideTimer); observer.disconnect(); dockObserver?.disconnect(); stopSpark(); };
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
  // Motion is always on. Discard the obsolete pause preference from older builds.
  try { localStorage.removeItem('ambient_motion_disabled'); } catch {}
  root.dataset.orbitMotion = 'running';
  window.ambientCanvas?.forceStart();
  const observed = new WeakSet();
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
      scroller.querySelector('.orbit-art')?.style.setProperty('--orbit-parallax', `${Math.min(source.scrollTop * .08, 28)}px`);
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
      el.dataset.reveal = observer ? 'waiting' : 'visible';
      observer?.observe(el);
    });
    queueScrollUpdate();

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
    if (event.pointerType !== 'mouse' || pointerFrame) return;
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
