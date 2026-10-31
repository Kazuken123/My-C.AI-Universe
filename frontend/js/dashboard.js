import { api } from './api.js';
import { initSidebar, showToast, escapeHtml, formatCount, bindSpotlightHover, deduplicateSessionsByCharacter } from './common.js';

class DashboardApp {
  constructor() {
    this.discoverGrid = document.getElementById('discover-grid');
    this.searchInput = document.getElementById('discoverSearch');
    this.sortSelect = document.getElementById('discoverSort');
    this.categoryBar = document.getElementById('category-pills');
    this.continueSection = document.getElementById('continue-chatting-section');
    this.continueRow = document.getElementById('continue-chatting-row');

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

  async loadCharacters() {
    const requestId = ++this.requestId;
    const status = document.getElementById('roster-status');
    this.discoverGrid?.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Finding your next connection…';
    if (this.discoverGrid && !this.characters.length) {
      this.discoverGrid.innerHTML = Array.from({ length: 8 }, () => '<div class="orbit-skeleton" aria-hidden="true"></div>').join('');
    }
    try {
      const search = this.searchInput?.value.trim() || '';
      const sort = this.sortSelect?.value || 'popular';
      const category = this.activeCategory !== 'All' ? this.activeCategory : '';
      const filtered = Boolean(search || category);
      document.querySelectorAll('.orbit-hero, .orbit-strip').forEach(section => { section.hidden = filtered; });
      const heading = document.getElementById('roster-heading');
      if (heading) heading.textContent = filtered ? 'Find your kind of story' : 'Discover your next connection';

      const characters = await api.getCharacters({ search, category, sort });
      if (requestId !== this.requestId) return;
      this.characters = Array.isArray(characters) ? characters : [];
      this.renderDiscoverGrid(this.characters);
      if (status) status.textContent = `${this.characters.length} characters. Endless ways to begin.`;

    } catch (err) {
      if (requestId !== this.requestId) return;
      if (status) status.textContent = 'Your universe will be right back.';
      if (this.discoverGrid) {
        this.discoverGrid.innerHTML = '<div class="orbit-state" role="alert"><h3>A little pause in the story.</h3><p>We couldn’t load the characters. Please try again.</p><button class="btn-island" id="roster-retry" type="button">Try again ↗</button></div>';
        this.discoverGrid.querySelector('#roster-retry')?.addEventListener('click', () => this.loadCharacters());
      }
    } finally {
      if (requestId === this.requestId) this.discoverGrid?.setAttribute('aria-busy', 'false');
    }
  }

  renderDiscoverGrid(chars) {
    if (!this.discoverGrid) return;
    if (!chars || chars.length === 0) {
      const hasFilters = this.searchInput?.value.trim() || this.activeCategory !== 'All';
      if (hasFilters) {
        this.discoverGrid.innerHTML = '<div class="orbit-state"><h3>No characters found. Yet.</h3><p>Try a different name or explore another genre.</p><button class="btn-island" type="button" id="clear-roster-filters">Clear filters</button></div>';
        this.discoverGrid.querySelector('#clear-roster-filters')?.addEventListener('click', () => {
          this.searchInput.value = '';
          this.activeCategory = 'All';
          this.categoryBar?.querySelectorAll('.category-pill').forEach(pill => {
            const active = pill.dataset.category === 'All';
            pill.classList.toggle('active', active);
            pill.setAttribute('aria-pressed', String(active));
          });
          this.loadCharacters();
        });
        return;
      }
      this.discoverGrid.innerHTML = `
        <div class="bento-cell" style="grid-column: 1 / -1;">
          <div class="double-bezel-shell">
            <div class="double-bezel-core studio-card" style="text-align: center; padding: 48px 24px;">
              <h3 class="card-heading">Your universe starts here.</h3>
              <p class="hint" style="margin: 8px auto 20px; max-width: 44ch;">Create your first character and give a new story a beginning.</p>
              <a href="/create" class="btn-island">
                <span>Create Character</span>
                <span class="btn-island-icon"><i class="ph-light ph-plus"></i></span>
              </a>
            </div>
          </div>
        </div>
      `;

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

  async loadActiveStorylines() {
    if (!this.continueSection || !this.continueRow) return;
    if (!api.getToken()) {
      this.continueSection.style.display = 'none';
      return;
    }
    try {
      const rawSessions = await api.getChatSessions();
      const sessions = deduplicateSessionsByCharacter(rawSessions);
      if (!sessions || sessions.length === 0) {
        this.continueSection.style.display = 'none';
        return;
      }

      this.continueSection.style.display = 'block';
      this.continueRow.innerHTML = sessions.slice(0, 3).map(s => `
        <a href="/chat?id=${encodeURIComponent(s.characterId)}&session=${encodeURIComponent(s.id)}" class="double-bezel-shell card-shell continue-card-link" style="text-decoration: none; color: inherit;">
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
    const sidebarReady = initSidebar('discover');

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

    if (this.searchInput) {
      let timeout;
      this.searchInput.addEventListener('input', () => {
        this.discoverGrid?.scrollTo({ left: 0, behavior: 'instant' });
        this.requestId++;
        clearTimeout(timeout);
        timeout = setTimeout(() => this.loadCharacters(), 220);
      });
    }

    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', () => {
        this.discoverGrid?.scrollTo({ left: 0, behavior: 'instant' });
        this.loadCharacters();
      });
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
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '/') {
        e.preventDefault();
        this.searchInput?.focus();
      }
    });

    await Promise.all([
      this.loadCharacters(),
      this.loadActiveStorylines(),
      sidebarReady
    ]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new DashboardApp();
  app.init();
});
