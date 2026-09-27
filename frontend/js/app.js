import { api } from './api.js';
import { initCharactersModule, bindSpotlightHover } from './characters.js';
import { initChatModule } from './chat.js';
import { PersonaManager } from './personas.js';

const SKILL_THEMES = [
  { id: 'vanguard', label: 'Vanguard' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'telemetry', label: 'Telemetry' }
];

/**
 * CAIUniverseApp Class (Frontend Root OOP Application Controller & Router)
 */
export class CAIUniverseApp {
  constructor() {
    this.state = {
      characters: [],
      sessions: [],
      personas: [],
      activePersona: null,
      activeCharacter: null,
      activeSession: null
    };

    this.personasManager = null;
    this.chatController = null;
    this.characterManager = null;
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="ph-light ph-info"></i> <span></span>`;
    toast.querySelector('span').textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  navigateTo(viewName, pushState = true) {
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    if (pushState) {
      const pathMap = {
        discover: '/',
        create: '/create.html',
        characters: '/characters.html',
        chats: '/chats.html',
        personas: '/personas'
      };
      const targetUrl = pathMap[viewName];
      if (targetUrl && window.location.pathname !== targetUrl) {
        window.history.pushState({ view: viewName }, '', targetUrl);
      }
    }
  }

  initTheme() {
    const savedTheme = localStorage.getItem('cai_skill_theme') || 'vanguard';
    const validTheme = SKILL_THEMES.find(t => t.id === savedTheme) ? savedTheme : 'vanguard';
    document.documentElement.setAttribute('data-theme', validTheme);

    const themeBtn = document.getElementById('themeToggleBtn');
    const themeLabel = document.getElementById('themeModeLabel');

    const updateThemeLabel = (themeId) => {
      const entry = SKILL_THEMES.find(t => t.id === themeId) || SKILL_THEMES[0];
      if (themeLabel) themeLabel.textContent = entry.label;
    };

    updateThemeLabel(validTheme);

    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'vanguard';
        const currentIndex = SKILL_THEMES.findIndex(t => t.id === current);
        const nextEntry = SKILL_THEMES[(currentIndex + 1) % SKILL_THEMES.length];

        document.documentElement.setAttribute('data-theme', nextEntry.id);
        localStorage.setItem('cai_skill_theme', nextEntry.id);
        updateThemeLabel(nextEntry.id);
        this.showToast(`Design System: ${nextEntry.label}`);
      });
    }
  }

  async init() {
    this.initTheme();
    bindSpotlightHover(document.body);

    const toastFn = (msg) => this.showToast(msg);
    const navFn = (view, push) => this.navigateTo(view, push);

    this.personasManager = new PersonaManager(this.state, toastFn);

    this.chatController = initChatModule(
      this.state,
      navFn,
      (char) => this.characterManager.openStudioForEdit(char),
      toastFn
    );

    this.characterManager = initCharactersModule(
      this.state,
      navFn,
      (charId, sessionId) => this.chatController.openChatWithCharacter(charId, sessionId),
      toastFn
    );

    this.#bindNavigationEvents();
    this.#bindKeyboardShortcuts();

    await Promise.all([
      this.personasManager.loadPersonas(),
      this.characterManager.loadCharacters()
    ]);
    await this.chatController.loadAllSessions();
    await this.#checkServerHealth();
    await this.#routeFromCurrentUrl();

    window.addEventListener('popstate', () => this.#routeFromCurrentUrl());
  }

  #bindNavigationEvents() {
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.view));
    });

    document.querySelectorAll('[data-nav-trigger]').forEach(el => {
      el.addEventListener('click', () => this.navigateTo(el.dataset.navTrigger));
    });

    const brandLogo = document.getElementById('brand-home-link');
    if (brandLogo) {
      brandLogo.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateTo('discover');
      });
    }

    const createCta = document.getElementById('sidebar-create-btn');
    if (createCta) {
      createCta.addEventListener('click', () => this.characterManager.openStudioForCreate());
    }

    const heroCreateBtn = document.getElementById('hero-create-btn');
    if (heroCreateBtn) {
      heroCreateBtn.addEventListener('click', () => this.characterManager.openStudioForCreate());
    }

    const sidebarPersonaPill = document.getElementById('sidebar-persona-pill');
    if (sidebarPersonaPill) {
      sidebarPersonaPill.addEventListener('click', () => this.navigateTo('personas'));
    }
  }

  #bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '/') {
        const searchEl = document.getElementById('discoverSearch');
        if (searchEl) {
          e.preventDefault();
          this.navigateTo('discover');
          searchEl.focus();
        }
      } else if (e.key === '1') {
        this.navigateTo('discover');
      } else if (e.key === '2') {
        this.navigateTo('characters');
      } else if (e.key === '3') {
        this.navigateTo('chats');
      } else if (e.key === '4') {
        this.navigateTo('personas');
      }
    });
  }

  async #checkServerHealth() {
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
      // ignore
    }
  }

  async #routeFromCurrentUrl() {
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const charId = params.get('id');

    if ((path.includes('chat.html') || path === '/chat') && charId) {
      await this.chatController.openChatWithCharacter(charId);
    } else if (path.includes('create')) {
      this.characterManager.openStudioForCreate();
    } else if (path.includes('characters')) {
      this.navigateTo('characters', false);
    } else if (path.includes('chats')) {
      this.navigateTo('chats', false);
    } else if (path.includes('personas')) {
      this.navigateTo('personas', false);
    } else {
      this.navigateTo('discover', false);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new CAIUniverseApp();
  app.init();
});
