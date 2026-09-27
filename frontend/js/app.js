import { api } from './api.js';
import { initCharactersModule } from './characters.js';
import { initChatModule } from './chat.js';
import { initPersonasModule } from './personas.js';

const appState = {
  characters: [],
  sessions: [],
  personas: [],
  activePersona: null,
  activeCharacter: null,
  activeSession: null
};

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function navigateTo(viewName, pushState = true) {
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

document.addEventListener('DOMContentLoaded', async () => {
  // Theme initialization
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

  let charactersModule;
  let chatModule;
  let personasModule;

  // Initialize modules
  personasModule = initPersonasModule(appState, showToast);

  chatModule = initChatModule(
    appState,
    navigateTo,
    (char) => charactersModule.openStudioForEdit(char),
    showToast
  );

  charactersModule = initCharactersModule(
    appState,
    navigateTo,
    (charId, sessionId) => chatModule.openChatWithCharacter(charId, sessionId),
    showToast
  );

  // Sidebar navigation bindings
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.view);
    });
  });

  const brandLogo = document.getElementById('brand-home-link');
  if (brandLogo) {
    brandLogo.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('discover');
    });
  }

  const createCta = document.getElementById('sidebar-create-btn');
  if (createCta) {
    createCta.addEventListener('click', () => {
      charactersModule.openStudioForCreate();
    });
  }

  const heroCreateBtn = document.getElementById('hero-create-btn');
  if (heroCreateBtn) {
    heroCreateBtn.addEventListener('click', () => {
      charactersModule.openStudioForCreate();
    });
  }

  const sidebarPersonaPill = document.getElementById('sidebar-persona-pill');
  if (sidebarPersonaPill) {
    sidebarPersonaPill.addEventListener('click', () => {
      navigateTo('personas');
    });
  }

  // Load initial data
  await Promise.all([
    personasModule.loadPersonas(),
    charactersModule.loadCharacters()
  ]);
  await chatModule.loadAllSessions();

  // Check health status
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

  // Route based on current URL path & query parameters
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const charId = params.get('id');

  if ((path.includes('chat.html') || path === '/chat') && charId) {
    await chatModule.openChatWithCharacter(charId);
  } else if (path.includes('create')) {
    charactersModule.openStudioForCreate();
  } else if (path.includes('characters')) {
    navigateTo('characters', false);
  } else if (path.includes('chats')) {
    navigateTo('chats', false);
  } else if (path.includes('personas')) {
    navigateTo('personas', false);
  } else {
    navigateTo('discover', false);
  }

  // Browser back/forward support
  window.addEventListener('popstate', async () => {
    const p = window.location.pathname.toLowerCase();
    const q = new URLSearchParams(window.location.search);
    const id = q.get('id');
    if (p.includes('chat') && id) {
      await chatModule.openChatWithCharacter(id);
    } else if (p.includes('create')) {
      navigateTo('create', false);
    } else if (p.includes('characters')) {
      navigateTo('characters', false);
    } else if (p.includes('chats')) {
      navigateTo('chats', false);
    } else if (p.includes('personas')) {
      navigateTo('personas', false);
    } else {
      navigateTo('discover', false);
    }
  });
});
