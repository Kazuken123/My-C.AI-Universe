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

  // Upgrade any select controls on page to luxury custom dropdowns
  initCustomSelects();
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
