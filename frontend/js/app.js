import { api } from './api.js';
import { initCharactersModule } from './characters.js';
import { initChatModule } from './chat.js';
import { PersonaManager } from './personas.js';

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
    toast.textContent = message;
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
    const savedTheme = localStorage.getItem('cai_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('cai_theme', next);
        themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
      });
    }
  }

  async init() {
    this.initTheme();

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

  async #checkServerHealth() {
    try {
      const health = await api.getHealth();
      const statusEl = document.getElementById('ai-status-badge');
      if (statusEl) {
        statusEl.textContent = health.gemini_available ? '● Gemini Ready' : '● Local Mode';
        statusEl.style.color = health.gemini_available ? 'var(--success)' : 'var(--warning)';
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
