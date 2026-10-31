import { api } from './api.js';
import { escapeHtml, showToast } from './common.js';

export const POPULAR_VOICE_CHIPS = [
  'Kana Arima',
  'Furina',
  'Megumin',
  'Ai Hoshino',
  'Takahashi Rie',
  'Han Megumi'
];

const FISH_PUBLIC_CDN = 'https://public-platform.r2.fish.audio';

/**
 * Strictly validate that a voice preview/cover URL uses HTTPS.
 * Expands relative Fish Audio CDN keys safely before checking protocol.
 * @param {string} rawUrl
 * @returns {string|null}
 */
export function sanitizeVoiceSampleUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let candidate = rawUrl.trim();
  if (!candidate) return null;

  if (/^(coverimage|avatars|samples)\/[a-zA-Z0-9_./-]+$/i.test(candidate)) {
    candidate = `${FISH_PUBLIC_CDN}/${candidate}`;
  } else if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

class VoicePickerController {
  constructor() {
    this.overlay = null;
    this.selectedVoiceId = '';
    this.selectedVoiceName = '';
    this.authorDefaultVoiceId = '';
    this.authorDefaultVoiceName = '';
    this.characterName = '';
    this.hasOverride = false;
    this.onSelectCallback = null;
    this.activeTab = 'discover';
    this.searchTimer = null;
    this.models = [];
    this.playingModelId = null;
    this.audioEl = null;
    this.uploadDataUrl = '';
    this.uploadFileName = '';

    this.#buildModal();
  }

  #buildModal() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'voice-picker-overlay';
    this.overlay.id = 'voicePickerModalOverlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'voicePickerTitle');

    const chipsHtml = POPULAR_VOICE_CHIPS.map(
      (chip) => `<button type="button" class="voice-picker-chip" data-voice-chip="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`
    ).join('');

    this.overlay.innerHTML = `
      <div class="voice-picker-shell">
        <div class="voice-picker-core">
          <header class="voice-picker-header">
            <div class="voice-picker-header-left">
              <span class="voice-picker-header-icon"><i class="ph-light ph-microphone"></i></span>
              <div>
                <div class="voice-picker-title" id="voicePickerTitle">Anime Seiyuu &amp; Voice Studio</div>
                <div class="voice-picker-subtitle">Fish Audio S2.1 &middot; Gemini 3.1 Emotional Japanese Pipeline</div>
              </div>
            </div>
            <button type="button" class="voice-picker-close-btn" id="voicePickerCloseBtn" aria-label="Close Voice Picker">
              <i class="ph-light ph-x"></i>
            </button>
          </header>

          <div class="voice-picker-tabs">
            <button type="button" class="voice-picker-tab active" data-voice-tab="discover">
              <i class="ph-light ph-magnifying-glass"></i>
              <span>Community Seiyuu Library</span>
            </button>
            <button type="button" class="voice-picker-tab" data-voice-tab="upload">
              <i class="ph-light ph-upload-simple"></i>
              <span>Upload Voice Sample</span>
            </button>
          </div>

          <div class="voice-picker-alert" id="voicePickerAlert">
            <i class="ph-light ph-warning-circle"></i>
            <span id="voicePickerAlertText"></span>
          </div>

          <div class="voice-picker-body" id="voicePickerDiscoverPane">
            <div class="voice-picker-search-row" style="display: flex; gap: 8px; align-items: center;">
              <div class="voice-picker-search-wrap" style="flex: 1;">
                <i class="ph-light ph-magnifying-glass voice-picker-search-icon"></i>
                <input
                  type="text"
                  class="voice-picker-search-input"
                  id="voicePickerSearchInput"
                  placeholder="Search anime character or seiyuu (e.g. Kana Arima, Furina, Megumin)..."
                />
              </div>
              <select
                id="voicePickerLangSelect"
                class="select-control"
                style="height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border-hairline, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.04); color: var(--text-primary, #f5f5f7); font-size: 0.78rem; cursor: pointer;"
                title="Filter voices by language"
                aria-label="Filter voices by language"
              >
                <option value="ja" selected>🇯🇵 Japanese</option>
                <option value="all">🌐 All Languages</option>
                <option value="en">🇺🇸 English</option>
                <option value="zh">🇨🇳 Chinese</option>
                <option value="ko">🇰🇷 Korean</option>
              </select>
            </div>

            <div class="voice-picker-chips" id="voicePickerChips">
              ${chipsHtml}
            </div>

            <div class="voice-picker-list" id="voicePickerResults">
              <div class="voice-picker-empty">Loading voice library...</div>
            </div>
          </div>

          <form class="voice-picker-body" id="voicePickerUploadPane" style="display: none;">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="voiceCustomTitleInput">Custom Voice Model Name *</label>
              <input
                type="text"
                class="form-input"
                id="voiceCustomTitleInput"
                maxlength="100"
                placeholder="e.g. Kana Arima (Tsundere Studio Cut)"
                required
              />
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label for="voiceCustomDescInput">Description (Optional)</label>
              <input
                type="text"
                class="form-input"
                id="voiceCustomDescInput"
                maxlength="300"
                placeholder="Clean 10-30s vocal reference without background music"
              />
            </div>

            <label class="voice-upload-dropzone" for="voiceCustomFileInput">
              <i class="ph-light ph-music-notes-plus" style="font-size: 1.7rem; color: var(--accent);"></i>
              <span id="voiceCustomFileLabel" style="font-size: 0.84rem; font-weight: 600; color: var(--text-primary);">
                Click to select WAV, MP3, OGG, or WebM sample (max 4 MB)
              </span>
              <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">
                Verified by server-side binary magic bytes before cloning
              </span>
              <input
                type="file"
                id="voiceCustomFileInput"
                accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/webm,.wav,.mp3,.ogg,.webm"
                style="display: none;"
              />
            </label>

            <div style="display: flex; justify-content: flex-end;">
              <button type="submit" class="btn-primary btn-sm" id="voiceCustomSubmitBtn">
                <i class="ph-light ph-upload-simple"></i>
                <span>Create &amp; Bind Voice Model</span>
              </button>
            </div>
          </form>

          <footer class="voice-picker-footer">
            <div class="voice-picker-active-readout" id="voicePickerReadout">
              Active: Default Browser Speech
            </div>
            <div style="display: inline-flex; gap: 8px; align-items: center;">
              <button type="button" class="btn-secondary btn-sm" id="voicePickerResetBtn" title="Reset voice preference">
                <i class="ph-light ph-arrow-counter-clockwise"></i>
                <span id="voicePickerResetBtnText">Browser Speech</span>
              </button>
              <button type="button" class="btn-secondary btn-sm" id="voicePickerDoneBtn">
                <span>Done</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.#bindEvents();
  }

  #setAlert(msg = '') {
    const box = this.overlay.querySelector('#voicePickerAlert');
    const txt = this.overlay.querySelector('#voicePickerAlertText');
    if (!box || !txt) return;
    if (msg) {
      txt.textContent = msg;
      box.classList.add('visible');
    } else {
      txt.textContent = '';
      box.classList.remove('visible');
    }
  }

  #stopSampleAudio() {
    if (this.audioEl) {
      try {
        this.audioEl.pause();
      } catch {}
      this.audioEl = null;
    }
    this.playingModelId = null;
    this.#syncPlayButtons();
  }

  #syncPlayButtons() {
    if (!this.overlay) return;
    this.overlay.querySelectorAll('[data-preview-voice]').forEach((btn) => {
      const id = btn.getAttribute('data-preview-voice');
      const isPlaying = Boolean(id && id === this.playingModelId);
      btn.classList.toggle('playing', isPlaying);
      btn.innerHTML = isPlaying
        ? '<i class="ph-fill ph-stop"></i>'
        : '<i class="ph-fill ph-play"></i>';
    });
  }

  #updateReadout() {
    const readout = this.overlay?.querySelector('#voicePickerReadout');
    const resetText = this.overlay?.querySelector('#voicePickerResetBtnText');
    const resetBtn = this.overlay?.querySelector('#voicePickerResetBtn');
    if (!readout) return;

    if (this.selectedVoiceId) {
      if (this.authorDefaultVoiceId && this.selectedVoiceId === this.authorDefaultVoiceId && !this.hasOverride) {
        readout.textContent = `Active: Author Default (${this.selectedVoiceName || this.selectedVoiceId})`;
      } else {
        readout.textContent = `Active: ${this.selectedVoiceName || this.selectedVoiceId}${this.authorDefaultVoiceId ? ' (Custom Override)' : ''}`;
      }
    } else if (this.authorDefaultVoiceId) {
      readout.textContent = `Active: Author Default (${this.authorDefaultVoiceName || this.authorDefaultVoiceId})`;
    } else {
      readout.textContent = 'Active: Default Browser Speech';
    }

    if (resetText && resetBtn) {
      if (this.authorDefaultVoiceId) {
        resetText.textContent = `Author Default (${this.authorDefaultVoiceName || 'Default'})`;
        resetBtn.title = `Revert to author's default voice (${this.authorDefaultVoiceName})`;
      } else {
        resetText.textContent = 'Browser Speech';
        resetBtn.title = 'Reset to browser speech synthesis';
      }
    }
  }

  #switchTab(tabName) {
    this.activeTab = tabName;
    this.#setAlert('');
    this.#stopSampleAudio();

    this.overlay.querySelectorAll('[data-voice-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-voice-tab') === tabName);
    });

    const discoverPane = this.overlay.querySelector('#voicePickerDiscoverPane');
    const uploadPane = this.overlay.querySelector('#voicePickerUploadPane');
    if (discoverPane) discoverPane.style.display = tabName === 'discover' ? 'flex' : 'none';
    if (uploadPane) uploadPane.style.display = tabName === 'upload' ? 'flex' : 'none';
  }

  async #fetchModels(queryStr) {
    const resultsEl = this.overlay?.querySelector('#voicePickerResults');
    const langSelect = this.overlay?.querySelector('#voicePickerLangSelect');
    if (!resultsEl) return;
    this.#setAlert('');
    this.#stopSampleAudio();
    resultsEl.innerHTML = '<div class="voice-picker-empty"><i class="ph-light ph-spinner-gap"></i> Searching Fish Audio voices...</div>';

    try {
      const res = await api.searchVoiceModels({
        search: (queryStr || '').trim() || 'Kana Arima',
        language: langSelect?.value || 'ja',
        page: 1,
        pageSize: 18
      });
      this.models = Array.isArray(res?.items) ? res.items : [];
      if (res?.unconfigured) {
        this.#setAlert('Live voice catalog loaded. Set FISH_AUDIO_API_KEY in server environment variables to enable AI TTS synthesis.');
      }
      this.#renderModels();
    } catch (err) {
      this.models = [];
      resultsEl.innerHTML = '<div class="voice-picker-empty">Could not load Fish Audio models right now.</div>';
      this.#setAlert(err.message || 'Voice search failed.');
    }
  }

  #renderModels() {
    const resultsEl = this.overlay?.querySelector('#voicePickerResults');
    if (!resultsEl) return;

    if (!this.models.length) {
      resultsEl.innerHTML = '<div class="voice-picker-empty">No matching voice models found. Try another anime or seiyuu name.</div>';
      return;
    }

    resultsEl.innerHTML = this.models.map((item) => {
      const id = String(item.id || '');
      const title = String(item.title || 'Untitled Voice');
      const author = String(item.author || 'community');
      const uses = Number(item.taskCount || 0).toLocaleString();
      const isSelected = id === this.selectedVoiceId;
      const safeCover = sanitizeVoiceSampleUrl(item.coverImage);
      const safeSample = sanitizeVoiceSampleUrl(item.sampleAudio);
      const monogram = title.slice(0, 2).toUpperCase();

      return `
        <div class="voice-model-card ${isSelected ? 'selected' : ''}">
          ${safeCover
            ? `<img class="voice-model-cover" src="${escapeHtml(safeCover)}" alt="" loading="lazy" />`
            : `<span class="voice-model-cover">${escapeHtml(monogram)}</span>`
          }
          <div class="voice-model-meta">
            <div class="voice-model-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
            <div class="voice-model-sub">@${escapeHtml(author)} &middot; ${escapeHtml(uses)} uses</div>
          </div>
          <div class="voice-model-actions">
            ${safeSample ? `
              <button
                type="button"
                class="voice-preview-btn"
                data-preview-voice="${escapeHtml(id)}"
                data-sample-url="${escapeHtml(safeSample)}"
                title="Preview voice sample"
              >
                <i class="ph-fill ph-play"></i>
              </button>
            ` : ''}
            <button
              type="button"
              class="voice-select-btn ${isSelected ? 'selected' : ''}"
              data-choose-voice="${escapeHtml(id)}"
              data-choose-name="${escapeHtml(title)}"
            >
              ${isSelected ? '<i class="ph-bold ph-check"></i><span>Selected</span>' : '<span>Select</span>'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    resultsEl.querySelectorAll('[data-preview-voice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-preview-voice');
        const url = sanitizeVoiceSampleUrl(btn.getAttribute('data-sample-url'));
        if (!url) return;

        if (this.playingModelId === id) {
          this.#stopSampleAudio();
          return;
        }

        this.#stopSampleAudio();
        const audio = new Audio(url);
        this.audioEl = audio;
        this.playingModelId = id;
        this.#syncPlayButtons();

        const reset = () => {
          if (this.audioEl === audio) {
            this.audioEl = null;
            this.playingModelId = null;
            this.#syncPlayButtons();
          }
        };
        audio.onended = reset;
        audio.onerror = () => {
          reset();
          this.#setAlert('Could not play voice preview sample.');
        };
        audio.play().catch(() => reset());
      });
    });

    resultsEl.querySelectorAll('[data-choose-voice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const voiceId = btn.getAttribute('data-choose-voice') || '';
        const voiceName = btn.getAttribute('data-choose-name') || '';
        this.selectedVoiceId = voiceId;
        this.selectedVoiceName = voiceName;
        this.#updateReadout();
        this.#renderModels();
        if (typeof this.onSelectCallback === 'function') {
          this.onSelectCallback({ voiceId, voiceName });
        }
        this.close();
      });
    });
  }

  #bindEvents() {
    const closeBtn = this.overlay.querySelector('#voicePickerCloseBtn');
    const doneBtn = this.overlay.querySelector('#voicePickerDoneBtn');
    const resetBtn = this.overlay.querySelector('#voicePickerResetBtn');
    const searchInput = this.overlay.querySelector('#voicePickerSearchInput');
    const langSelect = this.overlay.querySelector('#voicePickerLangSelect');
    const fileInput = this.overlay.querySelector('#voiceCustomFileInput');
    const fileLabel = this.overlay.querySelector('#voiceCustomFileLabel');
    const uploadForm = this.overlay.querySelector('#voicePickerUploadPane');
    const submitBtn = this.overlay.querySelector('#voiceCustomSubmitBtn');

    closeBtn?.addEventListener('click', () => this.close());
    doneBtn?.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay?.classList.contains('active')) {
        this.close();
      }
    });

    this.overlay.querySelectorAll('[data-voice-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.#switchTab(btn.getAttribute('data-voice-tab') || 'discover');
      });
    });

    searchInput?.addEventListener('input', () => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.#fetchModels(searchInput.value);
      }, 350);
    });

    langSelect?.addEventListener('change', () => {
      this.#fetchModels(searchInput?.value || '');
    });

    this.overlay.querySelectorAll('[data-voice-chip]').forEach((chipBtn) => {
      chipBtn.addEventListener('click', () => {
        const chip = chipBtn.getAttribute('data-voice-chip') || '';
        this.overlay.querySelectorAll('[data-voice-chip]').forEach((b) => b.classList.remove('active'));
        chipBtn.classList.add('active');
        if (searchInput) searchInput.value = chip;
        this.#fetchModels(chip);
      });
    });

    resetBtn?.addEventListener('click', () => {
      this.selectedVoiceId = '';
      this.selectedVoiceName = '';
      this.hasOverride = false;
      this.#updateReadout();
      this.#renderModels();
      if (typeof this.onSelectCallback === 'function') {
        this.onSelectCallback({ voiceId: '', voiceName: '' });
      }
      this.close();
    });

    fileInput?.addEventListener('change', () => {
      this.#setAlert('');
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        this.#setAlert('Audio sample must be 4 MB or smaller.');
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        this.uploadDataUrl = typeof reader.result === 'string' ? reader.result : '';
        this.uploadFileName = file.name;
        if (fileLabel) {
          fileLabel.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB ready)`;
        }
      };
      reader.onerror = () => {
        this.#setAlert('Failed to read local audio file.');
      };
      reader.readAsDataURL(file);
    });

    uploadForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.#setAlert('');
      const titleInput = this.overlay.querySelector('#voiceCustomTitleInput');
      const descInput = this.overlay.querySelector('#voiceCustomDescInput');
      const title = titleInput?.value?.trim() || '';
      const description = descInput?.value?.trim() || '';

      if (!title) {
        this.#setAlert('Please enter a name for the custom voice model.');
        return;
      }
      if (!this.uploadDataUrl) {
        this.#setAlert('Please choose a WAV, MP3, OGG, or WebM sample first.');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await api.createCustomVoice({
          title,
          description,
          audioDataUrl: this.uploadDataUrl
        });
        const created = res?.model;
        if (created?.id) {
          this.selectedVoiceId = created.id;
          this.selectedVoiceName = created.title || title;
          this.#updateReadout();
          showToast(`Created custom voice "${this.selectedVoiceName}"!`);
          if (typeof this.onSelectCallback === 'function') {
            this.onSelectCallback({
              voiceId: this.selectedVoiceId,
              voiceName: this.selectedVoiceName
            });
          }
          uploadForm.reset();
          this.uploadDataUrl = '';
          if (fileLabel) {
            fileLabel.textContent = 'Click to select WAV, MP3, OGG, or WebM sample (max 4 MB)';
          }
          this.close();
        }
      } catch (err) {
        this.#setAlert(err.message || 'Custom voice upload failed.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  open({
    selectedVoiceId = '',
    selectedVoiceName = '',
    title = 'Choose Character Voice',
    subtitle = '',
    authorDefaultVoiceId = '',
    authorDefaultVoiceName = '',
    characterName = '',
    hasOverride = false,
    onSelect = null
  } = {}) {
    this.selectedVoiceId = selectedVoiceId || '';
    this.selectedVoiceName = selectedVoiceName || '';
    this.authorDefaultVoiceId = authorDefaultVoiceId || '';
    this.authorDefaultVoiceName = authorDefaultVoiceName || '';
    this.characterName = characterName || '';
    this.hasOverride = Boolean(hasOverride);
    this.onSelectCallback = onSelect;

    const titleEl = this.overlay.querySelector('#voicePickerTitle');
    if (titleEl) titleEl.textContent = title;

    const subEl = this.overlay.querySelector('.voice-picker-subtitle');
    if (subEl) {
      if (subtitle) {
        subEl.textContent = subtitle;
      } else if (this.authorDefaultVoiceName) {
        subEl.textContent = `Author Default: ${this.authorDefaultVoiceName} · Override for ${this.characterName || 'this character'}`;
      } else {
        subEl.textContent = 'Fish Audio S2.1 · Gemini 3.1 Emotional Japanese Pipeline';
      }
    }

    this.#switchTab('discover');
    this.#updateReadout();
    this.overlay.classList.add('active');

    const searchInput = this.overlay.querySelector('#voicePickerSearchInput');
    const initialQuery = this.characterName || this.authorDefaultVoiceName || (searchInput?.value || '').trim() || 'Kana Arima';
    if (searchInput) {
      searchInput.value = initialQuery;
    }
    this.#fetchModels(initialQuery);
  }

  close() {
    this.#stopSampleAudio();
    this.overlay?.classList.remove('active');
  }
}

let singletonPicker = null;

export function openVoicePickerModal(options = {}) {
  if (typeof document === 'undefined') return null;
  if (!singletonPicker) {
    singletonPicker = new VoicePickerController();
  }
  singletonPicker.open(options);
  return singletonPicker;
}
