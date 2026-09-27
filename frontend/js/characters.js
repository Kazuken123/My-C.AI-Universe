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

export function initCharactersModule(appState, navigateTo, openChatWithCharacter, showToast) {
  const discoverGrid = document.getElementById('discover-grid');
  const myCharsGrid = document.getElementById('my-characters-grid');
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
  }

  function buildCharacterCardHtml(char, showManageActions = false) {
    const avatarUrl = char.avatar || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(char.name)}`;
    const tags = Array.isArray(char.categories) ? char.categories : ['Roleplay'];
    const summary = char.tagline || (char.personality ? char.personality.slice(0, 90) : 'AI Roleplay Character');

    return `
      <div class="cai-card" data-char-card="${escapeHtml(char.id)}">
        <div class="cai-card-top">
          <img class="cai-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(char.name)}" onerror="this.src='https://api.dicebear.com/9.x/adventurer/svg?seed=Fallback'" />
          <div class="cai-card-info">
            <div class="cai-card-name">${escapeHtml(char.name)}</div>
            <div class="cai-card-creator">By ${escapeHtml(char.creator || '@you')}</div>
            <div class="cai-card-tagline">${escapeHtml(summary)}</div>
          </div>
        </div>
        <div class="cai-card-tags">
          ${tags.slice(0, 3).map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('')}
          ${char.wiki ? `<span class="tag-badge" title="Wiki Linked">🌐 Wiki</span>` : ''}
        </div>
        <div class="cai-card-footer">
          <div class="card-stats">
            <span title="Total Interactions">💬 ${formatCount(char.interactions || 0)}</span>
            <button class="like-btn ${char.isLiked ? 'liked' : ''}" data-like-char="${escapeHtml(char.id)}" title="Like Character">
              ${char.isLiked ? '❤️' : '🤍'} <span>${formatCount(char.likes || 0)}</span>
            </button>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" data-edit-char="${escapeHtml(char.id)}" title="Edit Character">✏️</button>
            ${showManageActions ? `<button class="btn btn-danger btn-sm" data-delete-char="${escapeHtml(char.id)}" title="Delete Character">🗑️</button>` : ''}
            <button class="btn btn-primary btn-sm" data-chat-char="${escapeHtml(char.id)}">Chat</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindCardEvents(container) {
    if (!container) return;

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
        if (!confirm('Delete this character and its chat history?')) return;
        try {
          await api.deleteCharacter(id);
          showToast('Character deleted.');
          await loadCharacters();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    container.querySelectorAll('[data-like-char]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
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
        <div class="studio-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
          <h3>No matching characters found</h3>
          <p class="hint" style="margin-top: 6px;">Try clearing your search filter or create a new character in the Studio.</p>
          <button class="btn btn-primary" id="empty-create-btn">✨ Create Character</button>
        </div>
      `;
      const btn = document.getElementById('empty-create-btn');
      if (btn) btn.onclick = () => openStudioForCreate();
      return;
    }

    discoverGrid.innerHTML = chars.map(c => buildCharacterCardHtml(c, false)).join('');
    bindCardEvents(discoverGrid);
  }

  function renderMyCharactersGrid(chars) {
    if (!myCharsGrid) return;
    if (!chars || chars.length === 0) {
      myCharsGrid.innerHTML = `<p style="color: var(--text-muted);">No characters created yet.</p>`;
      return;
    }
    myCharsGrid.innerHTML = chars.map(c => buildCharacterCardHtml(c, true)).join('');
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
      debounceTimer = setTimeout(loadCharacters, 220);
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
      `*${name} turns toward you.*\n\n${name}: "Hello there!"`;

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
        showToast('Please paste a Fandom or Wikipedia URL first.');
        return;
      }
      btnExtractWiki.disabled = true;
      btnExtractWiki.textContent = '⏳ Extracting...';
      try {
        const data = await api.parseWikiPreview(url);
        if (data.name && !nameInput.value.trim()) nameInput.value = data.name;
        if (data.tagline) taglineInput.value = data.tagline;
        if (data.avatar) avatarInput.value = data.avatar;
        if (data.greeting) greetingInput.value = data.greeting;
        if (data.personality) personalityInput.value = data.personality;
        if (data.appearance) appearanceInput.value = data.appearance;
        if (data.abilities) abilitiesInput.value = data.abilities;
        if (data.background) backgroundInput.value = data.background;
        if (data.speaking_style) speakingStyleInput.value = data.speaking_style;
        if (data.initial_memory) initialMemoryInput.value = data.initial_memory;
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          categoriesInput.value = data.categories.join(', ');
        }
        updateStudioPreview();
        showToast('✨ Extracted character profile from Wiki!');
      } catch (error) {
        showToast('Wiki extraction error: ' + error.message);
      } finally {
        btnExtractWiki.disabled = false;
        btnExtractWiki.textContent = '🌐 Extract Wiki';
      }
    });
  }

  // AI Character Concept Generator
  if (btnGenerateAI) {
    btnGenerateAI.addEventListener('click', async () => {
      const concept = aiConceptInput?.value.trim();
      if (!concept) {
        showToast('Enter a short character concept first!');
        return;
      }
      btnGenerateAI.disabled = true;
      btnGenerateAI.textContent = '⏳ Generating...';
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
        showToast('✨ AI generated full character profile!');
      } catch (error) {
        showToast('AI Generator error: ' + error.message);
      } finally {
        btnGenerateAI.disabled = false;
        btnGenerateAI.textContent = '✨ Magic Fill';
      }
    });
  }

  function openStudioForCreate() {
    if (studioForm) studioForm.reset();
    if (editCharIdInput) editCharIdInput.value = '';
    if (studioTitle) studioTitle.textContent = '✨ Create a Character';
    if (categoriesInput) categoriesInput.value = 'Anime, Roleplay';
    updateStudioPreview();
    navigateTo('create');
  }

  function openStudioForEdit(char) {
    if (!char) return;
    if (editCharIdInput) editCharIdInput.value = char.id;
    if (studioTitle) studioTitle.textContent = `✏️ Edit Character: ${char.name}`;
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
        wiki: wikiUrlInput.value.trim()
      };

      if (!payload.name && !payload.wiki) {
        showToast('Please enter a Character Name or Wiki URL.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        let saved;
        if (existingId) {
          saved = await api.updateCharacter(existingId, payload);
          showToast(`Updated ${saved.name}!`);
        } else {
          saved = await api.createCharacter(payload);
          showToast(`Created ${saved.name}!`);
        }
        await loadCharacters();
        openChatWithCharacter(saved.id);
      } catch (error) {
        showToast('Failed to save character: ' + error.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '💾 Save & Start Chat';
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
 * CharacterManager Class (Frontend OOP Controller for Discover, My Characters, and Studio)
 */
export class CharacterManager {
  constructor(appState, navigateTo, openChatWithCharacter, showToast) {
    const controller = initCharactersModule(appState, navigateTo, openChatWithCharacter, showToast);
    this.loadCharacters = controller.loadCharacters;
    this.openStudioForCreate = controller.openStudioForCreate;
    this.openStudioForEdit = controller.openStudioForEdit;
  }
}

