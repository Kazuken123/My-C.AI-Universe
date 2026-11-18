import { api } from './api.js';
import { initSidebar, showToast, escapeHtml } from './common.js';

class ChatsPageApp {
  constructor() {
    this.grid = document.getElementById('saved-chats-grid');
  }

  async loadSessions() {
    if (!this.grid) return;
    this.grid.setAttribute('aria-busy', 'true');
    try {
      const sessions = await api.getChatSessions();
      this.renderSessions(sessions);
    } catch {
      this.grid.innerHTML = `<div class="atlas-chat-state" role="alert">
        <h2>Saved chats are unavailable</h2>
        <p>Check your connection and try again.</p>
        <button class="btn-secondary" type="button">Try again</button>
      </div>`;
      this.grid.querySelector('button').addEventListener('click', () => this.loadSessions());
    } finally {
      this.grid.removeAttribute('aria-busy');
    }
  }

  renderSessions(sessions) {
    if (!sessions.length) {
      this.grid.innerHTML = `<div class="atlas-chat-state">
        <h2>No saved chats yet</h2>
        <p>Start a conversation to find it here.</p>
        <a href="/" class="btn-secondary">Browse characters</a>
      </div>`;
      return;
    }

    this.grid.innerHTML = sessions.map(s => {
      const preview = (s.lastMessage || 'Scene opened.').replace(/\*/g, '');
      const updated = new Date(s.updatedAt || s.createdAt).toLocaleDateString();
      const href = `/chat?id=${encodeURIComponent(s.characterId)}&session=${encodeURIComponent(s.id)}`;
      return `<article class="atlas-saved-entry">
        <img class="atlas-saved-avatar" src="${escapeHtml(s.characterAvatar || '/favicon.svg')}" alt="" />
        <div class="atlas-saved-text">
          <h2><a href="${href}">${escapeHtml(s.title || s.characterName)}</a></h2>
          <p class="atlas-saved-meta">${escapeHtml(s.characterName)} · ${s.messageCount ?? 0} messages · ${escapeHtml(updated)}</p>
          <p class="atlas-saved-preview">${escapeHtml(preview)}</p>
        </div>
        <div class="atlas-saved-actions">
          <a href="${href}" class="btn-secondary btn-sm">Resume <i class="ph-light ph-arrow-right" aria-hidden="true"></i></a>
          <button class="icon-btn" data-del-session="${escapeHtml(s.id)}" type="button" aria-label="Delete chat">
            <i class="ph-light ph-trash" aria-hidden="true"></i>
          </button>
        </div>
      </article>`;
    }).join('');

    this.grid.querySelectorAll('[data-del-session]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Permanently delete this saved chat?')) return;
        btn.disabled = true;
        try {
          await api.deleteChatSession(btn.dataset.delSession);
          const entry = btn.closest('article');
          const nextEntry = entry.nextElementSibling || entry.previousElementSibling;
          entry.remove();
          if (!this.grid.querySelector('article')) this.renderSessions([]);
          (nextEntry?.querySelector('a') || this.grid.querySelector('a'))?.focus();
          showToast('Chat deleted.');
          await initSidebar('chats');
        } catch (err) {
          showToast(err.message);
          btn.disabled = false;
        }
      });
    });
  }

  async init() {
    const currentUser = await api.getCurrentUser();
    if (!currentUser) {
      window.location.href = '/auth?mode=signin&return=/chats';
      return;
    }
    await Promise.allSettled([initSidebar('chats'), this.loadSessions()]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new ChatsPageApp();
  app.init();
});
