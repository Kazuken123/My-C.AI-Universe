import { api } from './api.js';
import { initSidebar, showToast, escapeHtml } from './common.js';
import { openImageCropper } from './cropper.js';

class StudioPageApp {
  constructor() {
    this.form = document.getElementById('studio-form');
    this.heading = document.getElementById('studio-heading');
    this.charIdInput = document.getElementById('studioCharId');
    this.nameInput = document.getElementById('charNameInput');
    this.categoriesInput = document.getElementById('charCategoriesInput');
    this.taglineInput = document.getElementById('charTaglineInput');
    this.creatorInput = document.getElementById('charCreatorInput');
    this.avatarInput = document.getElementById('charAvatarInput');
    this.greetingInput = document.getElementById('charGreetingInput');
    this.personalityInput = document.getElementById('charPersonalityInput');
    this.appearanceInput = document.getElementById('charAppearanceInput');
    this.abilitiesInput = document.getElementById('charAbilitiesInput');
    this.backgroundInput = document.getElementById('charBackgroundInput');
    this.speakingStyleInput = document.getElementById('charSpeakingStyleInput');
    this.exampleDialoguesInput = document.getElementById('charExampleDialoguesInput');
    this.initialMemoryInput = document.getElementById('charInitialMemoryInput');

    // Wiki & AI synthesis
    this.wikiUrlInput = document.getElementById('charWikiInput');
    this.btnExtractWiki = document.getElementById('btnExtractWiki');
    this.aiConceptInput = document.getElementById('aiConceptInput');
    this.btnGenerateAI = document.getElementById('btnGenerateAI');
    this.btnRandomAvatar = document.getElementById('btnRandomAvatar');
    this.btnUploadAvatar = document.getElementById('btnUploadStudioAvatar');
    this.btnReset = document.getElementById('btnResetStudio');

    // Live preview elements
    this.previewAvatar = document.getElementById('preview-avatar');
    this.previewAvatarFrame = document.getElementById('previewAvatarFrame');
    this.previewCreator = document.getElementById('preview-creator');
    this.previewName = document.getElementById('preview-name');
    this.previewTagline = document.getElementById('preview-tagline');
    this.previewTags = document.getElementById('preview-tags');
    this.previewGreeting = document.getElementById('preview-greeting');
  }

  updatePreview() {
    const name = this.nameInput?.value.trim() || 'New Character';
    const tagline = this.taglineInput?.value.trim() || 'AI Roleplay Character';
    const avatar = this.avatarInput?.value.trim() || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}`;
    const greeting = this.greetingInput?.value.trim() || '*Scene awaits first line...*';
    const creator = this.creatorInput?.value.trim() || (api.getCurrentUser()?.username ? `@${api.getCurrentUser().username}` : '@community');
    const categories = (this.categoriesInput?.value.trim() || 'Anime, Roleplay')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    if (this.previewName) this.previewName.textContent = name;
    if (this.previewTagline) this.previewTagline.textContent = tagline;
    if (this.previewAvatar) this.previewAvatar.src = avatar;
    if (this.previewGreeting) this.previewGreeting.textContent = greeting;
    if (this.previewCreator) this.previewCreator.textContent = `Authored by ${creator} · Relational SQL`;

    if (this.previewTags) {
      this.previewTags.innerHTML = categories
        .slice(0, 3)
        .map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`)
        .join('');
    }
  }

  bindLiveInputs() {
    const inputs = [this.nameInput, this.taglineInput, this.creatorInput, this.avatarInput, this.greetingInput, this.categoriesInput];
    inputs.forEach(el => {
      if (el) el.addEventListener('input', () => this.updatePreview());
    });
  }

  launchPortraitCropper() {
    const currentVal = this.avatarInput?.value.trim() || '';
    const initial = (currentVal.startsWith('http') || currentVal.startsWith('data:') || currentVal.startsWith('/')) ? currentVal : null;
    openImageCropper({
      initialImage: initial,
      title: 'Character Portrait Framing',
      shape: 'rect',
      onCrop: ({ url }) => {
        if (this.avatarInput) {
          this.avatarInput.value = url;
          this.updatePreview();
        }
      }
    });
  }

  resetDraft() {
    if (this.form) this.form.reset();
    if (this.charIdInput) this.charIdInput.value = '';
    if (this.heading) this.heading.textContent = 'Character Architecture Studio';
    const btnSaveText = document.getElementById('btnSaveText');
    if (btnSaveText) btnSaveText.textContent = 'Commit to SQL & Launch Scene';
    if (this.creatorInput) {
      const user = api.getCurrentUser();
      this.creatorInput.value = user?.username ? `@${user.username}` : '';
    }
    this.updatePreview();
  }

  async loadCharacterForEdit(id) {
    try {
      const char = await api.getCharacter(id);
      if (!char) return;

      if (this.heading) this.heading.textContent = `Modify Architecture: ${char.name}`;
      const btnSaveText = document.getElementById('btnSaveText');
      if (btnSaveText) btnSaveText.textContent = 'Update SQL Architecture';

      if (this.charIdInput) this.charIdInput.value = char.id;
      if (this.nameInput) this.nameInput.value = char.name || '';
      if (this.creatorInput) this.creatorInput.value = char.creator || '';
      if (this.categoriesInput) this.categoriesInput.value = Array.isArray(char.categories) ? char.categories.join(', ') : (char.categories || '');
      if (this.taglineInput) this.taglineInput.value = char.tagline || '';
      if (this.avatarInput) this.avatarInput.value = char.avatar || '';
      if (this.greetingInput) this.greetingInput.value = char.greeting || '';
      if (this.personalityInput) this.personalityInput.value = char.personality || '';
      if (this.appearanceInput) this.appearanceInput.value = char.appearance || '';
      if (this.abilitiesInput) this.abilitiesInput.value = char.abilities || '';
      if (this.backgroundInput) this.backgroundInput.value = char.background || '';
      if (this.speakingStyleInput) this.speakingStyleInput.value = char.speakingStyle || '';
      if (this.exampleDialoguesInput) this.exampleDialoguesInput.value = char.exampleDialogues || '';
      if (this.initialMemoryInput) this.initialMemoryInput.value = char.initialMemory || '';

      this.updatePreview();
    } catch (err) {
      showToast('Could not load character draft: ' + err.message);
    }
  }

  async init() {
    const currentUser = await api.getCurrentUser();
    if (!currentUser) {
      const returnUrl = window.location.pathname + window.location.search;
      window.location.href = `/auth.html?mode=signin&return=${encodeURIComponent(returnUrl || '/create.html')}`;
      return;
    }

    await initSidebar('create');
    if (this.creatorInput && !this.creatorInput.value && currentUser?.username) {
      this.creatorInput.value = `@${currentUser.username}`;
    }
    this.bindLiveInputs();

    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        this.resetDraft();
        showToast('Studio form reset.');
      });
    }

    if (this.btnUploadAvatar) {
      this.btnUploadAvatar.addEventListener('click', () => this.launchPortraitCropper());
    }

    if (this.previewAvatarFrame) {
      this.previewAvatarFrame.addEventListener('click', () => this.launchPortraitCropper());
      this.previewAvatarFrame.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.launchPortraitCropper();
        }
      });
    }

    if (this.btnRandomAvatar) {
      this.btnRandomAvatar.addEventListener('click', () => {
        const seed = Math.random().toString(36).substring(2, 9);
        const url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}`;
        if (this.avatarInput) this.avatarInput.value = url;
        this.updatePreview();
        showToast('Generated procedural avatar seed.');
      });
    }

    if (this.btnExtractWiki) {
      this.btnExtractWiki.addEventListener('click', async () => {
        const url = this.wikiUrlInput?.value.trim();
        if (!url) {
          showToast('Please paste a valid Fandom or Wikipedia URL.');
          return;
        }
        this.btnExtractWiki.disabled = true;
        this.btnExtractWiki.innerHTML = `<i class="ph-light ph-spinner-gap"></i> Ingesting...`;
        try {
          const res = await api.parseWiki(url);
          const c = res.character || res;
          if (c && (c.name || c.greeting || c.background || c.appearance)) {
            if (this.nameInput) this.nameInput.value = c.name || this.nameInput.value;
            if (this.taglineInput) this.taglineInput.value = c.tagline || this.taglineInput.value;
            if (this.avatarInput && c.avatar) this.avatarInput.value = c.avatar;
            if (this.greetingInput && c.greeting) this.greetingInput.value = c.greeting;
            if (this.personalityInput && c.personality) this.personalityInput.value = c.personality;
            if (this.appearanceInput && c.appearance) this.appearanceInput.value = c.appearance;
            if (this.abilitiesInput && c.abilities) this.abilitiesInput.value = c.abilities;
            if (this.backgroundInput && c.background) this.backgroundInput.value = c.background;
            if (this.speakingStyleInput && (c.speaking_style || c.speakingStyle)) {
              this.speakingStyleInput.value = c.speaking_style || c.speakingStyle;
            }
            if (this.exampleDialoguesInput && (c.example_dialogues || c.exampleDialogues)) {
              this.exampleDialoguesInput.value = c.example_dialogues || c.exampleDialogues;
            }
            if (this.initialMemoryInput && (c.initial_memory || c.initialMemory)) {
              this.initialMemoryInput.value = c.initial_memory || c.initialMemory;
            }
            if (this.categoriesInput && c.categories) {
              this.categoriesInput.value = Array.isArray(c.categories) ? c.categories.join(', ') : c.categories;
            }
            this.updatePreview();
            showToast(`Ingested canon lore for ${c.name || 'character'}!`);
          } else {
            showToast('No canon lore could be extracted from this URL.');
          }
        } catch (err) {
          showToast('Lore extraction failed: ' + (err.message || 'Unknown error'));
        } finally {
          this.btnExtractWiki.disabled = false;
          this.btnExtractWiki.innerHTML = `<i class="ph-light ph-globe-hemisphere-west"></i> <span>Extract Lore</span>`;
        }
      });
    }

    if (this.btnGenerateAI) {
      this.btnGenerateAI.addEventListener('click', async () => {
        const prompt = this.aiConceptInput?.value.trim();
        if (!prompt) {
          showToast('Enter a one-line concept prompt first.');
          return;
        }
        this.btnGenerateAI.disabled = true;
        this.btnGenerateAI.innerHTML = `<i class="ph-light ph-spinner-gap"></i> Synthesizing...`;
        try {
          const res = await api.generateCharacter(prompt);
          if (res.character) {
            const c = res.character;
            if (this.nameInput) this.nameInput.value = c.name || '';
            if (this.taglineInput) this.taglineInput.value = c.tagline || '';
            if (this.avatarInput && c.avatar) this.avatarInput.value = c.avatar;
            if (this.greetingInput && c.greeting) this.greetingInput.value = c.greeting;
            if (this.personalityInput && c.personality) this.personalityInput.value = c.personality;
            if (this.appearanceInput && c.appearance) this.appearanceInput.value = c.appearance;
            if (this.abilitiesInput && c.abilities) this.abilitiesInput.value = c.abilities;
            if (this.backgroundInput && c.background) this.backgroundInput.value = c.background;
            if (this.speakingStyleInput && c.speakingStyle) this.speakingStyleInput.value = c.speakingStyle;
            if (this.categoriesInput && c.categories) {
              this.categoriesInput.value = Array.isArray(c.categories) ? c.categories.join(', ') : c.categories;
            }
            this.updatePreview();
            showToast(`Synthesized ${c.name}!`);
          }
        } catch (err) {
          showToast('AI synthesis failed: ' + err.message);
        } finally {
          this.btnGenerateAI.disabled = false;
          this.btnGenerateAI.innerHTML = `<i class="ph-light ph-wand"></i> <span>Synthesize</span>`;
        }
      });
    }

    if (this.form) {
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = this.charIdInput?.value;
        const name = this.nameInput?.value.trim();
        if (!name) {
          showToast('Character name is required.');
          return;
        }

        const payload = {
          name,
          tagline: this.taglineInput?.value.trim(),
          avatar: this.avatarInput?.value.trim() || `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
          categories: (this.categoriesInput?.value.trim() || 'Roleplay')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          greeting: this.greetingInput?.value.trim(),
          personality: this.personalityInput?.value.trim(),
          appearance: this.appearanceInput?.value.trim(),
          abilities: this.abilitiesInput?.value.trim(),
          background: this.backgroundInput?.value.trim(),
          speakingStyle: this.speakingStyleInput?.value.trim(),
          exampleDialogues: this.exampleDialoguesInput?.value.trim(),
          initialMemory: this.initialMemoryInput?.value.trim(),
          creator: (api.getCurrentUser()?.username ? `@${api.getCurrentUser().username}` : undefined)
        };

        const submitBtn = document.getElementById('btnSaveCharacter');
        if (submitBtn) submitBtn.disabled = true;

        try {
          let saved;
          if (id) {
            saved = await api.updateCharacter(id, payload);
            showToast(`Updated ${saved.name} in SQL.`);
          } else {
            saved = await api.createCharacter(payload);
            showToast(`Committed ${saved.name} to SQLite.`);
          }

          setTimeout(() => {
            window.location.href = `/chat.html?id=${encodeURIComponent(saved.id)}`;
          }, 400);
        } catch (err) {
          showToast('Failed to save character: ' + err.message);
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    const params = new URLSearchParams(window.location.search);
    const editId = params.get('id');
    if (editId) {
      await this.loadCharacterForEdit(editId);
    } else {
      this.updatePreview();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new StudioPageApp();
  app.init();
});
