import { api } from './api.js';

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
    if (this.sidebarPersonaEmoji) this.sidebarPersonaEmoji.textContent = active.avatar || '🌟';
  }

  renderChatPersonaSelector() {
    if (!this.chatPersonaSelect) return;
    this.chatPersonaSelect.innerHTML = this.appState.personas
      .map(p => `<option value="${p.id}" ${p.isDefault ? 'selected' : ''}>${p.avatar || '👤'} ${this.#escapeHtml(p.name)}</option>`)
      .join('');
  }

  renderPersonasList() {
    if (!this.listEl) return;
    if (!this.appState.personas || this.appState.personas.length === 0) {
      this.listEl.innerHTML = `<p style="color: var(--text-muted);">No personas found.</p>`;
      return;
    }

    this.listEl.innerHTML = this.appState.personas.map(p => `
      <div class="cai-card" style="cursor: default;">
        <div class="cai-card-top">
          <div class="msg-avatar" style="width: 52px; height: 52px; font-size: 1.5rem; border: 1px solid var(--border-light);">
            ${this.#escapeHtml(p.avatar || '🌟')}
          </div>
          <div class="cai-card-info">
            <div class="cai-card-name">
              ${this.#escapeHtml(p.name)}
              ${p.isDefault ? '<span class="tag-badge" style="background: var(--accent); color: #fff; margin-left: 6px;">Active Default</span>' : ''}
            </div>
            <div class="cai-card-tagline" style="margin-top: 4px;">
              ${this.#escapeHtml(p.description || 'No persona bio set.')}
            </div>
          </div>
        </div>
        <div class="cai-card-footer">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Used across roleplay chats</span>
          <div class="card-actions">
            ${!p.isDefault ? `<button class="btn btn-secondary btn-sm" data-set-default="${p.id}">Set Active</button>` : ''}
            ${this.appState.personas.length > 1 ? `<button class="btn btn-danger btn-sm" data-del-persona="${p.id}">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    this.listEl.querySelectorAll('[data-set-default]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await this.api.updatePersona(btn.dataset.setDefault, { isDefault: true });
          await this.loadPersonas();
          this.showToast('Active roleplay persona updated!');
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
          this.showToast('Persona deleted.');
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
      const avatar = document.getElementById('personaAvatarInput').value.trim() || '🌟';
      const description = document.getElementById('personaDescInput').value.trim();
      const isDefault = document.getElementById('personaDefaultCheck').checked;

      if (!name) {
        this.showToast('Please enter a persona name.');
        return;
      }

      try {
        await this.api.createPersona({ name, avatar, description, isDefault });
        this.formEl.reset();
        await this.loadPersonas();
        this.showToast(`Created persona "${name}"!`);
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
