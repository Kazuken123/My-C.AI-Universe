import { api } from './api.js';
import { initSidebar, showToast, escapeHtml, formatCount, bindSpotlightHover } from './common.js';

class DashboardApp {
  constructor() {
    this.discoverGrid = document.getElementById('discover-grid');
    this.heroSpotlightCard = document.getElementById('hero-spotlight-card');
    this.heroStartChatBtn = document.getElementById('hero-start-chat-btn');
    this.searchInput = document.getElementById('discoverSearch');
    this.sortSelect = document.getElementById('discoverSort');
    this.categoryBar = document.getElementById('category-pills');
    this.continueSection = document.getElementById('continue-chatting-section');
    this.continueRow = document.getElementById('continue-chatting-row');

    this.activeCategory = 'All';
    this.characters = [];
  }

  getBentoSpanClass(index, total) {
    if (total === 1) return 'bento-cell bento-wide';
    if (total === 2) return 'bento-cell bento-half';
    if (total === 4) return 'bento-cell bento-half';
    if (total === 5) {
      return index < 2 ? 'bento-cell bento-half' : 'bento-cell';
    }
    if (index === 0 && total >= 3) {
      const rem = (total - 2) % 3;
      if (rem === 0 || rem === 2) return 'bento-cell bento-wide';
    }
    if (total > 5 && index >= total - 2 && (total - 2) % 3 === 2) {
      return 'bento-cell bento-half';
    }
    return 'bento-cell';
  }

  buildCardHtml(char, index, total) {
    const spanClass = this.getBentoSpanClass(index, total);
    const tags = Array.isArray(char.categories) ? char.categories : (char.categories || '').split(',').map(s => s.trim()).filter(Boolean);
    const avatarUrl = char.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(char.name)}`;

    return `
      <div class="${spanClass}">
        <div class="double-bezel-shell card-shell" data-char-card="${escapeHtml(char.id)}" style="cursor: pointer;">
          <div class="double-bezel-core cai-card">
            <div class="cai-card-top">
              <div class="cai-avatar-wrap">
                <img class="cai-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(char.name)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
              </div>
              <div class="cai-card-info">
                <div class="cai-card-name">${escapeHtml(char.name)}</div>
                <div class="cai-card-creator">Authored by ${escapeHtml((char.creator && char.creator !== '@you') ? char.creator : '@community')}</div>
                <div class="cai-card-tagline">${escapeHtml(char.tagline || '')}</div>
              </div>
            </div>

            <div class="cai-card-tags">
              ${tags.slice(0, 3).map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('')}
            </div>

            <div class="cai-card-footer">
              <div class="cai-card-stats">
                <button class="like-btn ${char.isLiked ? 'liked' : ''}" data-like-char="${escapeHtml(char.id)}" type="button" title="Like character">
                  <i class="${char.isLiked ? 'ph-fill ph-heart' : 'ph-light ph-heart'}"></i>
                  <span>${formatCount(char.likes || 0)}</span>
                </button>
                <span class="mono-tag">${formatCount(char.interactions || 0)} chats</span>
              </div>
              <div class="cai-card-actions">
                <a href="/create.html?id=${encodeURIComponent(char.id)}" class="icon-btn" data-edit-char="${escapeHtml(char.id)}" title="Edit Architecture" onclick="event.stopPropagation();">
                  <i class="ph-light ph-pencil-simple"></i>
                </a>
                <a href="/chat.html?id=${encodeURIComponent(char.id)}" class="btn-secondary btn-sm" data-enter-scene="${escapeHtml(char.id)}" onclick="event.stopPropagation();">
                  <i class="ph-light ph-chat-circle-dots"></i>
                  <span>Enter Scene</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async loadCharacters() {
    try {
      const search = this.searchInput?.value.trim() || '';
      const sort = this.sortSelect?.value || 'popular';
      const category = this.activeCategory !== 'All' ? this.activeCategory : '';

      this.characters = await api.getCharacters({ search, category, sort });
      this.renderDiscoverGrid(this.characters);

      if (!search && this.activeCategory === 'All' && this.characters.length > 0) {
        this.renderHeroSpotlight(this.characters[0]);
      }
    } catch (err) {
      showToast('Could not load character roster: ' + err.message);
    }
  }

  renderHeroSpotlight(topChar) {
    if (!this.heroSpotlightCard || !topChar) return;
    const tags = Array.isArray(topChar.categories) ? topChar.categories : (topChar.categories || '').split(',').map(s => s.trim()).filter(Boolean);
    const avatarUrl = topChar.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(topChar.name)}`;
    const creator = (topChar.creator && topChar.creator !== '@you') ? topChar.creator : '@community';

    if (this.heroStartChatBtn) {
      this.heroStartChatBtn.href = `/chat.html?id=${encodeURIComponent(topChar.id)}`;
      this.heroStartChatBtn.onclick = (e) => {
        if (!api.getToken()) {
          e.preventDefault();
          window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(`/chat.html?id=${topChar.id}`)}`;
        }
      };
    }

    // Clean scene opening quote excerpt
    const rawGreeting = (topChar.greeting || topChar.personality || 'Scene awaits your arrival...').trim();
    const cleanExcerpt = rawGreeting
      .replace(/\*/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    const excerpt = cleanExcerpt.length > 155 ? cleanExcerpt.slice(0, 152) + '...' : cleanExcerpt;

    this.heroSpotlightCard.innerHTML = `
      <div class="hero-spotlight-dossier" id="hero-spotlight-dossier-card" role="button" tabindex="0" title="Click to start scene with ${escapeHtml(topChar.name)}">
        <div class="dossier-header-strip">
          <div class="dossier-avatar-wrap">
            <img class="dossier-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(topChar.name)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
            <span class="dossier-live-dot" title="Ready for scene"></span>
          </div>
          <div class="dossier-header-meta">
            <div class="dossier-badge-row">
              <span class="soul-id-badge"><span class="soul-dot"></span>FEATURED CANON</span>
              <span class="dossier-creator-badge">${escapeHtml(creator)}</span>
            </div>
            <div class="dossier-name">${escapeHtml(topChar.name)}</div>
            <div class="dossier-tagline">${escapeHtml(topChar.tagline || 'AI Roleplay Model')}</div>
          </div>
        </div>

        <div class="dossier-bio">
          <span class="dossier-quote-mark">“</span>${escapeHtml(excerpt)}
        </div>

        <div class="dossier-stats-grid">
          <div class="dossier-meta-card">
            <span class="dossier-meta-label"><i class="ph-light ph-chats-circle"></i> Chats</span>
            <span class="dossier-meta-val">${formatCount(topChar.interactions || 0)}</span>
          </div>
          <div class="dossier-meta-card">
            <span class="dossier-meta-label"><i class="ph-light ph-heart"></i> Likes</span>
            <span class="dossier-meta-val">${formatCount(topChar.likes || 0)}</span>
          </div>
          <div class="dossier-meta-card">
            <span class="dossier-meta-label"><i class="ph-light ph-tag"></i> Genre</span>
            <span class="dossier-meta-val">${escapeHtml(tags[0] || 'Canon')}</span>
          </div>
        </div>

        <div class="dossier-footer-bar">
          <div class="dossier-tags-wrap">
            ${tags.slice(0, 2).map(t => `<span class="dossier-pill-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
          <div class="dossier-cta-btn">
            <span>Enter Scene</span>
            <i class="ph-light ph-arrow-up-right"></i>
          </div>
        </div>
      </div>
    `;

    const dossierCard = this.heroSpotlightCard.querySelector('#hero-spotlight-dossier-card');
    if (dossierCard) {
      const enterScene = () => {
        if (!api.getToken()) {
          window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(`/chat.html?id=${topChar.id}`)}`;
          return;
        }
        window.location.href = `/chat.html?id=${encodeURIComponent(topChar.id)}`;
      };
      dossierCard.addEventListener('click', enterScene);
      dossierCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          enterScene();
        }
      });
    }
  }

  renderDiscoverGrid(chars) {
    if (!this.discoverGrid) return;
    if (!chars || chars.length === 0) {
      this.discoverGrid.innerHTML = `
        <div class="bento-cell" style="grid-column: 1 / -1;">
          <div class="double-bezel-shell">
            <div class="double-bezel-core studio-card" style="text-align: center; padding: 48px 24px;">
              <h3 class="card-heading">No matching characters in directory</h3>
              <p class="hint" style="margin: 8px auto 20px; max-width: 44ch;">Clear your search filter or synthesize a fresh character in the Studio.</p>
              <a href="/create.html" class="btn-island">
                <span>Create Character</span>
                <span class="btn-island-icon"><i class="ph-light ph-plus"></i></span>
              </a>
            </div>
          </div>
        </div>
      `;

      const emptyCreateBtn = this.discoverGrid.querySelector('a[href="/create.html"]');
      if (emptyCreateBtn) {
        emptyCreateBtn.addEventListener('click', (e) => {
          if (!api.getToken()) {
            e.preventDefault();
            window.location.href = `/auth.html?mode=signin&return=/create.html`;
          }
        });
      }
      return;
    }

    this.discoverGrid.innerHTML = chars
      .map((c, idx) => this.buildCardHtml(c, idx, chars.length))
      .join('');

    bindSpotlightHover(this.discoverGrid);

    this.discoverGrid.querySelectorAll('[data-char-card]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        const charId = card.dataset.charCard;
        if (!api.getToken()) {
          window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(`/chat.html?id=${charId}`)}`;
          return;
        }
        window.location.href = `/chat.html?id=${encodeURIComponent(charId)}`;
      });
    });

    this.discoverGrid.querySelectorAll('[data-enter-scene]').forEach(link => {
      link.addEventListener('click', (e) => {
        const charId = link.dataset.enterScene;
        if (!api.getToken()) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(`/chat.html?id=${charId}`)}`;
        }
      });
    });

    this.discoverGrid.querySelectorAll('[data-edit-char]').forEach(link => {
      link.addEventListener('click', (e) => {
        const charId = link.dataset.editChar;
        if (!api.getToken()) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(`/create.html?id=${charId}`)}`;
        }
      });
    });

    this.discoverGrid.querySelectorAll('[data-like-char]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!api.getToken()) {
          window.location.href = `/auth.html?mode=signin&return=/`;
          return;
        }
        try {
          await api.toggleLike(btn.dataset.likeChar);
          await this.loadCharacters();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  async loadActiveStorylines() {
    if (!this.continueSection || !this.continueRow) return;
    if (!api.getToken()) {
      this.continueSection.style.display = 'none';
      return;
    }
    try {
      const sessions = await api.getChatSessions();
      if (!sessions || sessions.length === 0) {
        this.continueSection.style.display = 'none';
        return;
      }

      this.continueSection.style.display = 'block';
      this.continueRow.innerHTML = sessions.slice(0, 3).map(s => `
        <a href="/chat.html?id=${encodeURIComponent(s.characterId)}&session=${encodeURIComponent(s.id)}" class="double-bezel-shell card-shell continue-card-link" style="text-decoration: none; color: inherit;">
          <div class="double-bezel-core cai-card" style="padding: 14px 16px;">
            <div class="cai-card-top">
              <img class="cai-avatar" src="${escapeHtml(s.characterAvatar || '')}" alt="${escapeHtml(s.characterName)}" style="width: 36px; height: 36px;" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
              <div class="cai-card-info">
                <div class="cai-card-name" style="font-size: 0.88rem;">${escapeHtml(s.characterName)}</div>
                <div class="cai-card-tagline" style="font-size: 0.72rem;">${escapeHtml((s.lastMessage || '').replace(/\*/g, '').slice(0, 50))}</div>
              </div>
            </div>
          </div>
        </a>
      `).join('');

      bindSpotlightHover(this.continueRow);
    } catch {
      this.continueSection.style.display = 'none';
    }
  }

  async init() {
    await initSidebar('discover');

    if (this.categoryBar) {
      this.categoryBar.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          this.categoryBar.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          this.activeCategory = pill.dataset.category || 'All';
          this.loadCharacters();
        });
      });
    }

    if (this.searchInput) {
      let timeout;
      this.searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.loadCharacters(), 220);
      });
    }

    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', () => this.loadCharacters());
    }

    const heroCreateBtn = document.getElementById('hero-create-btn');
    if (heroCreateBtn) {
      heroCreateBtn.addEventListener('click', (e) => {
        if (!api.getToken()) {
          e.preventDefault();
          window.location.href = '/auth.html?mode=signin&return=/create.html';
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '/') {
        e.preventDefault();
        this.searchInput?.focus();
      }
    });

    await Promise.all([
      this.loadCharacters(),
      this.loadActiveStorylines()
    ]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new DashboardApp();
  app.init();
});
