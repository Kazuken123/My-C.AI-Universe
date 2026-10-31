import { api } from './api.js';

export function formatCount(num) {
  const n = Number(num) || 0;
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Compute Asymmetric Bento Grid span classes that guarantee zero empty cells
 * (design-taste-frontend Section 4.7: BENTO CELL COUNT RULE)
 */
function getBentoSpanClass(index, total) {
  if (total === 1) return 'bento-cell bento-wide';
  if (total === 2) return 'bento-cell bento-half';
  if (total === 4) return 'bento-cell bento-half';
  if (total === 5) {
    // 2 + 3 asymmetric split (6+6 on row 1, 4+4+4 on row 2)
    return index < 2 ? 'bento-cell bento-half' : 'bento-cell';
  }
  // For 3, 6, 7+: First card is wide (8 cols) paired with 4-col card, rest flow in 4s or 6s
  if (index === 0 && total >= 3) {
    const remainderAfterFirstRow = (total - 2) % 3;
    if (remainderAfterFirstRow === 0) return 'bento-cell bento-wide';
    if (remainderAfterFirstRow === 2) return 'bento-cell bento-wide';
  }
  if (total > 5 && index >= total - 2 && (total - 2) % 3 === 2) {
    return 'bento-cell bento-half';
  }
  return 'bento-cell';
}

/**
 * Attach GPU-safe cursor spotlight tracking to Double-Bezel shells
 */
export function bindSpotlightHover(container) {
  if (!container) return;
  container.querySelectorAll('.double-bezel-shell').forEach(shell => {
    shell.addEventListener('pointermove', (e) => {
      const rect = shell.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      shell.style.setProperty('--mouse-x', `${x}px`);
      shell.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

export function initCharactersModule(appState, navigateTo, openChatWithCharacter, showToast) {
  const discoverGrid = document.getElementById('discover-grid');
  const myCharsGrid = document.getElementById('my-characters-grid');
  const heroSpotlightCard = document.getElementById('hero-spotlight-card');
  const searchInput = document.getElementById('discoverSearch');
  const sortSelect = document.getElementById('discoverSort');
  const categoryBar = document.getElementById('category-pills');

  // Studio elements
  const studioTitle = document.getElementById('studio-heading');
  const studioForm = document.getElementById('studio-form');
  const editCharIdInput = document.getElementById('studioCharId');
  const nameInput = document.getElementById('charNameInput');
  const taglineInput = document.getElementById('charTaglineInput');
  const avatarInput = document.getElementById('charAvatarInput');
  const categoriesInput = document.getElementById('charCategoriesInput');
  const greetingInput = document.getElementById('charGreetingInput');
  const personalityInput = document.getElementById('charPersonalityInput');
  const appearanceInput = document.getElementById('charAppearanceInput');
  const abilitiesInput = document.getElementById('charAbilitiesInput');
  const backgroundInput = document.getElementById('charBackgroundInput');
  const speakingStyleInput = document.getElementById('charSpeakingStyleInput');
  const exampleDialoguesInput = document.getElementById('charExampleDialoguesInput');
  const initialMemoryInput = document.getElementById('charInitialMemoryInput');
  const wikiUrlInput = document.getElementById('charWikiInput');
  const aiConceptInput = document.getElementById('aiConceptInput');

  const btnExtractWiki = document.getElementById('btnExtractWiki');
  const btnGenerateAI = document.getElementById('btnGenerateAI');
  const btnRandomAvatar = document.getElementById('btnRandomAvatar');
  const btnResetStudio = document.getElementById('btnResetStudio');

  // Live Preview elements
  const previewAvatar = document.getElementById('preview-avatar');
  const previewName = document.getElementById('preview-name');
  const previewTagline = document.getElementById('preview-tagline');
  const previewTags = document.getElementById('preview-tags');
  const previewGreeting = document.getElementById('preview-greeting');

  let activeCategory = 'All';

  async function loadCharacters() {
    try {
      const search = searchInput ? searchInput.value.trim() : '';
      const sort = sortSelect ? sortSelect.value : 'popular';
      const chars = await api.getCharacters({
        search,
        category: activeCategory,
        sort
      });
      appState.characters = chars;
      renderDiscoverGrid(chars);
      renderMyCharactersGrid(chars);
      updateHeroSpotlight(chars);
    } catch (error) {
      console.error('Failed to load characters:', error);
      showToast('Failed to load characters: ' + error.message);
    }
  }

  function updateHeroSpotlight(chars) {
    if (!chars || chars.length === 0) return;
    const featured = chars[0];
    const heroStartBtn = document.getElementById('hero-start-chat-btn');
    if (heroStartBtn) {
      heroStartBtn.onclick = () => openChatWithCharacter(featured.id);
    }

    if (heroSpotlightCard) {
      const rawAvatar = featured.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(featured.name)}`;
      const avatarUrl = rawAvatar.startsWith('/assets/avatars/') ? `${rawAvatar}?v=5` : rawAvatar;
      const tags = Array.isArray(featured.categories) ? featured.categories : (featured.categories || '').split(',').map(s => s.trim()).filter(Boolean);
      const creator = (featured.creator && featured.creator !== '@you') ? featured.creator : '@community';
      heroSpotlightCard.innerHTML = `
        <article class="hero-spotlight-dossier" data-spotlight-char="${escapeHtml(featured.id)}" role="button" tabindex="0" title="Click to enter scene with ${escapeHtml(featured.name)}">
          <div class="dossier-header-strip">
            <div class="dossier-avatar-wrap">
              <img class="dossier-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(featured.name)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
              <span class="dossier-live-dot" title="Ready for scene"></span>
            </div>
            <div class="dossier-header-meta">
              <div class="dossier-badge-row">
                <span class="soul-id-badge"><span class="soul-dot"></span>FEATURED CANON</span>
                <span class="dossier-creator-badge">${escapeHtml(creator)}</span>
              </div>
              <div class="dossier-name">${escapeHtml(featured.name)}</div>
              <div class="dossier-tagline">${escapeHtml(featured.tagline || 'Canonical Roleplay Character')}</div>
            </div>
          </div>

          <div class="dossier-stats-grid">
            <div class="dossier-meta-card">
              <span class="dossier-meta-label"><i class="ph-light ph-chats-circle"></i> Chats</span>
              <span class="dossier-meta-val">${formatCount(featured.interactions || 0)}</span>
            </div>
            <div class="dossier-meta-card">
              <span class="dossier-meta-label"><i class="ph-light ph-heart"></i> Likes</span>
              <span class="dossier-meta-val">${formatCount(featured.likes || 0)}</span>
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
        </article>
      `;

      const dossierEl = heroSpotlightCard.querySelector('[data-spotlight-char]');
      if (dossierEl) {
        dossierEl.addEventListener('click', () => openChatWithCharacter(featured.id));
        dossierEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openChatWithCharacter(featured.id);
          }
        });
      }
    }
  }

  function buildCharacterCardHtml(char, index, total, showManageActions = false) {
    const rawAvatar = char.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(char.name)}`;
    const avatarUrl = rawAvatar.startsWith('/assets/avatars/') ? `${rawAvatar}?v=5` : rawAvatar;
    const tags = Array.isArray(char.categories) ? char.categories : ['Roleplay'];
    const summary = char.tagline || (char.personality ? char.personality.slice(0, 95) : 'Interactive Character');
    const spanClass = getBentoSpanClass(index, total);
    const isWide = spanClass.includes('bento-wide') || spanClass.includes('bento-half');
    const cleanOpening = (char.greeting || '').replace(/\*/g, '').replace(/\n+/g, ' ').trim().slice(0, 125);

    return `
      <div class="${spanClass}">
        <div class="double-bezel-shell card-shell" data-char-card="${escapeHtml(char.id)}">
          <article class="double-bezel-core cai-card">
            <div class="cai-card-top">
              <div class="cai-avatar-wrap">
                <img class="cai-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(char.name)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
                <div class="voice-wave-visualizer" aria-hidden="true" title="Voice Audio Ready">
                  <span class="voice-wave-bar"></span>
                  <span class="voice-wave-bar"></span>
                  <span class="voice-wave-bar"></span>
                  <span class="voice-wave-bar"></span>
                </div>
              </div>
              <div class="cai-card-info">
                <div class="cai-card-header-line">
                  <h3 class="cai-card-name">${escapeHtml(char.name)}</h3>
                  <span class="soul-id-badge"><span class="soul-dot"></span>SOUL-ID</span>
                  <span class="cai-card-creator">${escapeHtml(char.creator || '@system')}</span>
                </div>
                <p class="cai-card-tagline">${escapeHtml(summary)}</p>
              </div>
            </div>

            ${isWide && cleanOpening ? `
              <div class="cai-card-dialogue-preview">
                "${escapeHtml(cleanOpening)}..."
              </div>
            ` : ''}

            <div class="cai-card-tags">
              ${tags.slice(0, 3).map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('')}
              ${char.wiki ? `<span class="tag-badge" title="Fandom/Wikipedia Linked"><i class="ph-light ph-globe-hemisphere-west"></i> Canon Wiki</span>` : ''}
              <span class="cinema-meta-tag"><i class="ph-light ph-film-strip"></i> 4K</span>
            </div>

            <div class="cai-card-footer">
              <div class="card-stats">
                <span class="stat-item" title="Total Interactions">
                  <i class="ph-light ph-chat-circle-text"></i>
                  <span>${formatCount(char.interactions || 0)}</span>
                </span>
                <button class="like-btn ${char.isLiked ? 'liked' : ''}" data-like-char="${escapeHtml(char.id)}" type="button" title="Endorse Character">
                  <i class="${char.isLiked ? 'ph-fill ph-heart' : 'ph-light ph-heart'}"></i>
                  <span>${formatCount(char.likes || 0)}</span>
                </button>
              </div>
              <div class="card-actions">
                <button class="btn-secondary btn-sm" data-edit-char="${escapeHtml(char.id)}" type="button" title="Edit Dossier">
                  <i class="ph-light ph-sliders"></i>
                </button>
                ${showManageActions ? `
                  <button class="btn-danger btn-sm" data-delete-char="${escapeHtml(char.id)}" type="button" title="Delete Character">
                    <i class="ph-light ph-trash"></i>
                  </button>
                ` : ''}
                <button class="btn-primary btn-sm" data-chat-char="${escapeHtml(char.id)}" type="button">
                  <span>Enter Scene</span>
                  <i class="ph-light ph-arrow-up-right"></i>
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    `;
  }

  function bindCardEvents(container) {
    if (!container) return;

    bindSpotlightHover(container);

    container.querySelectorAll('[data-char-card]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openChatWithCharacter(card.dataset.charCard);
      });
    });

    container.querySelectorAll('[data-chat-char]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openChatWithCharacter(btn.dataset.chatChar);
      });
    });

    container.querySelectorAll('[data-edit-char]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const char = await api.getCharacter(btn.dataset.editChar);
          openStudioForEdit(char);
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    container.querySelectorAll('[data-delete-char]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.deleteChar;
        if (!confirm('Delete this character and all associated SQL chat sessions?')) return;
        try {
          await api.deleteCharacter(id);
          showToast('Character removed from SQL database.');
          await loadCharacters();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    container.querySelectorAll('[data-like-char]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!api.getToken()) {
          window.location.href = `/auth?mode=signin&return=/`;
          return;
        }
        try {
          await api.toggleLike(btn.dataset.likeChar);
          await loadCharacters();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  function renderDiscoverGrid(chars) {
    if (!discoverGrid) return;
    if (!chars || chars.length === 0) {
      discoverGrid.innerHTML = `
        <div class="bento-cell" style="grid-column: 1 / -1;">
          <div class="double-bezel-shell">
            <div class="double-bezel-core studio-card" style="text-align: center; padding: 48px 24px;">
              <h3 class="card-heading">No matching characters in directory</h3>
              <p class="hint" style="margin: 8px auto 20px; max-width: 44ch;">Clear your active search query or author a new character profile in the Studio.</p>
              <button class="btn-island" id="empty-create-btn" type="button">
                <span>Create Character</span>
                <span class="btn-island-icon"><i class="ph-light ph-plus"></i></span>
              </button>
            </div>
          </div>
        </div>
      `;
      const btn = document.getElementById('empty-create-btn');
      if (btn) btn.onclick = () => openStudioForCreate();
      return;
    }

    discoverGrid.innerHTML = chars
      .map((c, idx) => buildCharacterCardHtml(c, idx, chars.length, false))
      .join('');
    bindCardEvents(discoverGrid);
  }

  function renderMyCharactersGrid(chars) {
    if (!myCharsGrid) return;
    if (!chars || chars.length === 0) {
      myCharsGrid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1 / -1;">No characters registered yet.</p>`;
      return;
    }
    myCharsGrid.innerHTML = chars
      .map((c, idx) => buildCharacterCardHtml(c, idx, chars.length, true))
      .join('');
    bindCardEvents(myCharsGrid);
  }

  // Category & search filters
  if (categoryBar) {
    categoryBar.querySelectorAll('.category-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        categoryBar.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeCategory = pill.dataset.category || 'All';
        loadCharacters();
      });
    });
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadCharacters, 200);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', loadCharacters);
  }

  // Live preview updater in Studio
  function updateStudioPreview() {
    const name = (nameInput?.value || '').trim() || 'New Character';
    const tagline = (taglineInput?.value || '').trim() || 'AI Roleplay Character';
    const avatar = (avatarInput?.value || '').trim() ||
      `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}`;
    const cats = (categoriesInput?.value || 'Roleplay, Original')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const greeting = (greetingInput?.value || '').trim() ||
      `*${name} turns toward you.*\n\n${name}: "Ready to begin our scene?"`;

    if (previewAvatar) previewAvatar.src = avatar;
    if (previewName) previewName.textContent = name;
    if (previewTagline) previewTagline.textContent = tagline;
    if (previewTags) {
      previewTags.innerHTML = cats.map(c => `<span class="tag-badge">${escapeHtml(c)}</span>`).join('');
    }
    if (previewGreeting) {
      previewGreeting.innerHTML = greeting
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }
  }

  [nameInput, taglineInput, avatarInput, categoriesInput, greetingInput].forEach(el => {
    if (el) el.addEventListener('input', updateStudioPreview);
  });

  if (btnRandomAvatar) {
    btnRandomAvatar.addEventListener('click', () => {
      const seed = (nameInput?.value || 'Character') + '_' + Math.floor(Math.random() * 9999);
      avatarInput.value = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
      updateStudioPreview();
    });
  }

  // 1-Click Wiki Extraction
  if (btnExtractWiki) {
    btnExtractWiki.addEventListener('click', async () => {
      const url = wikiUrlInput?.value.trim();
      if (!url) {
        showToast('Paste a Fandom or Wikipedia URL first.');
        return;
      }
      btnExtractWiki.disabled = true;
      btnExtractWiki.innerHTML = '<i class="ph-light ph-spinner"></i> <span>Extracting...</span>';
      try {
        const data = await api.parseWikiPreview(url);
        const charData = data.character || data;
        if (charData.name) nameInput.value = charData.name;
        if (charData.tagline) taglineInput.value = charData.tagline;
        if (charData.avatar) avatarInput.value = charData.avatar;
        if (charData.greeting) greetingInput.value = charData.greeting;
        if (charData.personality) personalityInput.value = charData.personality;
        if (charData.appearance) appearanceInput.value = charData.appearance;
        if (charData.abilities) abilitiesInput.value = charData.abilities;
        if (charData.background) backgroundInput.value = charData.background;
        if (charData.speaking_style) speakingStyleInput.value = charData.speaking_style;
        if (charData.initial_memory) initialMemoryInput.value = charData.initial_memory;
        if (Array.isArray(charData.categories) && charData.categories.length > 0) {
          categoriesInput.value = charData.categories.join(', ');
        }
        updateStudioPreview();
        showToast(`Extracted canon profile for ${charData.name || 'character'}!`);
      } catch (error) {
        showToast('Wiki extraction error: ' + error.message);
      } finally {
        btnExtractWiki.disabled = false;
        btnExtractWiki.innerHTML = '<i class="ph-light ph-globe-hemisphere-west"></i> <span>Extract Lore</span>';
      }
    });
  }

  // AI Character Concept Generator
  if (btnGenerateAI) {
    btnGenerateAI.addEventListener('click', async () => {
      const concept = aiConceptInput?.value.trim();
      if (!concept) {
        showToast('Enter a character concept prompt first.');
        return;
      }
      btnGenerateAI.disabled = true;
      btnGenerateAI.innerHTML = '<i class="ph-light ph-spinner"></i> <span>Synthesizing...</span>';
      try {
        const data = await api.generateCharacterAI(concept);
        if (data.name) nameInput.value = data.name;
        if (data.tagline) taglineInput.value = data.tagline;
        if (data.avatar) avatarInput.value = data.avatar;
        if (data.greeting) greetingInput.value = data.greeting;
        if (data.personality) personalityInput.value = data.personality;
        if (data.appearance) appearanceInput.value = data.appearance;
        if (data.abilities) abilitiesInput.value = data.abilities;
        if (data.background) backgroundInput.value = data.background;
        if (data.speaking_style) speakingStyleInput.value = data.speaking_style;
        if (data.example_dialogues) exampleDialoguesInput.value = data.example_dialogues;
        if (data.initial_memory) initialMemoryInput.value = data.initial_memory;
        if (Array.isArray(data.categories)) {
          categoriesInput.value = data.categories.join(', ');
        }
        updateStudioPreview();
        showToast('Synthesized complete character profile.');
      } catch (error) {
        showToast('AI Generator error: ' + error.message);
      } finally {
        btnGenerateAI.disabled = false;
        btnGenerateAI.innerHTML = '<i class="ph-light ph-magic-wand"></i> <span>Synthesize</span>';
      }
    });
  }

  function openStudioForCreate() {
    if (!api.getToken()) {
      window.location.href = '/auth?mode=signin&return=/create';
      return;
    }
    if (studioForm) studioForm.reset();
    if (editCharIdInput) editCharIdInput.value = '';
    if (studioTitle) studioTitle.textContent = 'Character Architecture Studio';
    if (categoriesInput) categoriesInput.value = 'Anime, Roleplay';
    updateStudioPreview();
    navigateTo('create');
  }

  function openStudioForEdit(char) {
    if (!char) return;
    if (!api.getToken()) {
      window.location.href = `/auth?mode=signin&return=${encodeURIComponent(`/create?id=${char.id}`)}`;
      return;
    }
    if (editCharIdInput) editCharIdInput.value = char.id;
    if (studioTitle) studioTitle.textContent = `Edit Dossier: ${char.name}`;
    if (nameInput) nameInput.value = char.name || '';
    if (taglineInput) taglineInput.value = char.tagline || '';
    if (avatarInput) avatarInput.value = char.avatar || '';
    if (categoriesInput) categoriesInput.value = Array.isArray(char.categories) ? char.categories.join(', ') : 'Roleplay';
    if (greetingInput) greetingInput.value = char.greeting || '';
    if (personalityInput) personalityInput.value = char.personality || '';
    if (appearanceInput) appearanceInput.value = char.appearance || '';
    if (abilitiesInput) abilitiesInput.value = char.abilities || '';
    if (backgroundInput) backgroundInput.value = char.background || '';
    if (speakingStyleInput) speakingStyleInput.value = char.speaking_style || '';
    if (exampleDialoguesInput) exampleDialoguesInput.value = char.example_dialogues || '';
    if (initialMemoryInput) initialMemoryInput.value = char.initial_memory || '';
    if (wikiUrlInput) wikiUrlInput.value = char.wiki || char.wikiUrl || '';
    updateStudioPreview();
    navigateTo('create');
  }

  if (btnResetStudio) {
    btnResetStudio.addEventListener('click', () => openStudioForCreate());
  }

  if (studioForm) {
    studioForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnSaveCharacter');
      const existingId = editCharIdInput?.value.trim();

      const payload = {
        name: nameInput.value.trim(),
        tagline: taglineInput.value.trim(),
        avatar: avatarInput.value.trim(),
        categories: categoriesInput.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        greeting: greetingInput.value.trim(),
        personality: personalityInput.value.trim(),
        appearance: appearanceInput.value.trim(),
        abilities: abilitiesInput.value.trim(),
        background: backgroundInput.value.trim(),
        speaking_style: speakingStyleInput.value.trim(),
        example_dialogues: exampleDialoguesInput.value.trim(),
        initial_memory: initialMemoryInput.value.trim(),
        wiki: wikiUrlInput.value.trim(),
        creator: (api.getCurrentUser()?.username ? `@${api.getCurrentUser().username}` : undefined)
      };

      if (!payload.name && !payload.wiki) {
        showToast('Enter a Character Name or Wiki URL.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
      }

      try {
        let saved;
        if (existingId) {
          saved = await api.updateCharacter(existingId, payload);
          showToast(`Updated dossier for ${saved.name}.`);
        } else {
          saved = await api.createCharacter(payload);
          showToast(`Committed ${saved.name} to SQL.`);
        }
        await loadCharacters();
        openChatWithCharacter(saved.id);
      } catch (error) {
        showToast('Failed to save character: ' + error.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      }
    });
  }

  return {
    loadCharacters,
    openStudioForCreate,
    openStudioForEdit
  };
}

/**
 * CharacterManager Class (Frontend OOP Controller for Discover, Archive, and Studio)
 */
export class CharacterManager {
  constructor(appState, navigateTo, openChatWithCharacter, showToast) {
    const controller = initCharactersModule(appState, navigateTo, openChatWithCharacter, showToast);
    this.loadCharacters = controller.loadCharacters;
    this.openStudioForCreate = controller.openStudioForCreate;
    this.openStudioForEdit = controller.openStudioForEdit;
  }
}
