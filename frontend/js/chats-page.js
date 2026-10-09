import { api } from './api.js';
import { initSidebar, showToast, escapeHtml, bindSpotlightHover } from './common.js';

class ChatsPageApp {
  constructor() {
    this.grid = document.getElementById('saved-chats-grid');
  }

  async loadSessions() {
    if (!this.grid) return;
    try {
      const sessions = await api.getChatSessions();
      if (!sessions || sessions.length === 0) {
        this.grid.innerHTML = `
          <div class="bento-cell" style="grid-column: 1 / -1;">
            <div class="double-bezel-shell">
              <div class="double-bezel-core studio-card" style="text-align: center; padding: 56px 24px;">
                <h3 class="card-heading">No saved narrative threads yet</h3>
                <p class="hint" style="margin: 8px auto 20px; max-width: 44ch;">
                  Pick any character from the Discovery roster to initiate an active storyline persisted in SQLite.
                </p>
                <a href="/" class="btn-island">
                  <span>Browse Characters</span>
                  <span class="btn-island-icon"><i class="ph-light ph-arrow-right"></i></span>
                </a>
              </div>
            </div>
          </div>
        `;
        return;
      }

      this.grid.innerHTML = sessions.map((s, idx) => `
        <div class="bento-cell bento-half">
          <div class="double-bezel-shell card-shell" data-open-char="${escapeHtml(s.characterId)}" data-open-session="${escapeHtml(s.id)}" style="cursor: pointer;">
            <div class="double-bezel-core cai-card" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div class="cai-card-top">
                  <div class="cai-avatar-wrap">
                    <img class="cai-avatar" src="${escapeHtml(s.characterAvatar || '')}" alt="${escapeHtml(s.characterName)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
                  </div>
                  <div class="cai-card-info">
                    <div class="cai-card-name">${escapeHtml(s.characterName)}</div>
                    <div class="cai-card-creator">Branch ID: ${escapeHtml(s.id.slice(0, 16))}</div>
                    <div class="cai-card-tagline" style="margin-top: 4px;">Last active: ${new Date(s.updatedAt || s.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>

                <div class="thread-snippet-box" style="margin: 14px 0 10px; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; font-style: italic; background: rgba(0,0,0,0.22); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-hairline);">
                  "${escapeHtml((s.lastMessage || 'Scene opened.').replace(/\*/g, '').slice(0, 130))}..."
                </div>
              </div>

              <div class="cai-card-footer" style="margin-top: 10px;">
                <span class="mono-tag">${s.messageCount || 1} Turns</span>
                <div class="cai-card-actions">
                  <button class="icon-btn" data-del-session="${escapeHtml(s.id)}" type="button" title="Delete Saved Thread">
                    <i class="ph-light ph-trash"></i>
                  </button>
                  <a href="/chat.html?id=${encodeURIComponent(s.characterId)}&session=${encodeURIComponent(s.id)}" class="btn-secondary btn-sm" style="text-decoration: none;">
                    <i class="ph-light ph-chats-circle"></i>
                    <span>Resume</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      `).join('');

      bindSpotlightHover(this.grid);

      this.grid.querySelectorAll('[data-open-session]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button') || e.target.closest('a')) return;
          window.location.href = `/chat.html?id=${encodeURIComponent(card.dataset.openChar)}&session=${encodeURIComponent(card.dataset.openSession)}`;
        });
      });

      this.grid.querySelectorAll('[data-del-session]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Permanently delete this saved dialogue thread?')) return;
          try {
            await api.deleteChatSession(btn.dataset.delSession);
            showToast('Thread removed from database.');
            await this.loadSessions();
            await initSidebar('chats');
          } catch (err) {
            showToast(err.message);
          }
        });
      });
    } catch (err) {
      showToast('Could not load saved threads: ' + err.message);
    }
  }

  async init() {
    const currentUser = await api.getCurrentUser();
    if (!currentUser) {
      window.location.href = '/auth.html?mode=signin&return=/chats.html';
      return;
    }
    await initSidebar('chats');
    await this.loadSessions();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new ChatsPageApp();
  app.init();
});
