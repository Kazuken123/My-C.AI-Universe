import { api } from './api.js';
import { initSidebar, showToast } from './common.js';
import { initChatModule } from './chat.js';

class ChatPageApp {
  constructor() {
    this.state = {
      currentUser: null,
      characters: [],
      sessions: [],
      personas: [],
      activePersona: null,
      activeCharacter: null,
      activeSession: null
    };
    this.chatController = null;
  }

  async init() {
    await initSidebar('chats');

    // Load initial personas for persona dropdown
    try {
      this.state.personas = await api.getPersonas();
      this.state.activePersona = this.state.personas.find(p => p.isDefault) || this.state.personas[0];
      const personaSelect = document.getElementById('chatPersonaSelect');
      if (personaSelect) {
        personaSelect.innerHTML = this.state.personas.map(p => `
          <option value="${p.id}" ${p.isDefault ? 'selected' : ''}>${p.name}</option>
        `).join('');
      }
    } catch (err) {
      console.warn('Could not load personas for chat:', err);
    }

    const navFn = (target) => {
      if (target === 'discover') window.location.href = '/';
      else if (target === 'create') window.location.href = '/create.html';
      else if (target === 'chats') window.location.href = '/chats.html';
      else if (target === 'personas') window.location.href = '/personas.html';
    };

    const editFn = (char) => {
      if (char?.id) {
        window.location.href = `/create.html?id=${encodeURIComponent(char.id)}`;
      }
    };

    this.chatController = initChatModule(
      this.state,
      navFn,
      editFn,
      showToast
    );

    await this.chatController.loadAllSessions();

    const params = new URLSearchParams(window.location.search);
    const charId = params.get('id');
    const sessionId = params.get('session');

    if (charId) {
      await this.chatController.openChatWithCharacter(charId, sessionId);
    } else {
      // Find latest character or fallback to first seeded character
      try {
        const chars = await api.getCharacters();
        if (chars && chars.length > 0) {
          await this.chatController.openChatWithCharacter(chars[0].id);
        } else {
          showToast('No characters registered. Redirecting to Studio...');
          setTimeout(() => {
            window.location.href = '/create.html';
          }, 1200);
        }
      } catch (err) {
        showToast('Error loading character: ' + err.message);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new ChatPageApp();
  app.init();
});
