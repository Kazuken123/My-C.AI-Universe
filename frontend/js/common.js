import { api } from './api.js';

export const SKILL_THEMES = [
  { id: 'higgsfield', label: 'Higgsfield Cinema' },
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

/**
 * Initialize Shared Sidebar Navigation & State
 */
export async function initSidebar(activePage = 'discover') {
  initTheme();
  bindSpotlightHover(document.body);

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
      if (label) label.textContent = health.gemini_available ? 'Gemini 2.5' : 'Local SQL';
      if (dot) dot.style.background = health.gemini_available ? 'var(--success)' : 'var(--warning)';
    }
  } catch {
    // offline or loading
  }

  // Load recent storyline threads into sidebar
  const recentList = document.getElementById('sidebar-recent-chats');
  const sessionCount = document.getElementById('sidebar-session-count');
  if (recentList) {
    try {
      const sessions = await api.getChatSessions();
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
            <img class="recent-chat-avatar" src="${escapeHtml(s.characterAvatar || '')}" alt="${escapeHtml(s.characterName)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
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

  // Account State in Sidebar
  await initAccountState();

  // Active Persona in Sidebar
  await initPersonaPill();
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
      if (userAvatarEl) userAvatarEl.textContent = currentUser.avatar || '👤';

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
    if (personaEmoji) personaEmoji.textContent = active.avatar || 'TR';
  } catch {
    // fallback
  }
}
