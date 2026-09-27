import { api } from './api.js';
import { bindSpotlightHover } from './characters.js';

function toMonogram(name, avatarField) {
  const cleanAvatar = String(avatarField || '').trim();
  // If user entered ASCII monogram (1-3 letters/numbers), use it; otherwise derive from name
  if (/^[A-Za-z0-9]{1,3}$/.test(cleanAvatar)) {
    return cleanAvatar.toUpperCase();
  }
  const cleanName = String(name || '').trim();
  if (!cleanName) return 'TR';
  const parts = cleanName.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleanName.slice(0, 2).toUpperCase();
}

/**
 * PersonaManager Class (Frontend OOP UI Controller for User Personas)
 */
export class PersonaManager {
  constructor(appState, showToast, apiClient = api) {
    this.appState = appState;
    this.showToast = showToast;
    this.api = apiClient;

    this.listEl = document.getElementById('personas-list');
    this.formEl = document.getElementById('persona-form');
    this.sidebarPersonaName = document.getElementById('sidebar-persona-name');
    this.sidebarPersonaEmoji = document.getElementById('sidebar-persona-emoji');
    this.chatPersonaSelect = document.getElementById('chatPersonaSelect');

    this.#bindFormEvents();
  }

  async loadPersonas() {
    try {
      const personas = await this.api.getPersonas();
      this.appState.personas = personas;
      this.appState.activePersona = personas.find(p => p.isDefault) || personas[0] || null;
      this.renderSidebarPersona();
      this.renderPersonasList();
      this.renderChatPersonaSelector();
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  }

  renderSidebarPersona() {
    const active = this.appState.activePersona;
    if (!active) return;
    if (this.sidebarPersonaName) this.sidebarPersonaName.textContent = active.name;
    if (this.sidebarPersonaEmoji) {
      this.sidebarPersonaEmoji.textContent = toMonogram(active.name, active.avatar);
    }
  }

  renderChatPersonaSelector() {
    if (!this.chatPersonaSelect) return;
    this.chatPersonaSelect.innerHTML = this.appState.personas
      .map(p => `<option value="${p.id}" ${p.isDefault ? 'selected' : ''}>${this.#escapeHtml(p.name)}</option>`)
      .join('');
  }

  renderPersonasList() {
    if (!this.listEl) return;
    if (!this.appState.personas || this.appState.personas.length === 0) {
      this.listEl.innerHTML = `<p style="color: var(--text-muted);">No roleplay identities registered.</p>`;
      return;
    }

    this.listEl.innerHTML = this.appState.personas.map(p => {
      const mono = toMonogram(p.name, p.avatar);
      return `
        <div class="double-bezel-shell card-shell">
          <div class="double-bezel-core cai-card" style="cursor: default;">
            <div class="cai-card-top">
              <div class="msg-avatar" style="width: 48px; height: 48px; font-size: 0.9rem;">
                ${this.#escapeHtml(mono)}
              </div>
              <div class="cai-card-info">
                <div class="cai-card-header-line">
                  <div class="cai-card-name">${this.#escapeHtml(p.name)}</div>
                  ${p.isDefault ? '<span class="eyebrow-pill">ACTIVE IDENTITY</span>' : ''}
                </div>
                <div class="cai-card-tagline" style="margin-top: 4px;">
                  ${this.#escapeHtml(p.description || 'No persona backstory configured.')}
                </div>
              </div>
            </div>
            <div class="cai-card-footer">
              <span class="card-stats">Injected into character system prompt</span>
              <div class="card-actions">
                ${!p.isDefault ? `
                  <button class="btn-secondary btn-sm" data-set-default="${p.id}" type="button">
                    <i class="ph-light ph-check"></i> <span>Set Active</span>
                  </button>
                ` : ''}
                ${this.appState.personas.length > 1 ? `
                  <button class="btn-danger btn-sm" data-del-persona="${p.id}" type="button" title="Delete Identity">
                    <i class="ph-light ph-trash"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    bindSpotlightHover(this.listEl);

    this.listEl.querySelectorAll('[data-set-default]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await this.api.updatePersona(btn.dataset.setDefault, { isDefault: true });
          await this.loadPersonas();
          this.showToast('Active roleplay identity updated.');
        } catch (err) {
          this.showToast(err.message);
        }
      });
    });

    this.listEl.querySelectorAll('[data-del-persona]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await this.api.deletePersona(btn.dataset.delPersona);
          await this.loadPersonas();
          this.showToast('Identity removed.');
        } catch (err) {
          this.showToast(err.message);
        }
      });
    });
  }

  #bindFormEvents() {
    if (!this.formEl) return;
    this.formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('personaNameInput').value.trim();
      const avatar = document.getElementById('personaAvatarInput').value.trim() || toMonogram(name, '');
      const description = document.getElementById('personaDescInput').value.trim();
      const isDefault = document.getElementById('personaDefaultCheck').checked;

      if (!name) {
        this.showToast('Enter an identity name.');
        return;
      }

      try {
        await this.api.createPersona({ name, avatar, description, isDefault });
        this.formEl.reset();
        await this.loadPersonas();
        this.showToast(`Registered identity "${name}".`);
      } catch (err) {
        this.showToast(err.message);
      }
    });
  }

  #escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export function initPersonasModule(appState, showToast) {
  return new PersonaManager(appState, showToast);
}
