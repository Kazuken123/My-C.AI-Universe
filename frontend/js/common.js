import { api } from './api.js';
export { loadingBar } from './loading-bar.js';
export { ambientCanvas } from './ambient-canvas.js';

export const SKILL_THEMES = [
  { id: 'higgsfield', label: 'Orbit Studio' },
  { id: 'vanguard', label: 'Vanguard' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'telemetry', label: 'Telemetry' }
];

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatCount(num) {
  const n = Number(num) || 0;
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/**
 * Toast Notification Dispatcher
 */
export function showToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="ph-light ph-info"></i> <span></span>`;
  toast.querySelector('span').textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('exiting');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

/**
 * Attach GPU-safe cursor spotlight tracking to Double-Bezel shells
 */
export function bindSpotlightHover(container = document.body) {
  if (!container) return;
  container.querySelectorAll('.double-bezel-shell').forEach(shell => {
    if (shell.__spotlightBound) return;
    shell.__spotlightBound = true;
    shell.addEventListener('pointermove', (e) => {
      const rect = shell.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      shell.style.setProperty('--mouse-x', `${x}px`);
      shell.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

/**
 * Initialize 4-Mode Theme Engine & Listener
 */
export function initTheme() {
  const savedTheme = localStorage.getItem('cai_skill_theme') || 'higgsfield';
  const validTheme = SKILL_THEMES.find(t => t.id === savedTheme) ? savedTheme : 'higgsfield';
  document.documentElement.setAttribute('data-theme', validTheme);

  const themeBtn = document.getElementById('themeToggleBtn');
  const themeLabel = document.getElementById('themeModeLabel');

  const updateLabel = (id) => {
    const entry = SKILL_THEMES.find(t => t.id === id) || SKILL_THEMES[0];
    if (themeLabel) themeLabel.textContent = entry.label;
  };

  updateLabel(validTheme);

  if (themeBtn && !themeBtn.__themeBound) {
    themeBtn.__themeBound = true;
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'higgsfield';
      const currentIndex = SKILL_THEMES.findIndex(t => t.id === current);
      const nextEntry = SKILL_THEMES[(currentIndex + 1) % SKILL_THEMES.length];

      document.documentElement.setAttribute('data-theme', nextEntry.id);
      localStorage.setItem('cai_skill_theme', nextEntry.id);
      updateLabel(nextEntry.id);
      showToast(`Design System: ${nextEntry.label}`);
    });
  }
}

const ACTIVE_SESSION_STORAGE_KEY = 'cai_active_session_by_char';

export function getActiveSessionForCharacter(characterId) {
  if (!characterId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map && typeof map === 'object' ? (map[characterId] || null) : null;
  } catch {
    return null;
  }
}

export function setActiveSessionForCharacter(characterId, sessionId) {
  if (!characterId || !sessionId || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[characterId] = sessionId;
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage error
  }
}

/**
 * Deduplicate chat sessions by characterId while keeping the current (active or most recent) session
 * and counting total chats per character.
 */
export function deduplicateSessionsByCharacter(sessions = []) {
  if (!Array.isArray(sessions)) return [];
  const map = new Map();
  for (const s of sessions) {
    if (!s || !s.characterId) continue;
    const activeSessionId = getActiveSessionForCharacter(s.characterId);
    if (!map.has(s.characterId)) {
      map.set(s.characterId, { ...s, threadCount: 1, chatCount: 1 });
    } else {
      const existing = map.get(s.characterId);
      const nextCount = (existing.threadCount || 1) + 1;
      if (activeSessionId && s.id === activeSessionId && existing.id !== activeSessionId) {
        map.set(s.characterId, { ...s, threadCount: nextCount, chatCount: nextCount });
      } else {
        existing.threadCount = nextCount;
        existing.chatCount = nextCount;
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Initialize Shared Sidebar Navigation & State
 */
export async function initSidebar(activePage = 'discover') {
  initTheme();
  bindSpotlightHover(document.body);

  // Collapsible Sidebar Rail (Linear / Discord UX)
  const sidebar = document.querySelector('.sidebar');
  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const isCollapsed = localStorage.getItem('cai_sidebar_collapsed') === 'true';

  const setSidebarCollapsed = (collapsed) => {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed', collapsed && window.innerWidth > 1024);
    document.body.classList.toggle('sidebar-collapsed', collapsed && window.innerWidth > 1024);
    if (collapseBtn) {
      collapseBtn.title = collapsed ? 'Expand Sidebar ([)' : 'Collapse Sidebar ([)';
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    }
    try {
      localStorage.setItem('cai_sidebar_collapsed', String(collapsed));
    } catch {}
  };

  setSidebarCollapsed(isCollapsed);
  window.matchMedia('(min-width: 1025px)').addEventListener('change', () => {
    setSidebarCollapsed(localStorage.getItem('cai_sidebar_collapsed') === 'true');
  });

  if (collapseBtn && !collapseBtn.__collapseBound) {
    collapseBtn.__collapseBound = true;
    collapseBtn.addEventListener('click', () => {
      const currentlyCollapsed = sidebar?.classList.contains('collapsed') || false;
      setSidebarCollapsed(!currentlyCollapsed);
    });
  }

  // Keyboard shortcut: '[' to toggle sidebar rail
  if (!window.__sidebarKeyBound) {
    window.__sidebarKeyBound = true;
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '[' || (e.ctrlKey && e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        const currentlyCollapsed = sidebar?.classList.contains('collapsed') || false;
        setSidebarCollapsed(!currentlyCollapsed);
      }
    });
  }

  // Nav shortcut badges: Reveal when holding Alt key, and handle Alt+1..4 workspace shortcuts
  if (!window.__navKbdBound) {
    window.__navKbdBound = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') {
        document.body.classList.add('show-nav-kbd');
      }
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') { window.location.href = '/'; e.preventDefault(); }
        else if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') { window.location.href = '/create.html'; e.preventDefault(); }
        else if (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3') { window.location.href = '/chats.html'; e.preventDefault(); }
        else if (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4') { window.location.href = '/personas.html'; e.preventDefault(); }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') {
        document.body.classList.remove('show-nav-kbd');
      }
    });
    window.addEventListener('blur', () => {
      document.body.classList.remove('show-nav-kbd');
    });
  }

  document.querySelectorAll('.sidebar a, .sidebar button').forEach(control => {
    if (!control.getAttribute('aria-label')) {
      const label = control.getAttribute('title') || control.textContent.trim().replace(/\s+/g, ' ');
      if (label) control.setAttribute('aria-label', label);
    }
  });

  // Set active nav link
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    const page = item.dataset.page || item.dataset.view;
    item.classList.toggle('active', page === activePage);
  });

  // Check Engine Status
  try {
    const health = await api.getHealth();
    const statusEl = document.getElementById('ai-status-badge');
    if (statusEl) {
      const label = statusEl.querySelector('.status-label');
      const dot = statusEl.querySelector('.status-dot');
      const model = (health?.gemini_model || '').toLowerCase();
      let displayModel = 'Gemini 3.5 Lite';
      if (model.includes('3.5-flash-lite')) displayModel = 'Gemini 3.5 Lite';
      else if (model.includes('3.1-flash-lite')) displayModel = 'Gemini 3.1 Lite';
      else if (model.includes('3.5')) displayModel = 'Gemini 3.5';
      else if (model.includes('3.1')) displayModel = 'Gemini 3.1';
      else if (model.includes('2.5')) displayModel = 'Gemini 2.5';
      else if (health?.gemini_available) displayModel = 'Gemini AI';

      if (label) label.textContent = health?.gemini_available ? displayModel : 'Local SQL';
      if (dot) dot.style.background = health?.gemini_available ? 'var(--success)' : 'var(--warning)';
      statusEl.title = health?.gemini_available ? `AI Engine: ${health.gemini_model || 'Gemini 3.5 Flash Lite'}` : 'Local SQL Mode';
    }
  } catch {
    // offline or loading
  }

  // Load recent storyline threads into sidebar
  const recentList = document.getElementById('sidebar-recent-chats');
  const sessionCount = document.getElementById('sidebar-session-count');
  if (recentList) {
    if (!api.getToken()) {
      if (sessionCount) sessionCount.textContent = '0';
      recentList.innerHTML = `
        <div class="sidebar-empty-threads" style="padding: 14px 12px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm); margin: 6px 0;">
          Sign in to access your chat history.
        </div>
      `;
    } else {
      try {
        const rawSessions = await api.getChatSessions();
        const sessions = deduplicateSessionsByCharacter(rawSessions);
        if (sessionCount) sessionCount.textContent = String(sessions.length);

        if (sessions.length === 0) {
          recentList.innerHTML = `
            <div class="sidebar-empty-threads" style="padding: 14px 12px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm); margin: 6px 0;">
              No active storylines yet.<br>Select any character to begin!
            </div>
          `;
        } else {
          recentList.innerHTML = sessions.slice(0, 8).map(s => `
            <a href="/chat.html?id=${encodeURIComponent(s.characterId)}&session=${encodeURIComponent(s.id)}" class="recent-chat-item">
              <span class="recent-chat-avatar-wrap">
                <img class="recent-chat-avatar" src="${escapeHtml(s.characterAvatar || '')}" alt="${escapeHtml(s.characterName)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
              </span>
              <div class="recent-chat-meta">
                <div class="recent-chat-name">${escapeHtml(s.characterName)}</div>
                <div class="recent-chat-preview">${escapeHtml((s.lastMessage || '').replace(/\*/g, '').slice(0, 42))}</div>
              </div>
            </a>
          `).join('');
        }
      } catch {
        // ignore
      }
    }
  }

  // Account State in Sidebar
  await initAccountState();

  // Active Persona in Sidebar
  await initPersonaPill();

  // Intercept protected navigation links for unauthenticated guests
  document.querySelectorAll('.sidebar a[href*="create.html"], .sidebar a[href*="chats.html"], .sidebar a[href*="personas.html"], .mobile-bottom-nav a[href*="create.html"], .mobile-bottom-nav a[href*="chats.html"], .mobile-bottom-nav a[href*="personas.html"], .sidebar-cta-wrap a, #sidebar-persona-pill').forEach(link => {
    if (!link.__authGuardBound) {
      link.__authGuardBound = true;
      link.addEventListener('click', (e) => {
        if (!api.getToken()) {
          e.preventDefault();
          e.stopPropagation();
          const href = link.getAttribute('href') || '/';
          window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(href)}`;
        }
      });
    }
  });

  // Upgrade any select controls on page to luxury custom dropdowns
  initCustomSelects();

  // Initialize Responsive Mobile App Bar, Dock & Off-Canvas Drawer
  initMobileNavigation(activePage);
}

/**
 * Universal authentication guard helper
 */
export function requireAuthOrRedirect(targetUrl = null) {
  if (!api.getToken()) {
    const ret = targetUrl || (window.location.pathname + window.location.search);
    window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(ret)}`;
    return false;
  }
  return true;
}

/**
 * Universal Mobile Navigation Engine (Phones & Tablets)
 * Manages Top Mobile App Bar, Bottom Touch Navigation Dock, and Off-Canvas Slide-out Sidebar Drawer
 */
export function initMobileNavigation(activePage = 'discover') {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // 1. Ensure mobile sidebar close button exists in sidebar-header
  const sidebarHeader = sidebar.querySelector('.sidebar-header');
  let sidebarCloseBtn = document.getElementById('mobileSidebarClose');
  if (sidebarHeader && !sidebarCloseBtn) {
    sidebarCloseBtn = document.createElement('button');
    sidebarCloseBtn.className = 'icon-btn mobile-sidebar-close';
    sidebarCloseBtn.id = 'mobileSidebarClose';
    sidebarCloseBtn.type = 'button';
    sidebarCloseBtn.setAttribute('aria-label', 'Close Navigation Menu');
    sidebarCloseBtn.innerHTML = '<i class="ph-light ph-x"></i>';
    sidebarHeader.appendChild(sidebarCloseBtn);
  }

  // 2. Ensure sidebar backdrop exists
  let backdrop = document.getElementById('sidebarBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.id = 'sidebarBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
  }

  const openSidebar = () => {
    sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('mobile-drawer-locked');
  };

  const closeSidebar = () => {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('mobile-drawer-locked');
  };

  if (sidebarCloseBtn && !sidebarCloseBtn.__mobileBound) {
    sidebarCloseBtn.__mobileBound = true;
    sidebarCloseBtn.addEventListener('click', closeSidebar);
  }

  if (backdrop && !backdrop.__mobileBound) {
    backdrop.__mobileBound = true;
    backdrop.addEventListener('click', closeSidebar);
  }

  // Close sidebar on Escape key
  if (!window.__mobileEscBound) {
    window.__mobileEscBound = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSidebar();
    });
  }

  // Auto-close drawer when clicking any navigation link inside sidebar on mobile
  sidebar.querySelectorAll('.sidebar-nav .nav-item, .recent-chat-item, .sidebar-cta-wrap a').forEach(el => {
    if (!el.__mobileCloseBound) {
      el.__mobileCloseBound = true;
      el.addEventListener('click', () => {
        if (window.innerWidth <= 1024) closeSidebar();
      });
    }
  });

  const isChatPage = document.body.classList.contains('is-chat-page') || !!document.querySelector('.chat-room-layout');
  const isAuthPage = document.body.classList.contains('is-auth-page') || !!document.querySelector('.auth-page-wrapper');

  if (!isChatPage && !isAuthPage) {
    // 3. Ensure Mobile Header exists
    let mobileHeader = document.querySelector('.mobile-header');
    if (!mobileHeader) {
      mobileHeader = document.createElement('header');
      mobileHeader.className = 'mobile-header';
      mobileHeader.setAttribute('aria-label', 'Mobile Navigation Bar');
      mobileHeader.innerHTML = `
        <button class="mobile-menu-btn" id="mobileMenuBtn" type="button" aria-label="Open Navigation Menu">
          <i class="ph-light ph-list"></i>
        </button>
        <a href="/" class="mobile-brand">
          <span class="brand-mark" aria-hidden="true">
            <img src="/favicon.svg" alt="C.AI Universe" class="brand-mark-img" width="22" height="22" />
          </span>
          <span class="brand-title">C.AI Universe</span>
        </a>
        <div class="mobile-header-actions">
          <button class="icon-btn mobile-theme-btn" id="mobileThemeBtn" type="button" aria-label="Cycle Theme" title="Theme">
            <i class="ph-light ph-sliders-horizontal"></i>
          </button>
        </div>
      `;
      document.body.prepend(mobileHeader);
    }

    const menuBtn = document.getElementById('mobileMenuBtn');
    if (menuBtn && !menuBtn.__mobileBound) {
      menuBtn.__mobileBound = true;
      menuBtn.addEventListener('click', openSidebar);
    }

    const mobileThemeBtn = document.getElementById('mobileThemeBtn');
    if (mobileThemeBtn && !mobileThemeBtn.__mobileBound) {
      mobileThemeBtn.__mobileBound = true;
      mobileThemeBtn.addEventListener('click', () => {
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.click();
      });
    }

    // 4. Ensure Mobile Bottom Navigation exists
    let bottomNav = document.querySelector('.mobile-bottom-nav');
    if (!bottomNav) {
      bottomNav = document.createElement('nav');
      bottomNav.className = 'mobile-bottom-nav';
      bottomNav.setAttribute('aria-label', 'Mobile Navigation');
      bottomNav.innerHTML = `
        <a href="/" class="mobile-nav-tab ${activePage === 'discover' ? 'active' : ''}" data-page="discover">
          <i class="ph-light ph-compass"></i>
          <span>Discover</span>
        </a>
        <a href="/create.html" class="mobile-nav-tab ${activePage === 'create' ? 'active' : ''}" data-page="create">
          <i class="ph-light ph-sparkle"></i>
          <span>Studio</span>
        </a>
        <a href="/chats.html" class="mobile-nav-tab ${activePage === 'chats' ? 'active' : ''}" data-page="chats">
          <i class="ph-light ph-chats-circle"></i>
          <span>Chats</span>
        </a>
        <a href="/personas.html" class="mobile-nav-tab ${activePage === 'personas' ? 'active' : ''}" data-page="personas">
          <i class="ph-light ph-identification-card"></i>
          <span>Personas</span>
        </a>
        <button type="button" class="mobile-nav-tab" id="mobileNavMenuBtn" aria-label="Open Workspace Menu">
          <i class="ph-light ph-squares-four"></i>
          <span>Menu</span>
        </button>
      `;
      document.body.appendChild(bottomNav);
    }

    const bottomMenuBtn = document.getElementById('mobileNavMenuBtn');
    if (bottomMenuBtn && !bottomMenuBtn.__mobileBound) {
      bottomMenuBtn.__mobileBound = true;
      bottomMenuBtn.addEventListener('click', openSidebar);
    }

    // Sync active tab state
    bottomNav.querySelectorAll('.mobile-nav-tab').forEach(tab => {
      const p = tab.dataset.page;
      if (p) tab.classList.toggle('active', p === activePage);
    });
  }
}

export function sanitizeReturnUrl(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/';
  }
  return trimmed;
}

export function isSafeImageSrc(val) {
  if (!val || typeof val !== 'string') return false;
  return /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(val.trim());
}

export function renderUserAvatar(el, avatar, fallback = '👤') {
  if (!el) return;
  const val = String(avatar || '').trim();
  el.textContent = '';
  if (isSafeImageSrc(val)) {
    const img = document.createElement('img');
    img.src = val;
    img.alt = '';
    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; object-position: center top; border-radius: inherit; display: block;';
    el.appendChild(img);
  } else {
    el.textContent = val.slice(0, 4) || fallback;
  }
}

/**
 * Initialize Account State & Handlers in Sidebar
 */
export async function initAccountState() {
  const guestView = document.getElementById('authGuestView');
  const userView = document.getElementById('authUserView');
  const userNameEl = document.getElementById('authUserName');
  const userHandleEl = document.getElementById('authUserHandle');
  const userAvatarEl = document.getElementById('authUserAvatar');
  const signOutBtn = document.getElementById('authSignOutBtn');

  try {
    const currentUser = await api.getCurrentUser();
    if (currentUser) {
      if (guestView) guestView.classList.add('hidden');
      if (userView) userView.classList.remove('hidden');
      if (userNameEl) userNameEl.textContent = currentUser.displayName || currentUser.username;
      if (userHandleEl) userHandleEl.textContent = `@${currentUser.username}`;
      if (userAvatarEl) renderUserAvatar(userAvatarEl, currentUser.avatar);

      if (currentUser.role === 'admin') {
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav && !document.getElementById('sidebarAdminLink')) {
          const adminLink = document.createElement('a');
          adminLink.id = 'sidebarAdminLink';
          adminLink.href = '/admin.html';
          adminLink.className = 'nav-item';
          adminLink.style.borderColor = 'rgba(168, 85, 247, 0.4)';
          adminLink.style.background = 'rgba(168, 85, 247, 0.08)';
          adminLink.innerHTML = '<i class="ph-light ph-shield-check" style="color: #c084fc;"></i> <span>Admin SOC</span>';
          sidebarNav.appendChild(adminLink);
        }
      }

      if (signOutBtn && !signOutBtn.__bound) {
        signOutBtn.__bound = true;
        signOutBtn.addEventListener('click', async () => {
          try {
            await api.logout();
            showToast('Signed out of Universe account.');
            setTimeout(() => {
              window.location.reload();
            }, 300);
          } catch (err) {
            showToast('Sign out error: ' + err.message);
          }
        });
      }
    } else {
      if (guestView) guestView.classList.remove('hidden');
      if (userView) userView.classList.add('hidden');
    }
  } catch {
    if (guestView) guestView.classList.remove('hidden');
    if (userView) userView.classList.add('hidden');
  }
}

export function toMonogram(name, avatarField) {
  const cleanAvatar = String(avatarField || '').trim();
  if (cleanAvatar && !cleanAvatar.startsWith('http://') && !cleanAvatar.startsWith('https://') && !cleanAvatar.startsWith('/') && !cleanAvatar.startsWith('data:')) {
    if (/^[A-Za-z0-9]{1,3}$/.test(cleanAvatar)) {
      return cleanAvatar.toUpperCase();
    }
    const codePoints = Array.from(cleanAvatar);
    if (codePoints.length <= 2) {
      return cleanAvatar;
    }
  }
  const cleanName = String(name || '').trim();
  if (!cleanName) return 'TR';
  const parts = cleanName.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const p1 = Array.from(parts[0])[0] || '';
    const p2 = Array.from(parts[1])[0] || '';
    return (p1 + p2).toUpperCase();
  }
  return Array.from(cleanName).slice(0, 2).join('').toUpperCase();
}

/**
 * Interactive Persona Quick-Switcher Popover
 */
export function bindPersonaQuickSwitcher(personas = [], initialActive = null) {
  if (typeof document === 'undefined') return;
  const trigger = document.getElementById('sidebar-persona-pill');
  if (!trigger) return;

  // Always update persona data on the element so repeated calls don't retain stale lists
  trigger.__personas = Array.isArray(personas) ? personas : [];
  if (initialActive) {
    trigger.__activePersona = initialActive;
  }

  if (trigger.__switcherBound) return;
  trigger.__switcherBound = true;

  trigger.addEventListener('click', (e) => {
    // If not authenticated, let auth guard handle redirection
    if (!api.getToken()) return;

    // If modifier keys held, let browser navigate to /personas.html
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;

    e.preventDefault();
    e.stopPropagation();

    const existingPopover = document.getElementById('personaQuickSwitcherPopover');
    if (existingPopover) {
      const closeFn = trigger.__closeSwitcher;
      if (typeof closeFn === 'function') {
        closeFn();
      } else {
        existingPopover.remove();
      }
      return;
    }

    const currentPersonas = trigger.__personas || [];
    const activeId = trigger.__activePersona?.id || (currentPersonas.find(p => p.isDefault)?.id) || currentPersonas[0]?.id;

    const popover = document.createElement('div');
    popover.id = 'personaQuickSwitcherPopover';
    popover.className = 'persona-quick-switcher-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Switch Active Persona');

    const emptyHtml = `
      <div class="persona-switcher-empty">
        <p>No custom personas created yet.</p>
        <a href="/personas.html" class="persona-switcher-link" style="color: var(--accent); font-weight: 600;">+ Create Persona</a>
      </div>
    `;

    const listHtml = currentPersonas.length === 0 ? emptyHtml : `
      <div class="persona-switcher-list">
        ${currentPersonas.map(p => {
          const isAct = p.id === activeId;
          const mono = toMonogram(p.name, p.avatar);
          return `
            <button type="button" class="persona-switcher-item ${isAct ? 'active' : ''}" data-persona-id="${escapeHtml(p.id)}">
              <span class="persona-item-badge">${escapeHtml(mono)}</span>
              <div class="persona-item-info">
                <div class="persona-item-name">${escapeHtml(p.name)}</div>
                <div class="persona-item-desc">${escapeHtml((p.description || 'Custom Persona Identity').slice(0, 36))}</div>
              </div>
              ${isAct ? '<i class="ph-light ph-check persona-item-check"></i>' : ''}
            </button>
          `;
        }).join('')}
      </div>
    `;

    popover.innerHTML = `
      <div class="persona-switcher-header">
        <span>Switch Active Persona</span>
        <span class="persona-switcher-count">${currentPersonas.length} Available</span>
      </div>
      ${listHtml}
      <div class="persona-switcher-footer">
        <a href="/personas.html" class="persona-switcher-link">
          <i class="ph-light ph-identification-card"></i>
          <span>Manage Personas</span>
        </a>
        <a href="/profile-setup.html" class="persona-switcher-link">
          <i class="ph-light ph-gear"></i>
          <span>Settings</span>
        </a>
      </div>
    `;

    // Position fixed to prevent sidebar overflow/clipping and support collapsed rail
    const visibleAnchor = trigger.__popoverAnchor || trigger;
    const rect = visibleAnchor.getBoundingClientRect();
    const sidebar = trigger.closest('.sidebar');
    const isCollapsed = sidebar?.classList.contains('collapsed');
    const isMobile = window.innerWidth <= 768;

    popover.style.position = 'fixed';
    popover.style.zIndex = '2000';

    if (visibleAnchor !== trigger) {
      const width = Math.min(280, window.innerWidth - 32);
      const top = Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 320));
      popover.style.left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)) + 'px';
      popover.style.top = top + 'px';
      popover.style.bottom = 'auto';
      popover.style.width = width + 'px';
      popover.style.maxHeight = (window.innerHeight - top - 16) + 'px';
      popover.style.overflowY = 'auto';
    } else if (isCollapsed && !isMobile) {
      popover.style.left = `${Math.round(rect.right + 12)}px`;
      popover.style.bottom = `${Math.max(16, Math.round(window.innerHeight - rect.bottom))}px`;
      popover.style.width = '260px';
    } else {
      popover.style.left = `${Math.round(rect.left)}px`;
      popover.style.bottom = `${Math.max(16, Math.round(window.innerHeight - rect.top + 8))}px`;
      popover.style.width = `${Math.max(Math.round(rect.width), 240)}px`;
    }

    document.body.appendChild(popover);

    function closeSwitcher() {
      const p = document.getElementById('personaQuickSwitcherPopover');
      if (p) p.remove();
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onDocKey);
      window.removeEventListener('resize', closeSwitcher);
      trigger.__closeSwitcher = null;
    }

    trigger.__closeSwitcher = closeSwitcher;

    popover.querySelectorAll('.persona-switcher-item').forEach(btn => {
      btn.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        const pid = btn.dataset.personaId;
        const selected = (trigger.__personas || []).find(p => p.id === pid);
        if (!selected) {
          closeSwitcher();
          return;
        }

        try {
          await api.setDefaultPersona(pid);
          trigger.__activePersona = selected;

          const personaEmoji = document.getElementById('sidebar-persona-emoji');
          const personaName = document.getElementById('sidebar-persona-name');
          if (personaEmoji) personaEmoji.textContent = toMonogram(selected.name, selected.avatar);
          if (personaName) personaName.textContent = selected.name;

          window.dispatchEvent(new CustomEvent('persona-switched', { detail: selected }));
          showToast(`Active Persona: ${selected.name}`);
        } catch (err) {
          showToast(`Failed to switch persona: ${err.message}`);
        } finally {
          closeSwitcher();
        }
      });
    });

    const onDocClick = (evt) => {
      if (!popover.contains(evt.target) && !trigger.contains(evt.target) && !visibleAnchor.contains(evt.target)) {
        closeSwitcher();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', onDocClick);
    }, 10);

    const onDocKey = (evt) => {
      if (evt.key === 'Escape') {
        closeSwitcher();
        visibleAnchor.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onDocKey);
    window.addEventListener('resize', closeSwitcher);
  });
}

/**
 * Initialize Persona Pill in Sidebar
 */
export async function initPersonaPill() {
  const personaEmoji = document.getElementById('sidebar-persona-emoji');
  const personaName = document.getElementById('sidebar-persona-name');

  try {
    const personas = await api.getPersonas();
    const active = personas.find(p => p.isDefault) || personas[0] || { name: 'Traveler', avatar: 'TR' };
    if (personaName) personaName.textContent = active.name;
    if (personaEmoji) personaEmoji.textContent = toMonogram(active.name, active.avatar);

    bindPersonaQuickSwitcher(personas, active);
  } catch {
    // fallback
  }
}

/**
 * Universal Custom Select Dropdown Enhancer
 * Replaces native OS select popups with luxury dark glassmorphism dropdowns
 * featuring gradual hover transitions, double-bezel concentric curves, and full keyboard navigation.
 */
export function initCustomSelects(container = document) {
  if (!container) return;
  const wraps = container.querySelectorAll('.select-wrap');
  wraps.forEach(wrap => {
    const select = wrap.querySelector('select.select-control');
    if (!select) return;

    if (select.__customSelect) {
      select.__customSelect.sync();
      return;
    }

    // Hide native select visually while keeping it fully operational for form/change listeners
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');
    select.classList.add('custom-select-native');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'custom-select-label';

    const arrowIcon = document.createElement('i');
    arrowIcon.className = 'ph-light ph-caret-down custom-select-arrow';
    arrowIcon.setAttribute('aria-hidden', 'true');

    trigger.appendChild(labelSpan);
    trigger.appendChild(arrowIcon);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('tabindex', '-1');
    dropdown.style.display = 'none';

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);

    let focusedIndex = -1;

    function renderOptions() {
      dropdown.innerHTML = '';
      const options = Array.from(select.options);
      const selectedIndex = select.selectedIndex;
      const currentOpt = select.options[selectedIndex] || options[0];
      labelSpan.textContent = currentOpt ? currentOpt.textContent : '';

      options.forEach((opt, idx) => {
        const item = document.createElement('div');
        item.className = 'custom-select-option' + (idx === selectedIndex ? ' selected' : '');
        item.setAttribute('role', 'option');
        item.setAttribute('data-value', opt.value);
        item.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');

        const text = document.createElement('span');
        text.textContent = opt.textContent;

        const check = document.createElement('i');
        check.className = 'ph-light ph-check option-check';
        check.setAttribute('aria-hidden', 'true');

        item.appendChild(text);
        item.appendChild(check);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selectOption(idx);
        });

        dropdown.appendChild(item);
      });
    }

    function openDropdown() {
      document.querySelectorAll('.custom-select-dropdown').forEach(d => {
        if (d !== dropdown) {
          d.style.display = 'none';
          const p = d.closest('.select-wrap')?.querySelector('.custom-select-trigger');
          if (p) {
            p.classList.remove('active');
            p.setAttribute('aria-expanded', 'false');
          }
        }
      });

      dropdown.style.display = 'flex';
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
      focusedIndex = select.selectedIndex >= 0 ? select.selectedIndex : 0;
      highlightOption(focusedIndex);
    }

    function closeDropdown() {
      dropdown.style.display = 'none';
      trigger.classList.remove('active');
      trigger.setAttribute('aria-expanded', 'false');
      focusedIndex = -1;
      clearHighlights();
    }

    function toggleDropdown() {
      if (dropdown.style.display === 'flex') {
        closeDropdown();
      } else {
        openDropdown();
      }
    }

    function selectOption(index) {
      const options = Array.from(select.options);
      if (index < 0 || index >= options.length) return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      renderOptions();
      closeDropdown();
      trigger.focus();
    }

    function highlightOption(index) {
      const items = dropdown.querySelectorAll('.custom-select-option');
      items.forEach((item, i) => {
        if (i === index) {
          item.classList.add('focused');
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('focused');
        }
      });
    }

    function clearHighlights() {
      dropdown.querySelectorAll('.custom-select-option').forEach(i => i.classList.remove('focused'));
    }

    // Trigger events
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown();
    });

    trigger.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.custom-select-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dropdown.style.display !== 'flex') {
          openDropdown();
        } else {
          focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
          highlightOption(focusedIndex);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (dropdown.style.display === 'flex') {
          focusedIndex = Math.max(focusedIndex - 1, 0);
          highlightOption(focusedIndex);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (dropdown.style.display === 'flex') {
          selectOption(focusedIndex);
        } else {
          openDropdown();
        }
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        if (dropdown.style.display === 'flex') {
          closeDropdown();
        }
      }
    });

    // Native change listener (if value changed programmatically)
    select.addEventListener('change', () => {
      renderOptions();
    });

    // MutationObserver to automatically rebuild options if <select> is altered dynamically
    const observer = new MutationObserver(() => {
      renderOptions();
    });
    observer.observe(select, { childList: true, subtree: true });

    select.__customSelect = {
      sync: () => renderOptions(),
      destroy: () => {
        observer.disconnect();
        trigger.remove();
        dropdown.remove();
        select.classList.remove('custom-select-native');
        select.removeAttribute('tabindex');
        select.removeAttribute('aria-hidden');
        delete select.__customSelect;
      }
    };

    renderOptions();
  });
}

// Global click outside listener to close custom dropdowns
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.select-wrap')) {
      document.querySelectorAll('.custom-select-dropdown').forEach(d => {
        d.style.display = 'none';
        const p = d.closest('.select-wrap')?.querySelector('.custom-select-trigger');
        if (p) {
          p.classList.remove('active');
          p.setAttribute('aria-expanded', 'false');
        }
      });
    }
  });
}

