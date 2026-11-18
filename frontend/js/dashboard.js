import { api } from './api.js';
import { initSidebar, showToast, escapeHtml, formatCount, bindSpotlightHover } from './common.js';

class DashboardApp {
  constructor() {
    this.discoverGrid = document.getElementById('discover-grid');
    this.searchInput = document.getElementById('discoverSearch');
    this.sortSelect = document.getElementById('discoverSort');
    this.status = document.getElementById('roster-status');
    this.retryButton = document.getElementById('refresh-roster');
    this.categoryBar = document.getElementById('category-pills');
    this.hero = document.getElementById('universe-hero');

    this.activeCategory = 'All';
    this.characters = [];
    this.requestId = 0;
  }

  buildCardHtml(char) {
    const spanClass = 'bento-cell';
    const tags = Array.isArray(char.categories) ? char.categories : (char.categories || '').split(',').map(s => s.trim()).filter(Boolean);
    const rawAvatar = char.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(char.name)}`;
    const avatarUrl = rawAvatar.startsWith('/assets/avatars/') ? `${rawAvatar}?v=5` : rawAvatar;

    return `
      <div class="${spanClass}">
        <div class="double-bezel-shell card-shell" data-char-card="${escapeHtml(char.id)}" tabindex="0" role="group" aria-label="Character: ${escapeHtml(char.name)}. Press Enter to open chat." style="cursor: pointer;">
          <div class="double-bezel-core cai-card">
            <div class="cai-card-top">
              <div class="cai-avatar-wrap">
                <img class="cai-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(char.name)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
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
                <button class="like-btn ${char.isLiked ? 'liked' : ''}" data-like-char="${escapeHtml(char.id)}" type="button" title="Like character" aria-label="${char.isLiked ? 'Unlike' : 'Like'} ${escapeHtml(char.name)}" aria-pressed="${Boolean(char.isLiked)}">
                  <i class="${char.isLiked ? 'ph-fill ph-heart' : 'ph-light ph-heart'}"></i>
                  <span>${formatCount(char.likes || 0)}</span>
                </button>
                <span class="mono-tag">${formatCount(char.interactions || 0)} chats</span>
              </div>
              <div class="cai-card-actions">
                <a href="/create?id=${encodeURIComponent(char.id)}" class="icon-btn" data-edit-char="${escapeHtml(char.id)}" title="Edit character" aria-label="Edit ${escapeHtml(char.name)}" onclick="event.stopPropagation();">
                  <i class="ph-light ph-pencil-simple"></i>
                </a>
                <a href="/chat?id=${encodeURIComponent(char.id)}" class="btn-secondary btn-sm" aria-label="Open chat with ${escapeHtml(char.name)}" title="Open chat with ${escapeHtml(char.name)}" data-enter-scene="${escapeHtml(char.id)}" onclick="event.stopPropagation();">
                  <i class="ph-light ph-chat-circle-dots"></i>
                  <span>Open chat</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  buildSkeletonCards(count = 6) {
    return '<div class="orbit-skeleton atlas-portrait-skeleton" aria-hidden="true"></div>'.repeat(count);
  }

  preloadCharacterAvatars(chars) {
    if (!Array.isArray(chars) || !chars.length) return;
    const slice = chars.slice(0, 10);
    for (const char of slice) {
      const rawAvatar = char.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(char.name)}`;
      const avatarUrl = rawAvatar.startsWith('/assets/avatars/') ? `${rawAvatar}?v=5` : rawAvatar;
      if (typeof Image !== 'undefined') {
        const img = new Image();
        img.src = avatarUrl;
        if (typeof img.decode === 'function') img.decode().catch(() => {});
      }
    }
  }

  showPendingCharacters() {
    if (this.hero) this.hero.hidden = Boolean(this.searchInput?.value.trim() || this.activeCategory !== 'All');
    const hasCharacters = this.characters.length > 0;
    this.discoverGrid?.setAttribute('aria-busy', 'true');
    if (this.retryButton) this.retryButton.hidden = true;
    if (this.status) this.status.textContent = hasCharacters
      ? 'Updating characters… Showing previous results.'
      : 'Loading characters…';
    if (!hasCharacters && this.discoverGrid) {
      this.discoverGrid.innerHTML = this.buildSkeletonCards(4);
    }
  }

  async loadCharacters() {
    const requestId = ++this.requestId;
    this.showPendingCharacters();
    const search = this.searchInput?.value.trim() || '';
    const sort = this.sortSelect?.value || 'popular';
    const category = this.activeCategory !== 'All' ? this.activeCategory : '';

    try {
      const characters = await api.getCharacters({ search, category, sort });
      if (requestId !== this.requestId) return;
      const render = () => {
        if (requestId !== this.requestId) return;
        this.characters = Array.isArray(characters) ? characters : [];
        this.renderDiscoverGrid(this.characters);
        this.preloadCharacterAvatars(this.characters);
        if (this.status) this.status.textContent = this.characters.length === 1
          ? '1 character'
          : `${this.characters.length} characters`;
        this.discoverGrid?.setAttribute('aria-busy', 'false');
      };
      if (window.orbitViewTransition) window.orbitViewTransition(render);
      else render();
    } catch {
      if (requestId !== this.requestId) return;
      this.discoverGrid?.setAttribute('aria-busy', 'false');
      if (this.characters.length) {
        if (this.status) this.status.textContent = 'Couldn’t update characters. Showing previous results.';
        if (this.retryButton) this.retryButton.hidden = false;
      } else if (this.discoverGrid) {
        if (this.status) this.status.textContent = '';
        this.discoverGrid.innerHTML = '<div class="orbit-state" role="alert"><h3>Couldn’t load characters</h3><p>Try again to reload the roster.</p><button class="btn-island" id="roster-retry" type="button">Try again</button></div>';
        this.discoverGrid.querySelector('#roster-retry')?.addEventListener('click', () => {
          this.discoverGrid.focus({ preventScroll: true });
          this.loadCharacters();
        });
      }
    }
  }

  renderDiscoverGrid(chars) {
    if (!this.discoverGrid) return;
    if (!chars || chars.length === 0) {
      const hasFilters = this.searchInput?.value.trim() || this.activeCategory !== 'All';
      if (hasFilters) {
        this.discoverGrid.innerHTML = '<div class="orbit-state"><h3>No characters found</h3><p>Try a different name or category.</p><button class="btn-island" type="button" id="clear-roster-filters">Clear filters</button></div>';
        this.discoverGrid.querySelector('#clear-roster-filters')?.addEventListener('click', () => {
          this.resetFilters();
          this.searchInput.focus({ preventScroll: true });
          this.loadCharacters();
        });
        return;
      }
      this.discoverGrid.innerHTML = '<div class="orbit-state"><h3>No characters yet</h3><a href="/create" class="btn-island">Create a character</a></div>';

      const emptyCreateBtn = this.discoverGrid.querySelector('a[href="/create"]');
      if (emptyCreateBtn) {
        emptyCreateBtn.addEventListener('click', (e) => {
          if (!api.getToken()) {
            e.preventDefault();
            window.location.href = `/auth?mode=signin&return=/create`;
          }
        });
      }
      return;
    }

    this.discoverGrid.innerHTML = chars
      .map(c => this.buildCardHtml(c))
      .join('');

    bindSpotlightHover(this.discoverGrid);

    this.discoverGrid.querySelectorAll('[data-char-card]').forEach(card => {
      card.addEventListener('keydown', (event) => {
        if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          card.click();
        }
      });
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        const charId = card.dataset.charCard;
        if (!api.getToken()) {
          window.location.href = `/auth?mode=signin&return=${encodeURIComponent(`/chat?id=${charId}`)}`;
          return;
        }
        window.location.href = `/chat?id=${encodeURIComponent(charId)}`;
      });
    });

    this.discoverGrid.querySelectorAll('[data-enter-scene]').forEach(link => {
      link.addEventListener('click', (e) => {
        const charId = link.dataset.enterScene;
        if (!api.getToken()) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = `/auth?mode=signin&return=${encodeURIComponent(`/chat?id=${charId}`)}`;
        }
      });
    });

    this.discoverGrid.querySelectorAll('[data-edit-char]').forEach(link => {
      link.addEventListener('click', (e) => {
        const charId = link.dataset.editChar;
        if (!api.getToken()) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = `/auth?mode=signin&return=${encodeURIComponent(`/create?id=${charId}`)}`;
        }
      });
    });

    this.discoverGrid.querySelectorAll('[data-like-char]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!api.getToken()) {
          window.location.href = `/auth?mode=signin&return=/`;
          return;
        }
        try {
          if (btn.disabled) return;
          btn.disabled = true;
          await api.toggleLike(btn.dataset.likeChar);
          await this.loadCharacters();
        } catch (err) {
          showToast(err.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  resetFilters() {
    if (this.searchInput) this.searchInput.value = '';
    this.activeCategory = 'All';
    this.categoryBar?.querySelectorAll('.category-pill').forEach(pill => {
      const active = pill.dataset.category === 'All';
      pill.classList.toggle('active', active);
      pill.setAttribute('aria-pressed', String(active));
    });
  }

  async loadLatestScene() {
    const resume = document.getElementById('scene-resume');
    const link = document.getElementById('continue-scene');
    const character = document.getElementById('scene-character');
    const preview = document.getElementById('scene-preview');
    const explore = document.getElementById('explore-characters');
    const token = api.getToken();
    if (!resume || !link || !character || !preview || !explore || !token) return;

    try {
      // The chat history endpoint returns most recently updated sessions first.
      const sessions = await api.getChatSessions();
      const latest = Array.isArray(sessions) ? sessions.find(scene => scene?.id && scene.characterId) : null;
      if (!latest || api.getToken() !== token) return;
      link.href = `/chat?id=${encodeURIComponent(latest.characterId)}&session=${encodeURIComponent(latest.id)}`;
      character.textContent = latest.characterName || latest.title || 'Your last scene';
      preview.textContent = (latest.lastMessage || '').replace(/\*/g, '').trim();
      preview.hidden = !preview.textContent;
      explore.classList.replace('btn-island', 'btn-ghost');
      resume.hidden = false;
    } catch {
      // Keep the public Explore action when chat history is unavailable.
    }
  }

  async init() {
    const sidebarReady = initSidebar('discover');

    this.retryButton?.addEventListener('click', () => {
      this.discoverGrid?.focus({ preventScroll: true });
      this.loadCharacters();
    });

    if (this.categoryBar) {
      this.categoryBar.querySelectorAll('.category-pill').forEach(pill => {
        pill.setAttribute('aria-pressed', String(pill.classList.contains('active')));
        pill.addEventListener('click', () => {
          this.categoryBar.querySelectorAll('.category-pill').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-pressed', 'false'); });
          pill.classList.add('active');
          pill.setAttribute('aria-pressed', 'true');
          this.discoverGrid?.scrollTo({ left: 0, behavior: 'instant' });
          this.activeCategory = pill.dataset.category || 'All';
          this.loadCharacters();
        });
      });
    }

    let searchTimeout;
    document.getElementById('return-to-scene')?.addEventListener('click', () => {
      if (!this.hero?.hidden) return;
      clearTimeout(searchTimeout);
      this.resetFilters();
      this.loadCharacters();
    });

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        this.discoverGrid?.scrollTo({ left: 0, behavior: 'instant' });
        this.requestId++;
        this.showPendingCharacters();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.loadCharacters(), 220);
      });
    }

    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', () => {
        this.discoverGrid?.scrollTo({ left: 0, behavior: 'instant' });
        this.loadCharacters();
      });
    }

    const railNextBtn = document.querySelector('[data-rail-next]');
    if (railNextBtn) {
      const preloadRemaining = () => {
        if (this.characters && this.characters.length > 4) {
          this.preloadCharacterAvatars(this.characters.slice(4));
        }
      };
      railNextBtn.addEventListener('pointerenter', preloadRemaining);
      railNextBtn.addEventListener('focus', preloadRemaining);
    }

    const heroCreateBtn = document.getElementById('hero-create-btn');
    if (heroCreateBtn) {
      heroCreateBtn.addEventListener('click', (e) => {
        if (!api.getToken()) {
          e.preventDefault();
          window.location.href = '/auth?mode=signin&return=/create';
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      if (document.activeElement?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        this.searchInput?.focus();
      }
    });

    await Promise.all([
      this.loadCharacters(),
      this.loadLatestScene(),
      sidebarReady
    ]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new DashboardApp();
  app.init();
});
