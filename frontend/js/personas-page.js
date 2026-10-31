import { api } from './api.js';
import { initSidebar, showToast, escapeHtml } from './common.js';

class PersonasPageApp {
  constructor() {
    this.listEl = document.getElementById('personas-list');
    this.form = document.getElementById('persona-form');
    this.nameInput = document.getElementById('personaNameInput');
    this.avatarInput = document.getElementById('personaAvatarInput');
    this.descInput = document.getElementById('personaDescInput');
    this.defaultCheck = document.getElementById('personaDefaultCheck');
  }

  async loadPersonas() {
    if (!this.listEl) return;
    try {
      const personas = await api.getPersonas();
      if (!personas || personas.length === 0) {
        this.listEl.innerHTML = `
          <p style="color: var(--text-muted); font-size: 0.88rem; padding: 24px; border: 1px dashed var(--border-hairline); border-radius: var(--radius-md);">
            No custom personas registered yet. Fill out the form to register your first roleplay identity.
          </p>
        `;
        return;
      }

      this.listEl.innerHTML = personas.map(p => `
        <div class="persona-card-shell double-bezel-shell ${p.isDefault ? 'active' : ''}">
          <div class="persona-card-core double-bezel-core">
            <div class="persona-card-header">
              <div class="persona-card-meta">
                <div class="persona-glyph-badge">${escapeHtml(p.avatar || 'TR')}</div>
                <div class="persona-card-title-group">
                  <div class="persona-card-name">
                    <span>${escapeHtml(p.name)}</span>
                    ${p.isDefault ? `
                      <span class="persona-active-badge">
                        <span class="persona-active-dot"></span>
                        ACTIVE DEFAULT
                      </span>
                    ` : ''}
                  </div>
                </div>
              </div>

              <div class="persona-card-actions">
                ${!p.isDefault ? `
                  <button class="btn-secondary btn-sm" data-set-default="${escapeHtml(p.id)}" type="button" title="Set as default identity">
                    <i class="ph-light ph-check"></i>
                    <span>Set Default</span>
                  </button>
                ` : ''}
                <button class="icon-btn" data-delete-persona="${escapeHtml(p.id)}" type="button" title="Delete Persona">
                  <i class="ph-light ph-trash"></i>
                </button>
              </div>
            </div>

            <div class="persona-card-desc">
              ${escapeHtml(p.description || 'No backstory defined. Characters will use default traveler dialogue.')}
            </div>
          </div>
        </div>
      `).join('');

      this.listEl.querySelectorAll('[data-set-default]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api.setDefaultPersona(btn.dataset.setDefault);
            showToast('Active default persona updated.');
            await this.loadPersonas();
            await initSidebar('personas');
          } catch (err) {
            showToast(err.message);
          }
        });
      });

      this.listEl.querySelectorAll('[data-delete-persona]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Remove this roleplay identity?')) return;
          try {
            await api.deletePersona(btn.dataset.deletePersona);
            showToast('Persona removed.');
            await this.loadPersonas();
            await initSidebar('personas');
          } catch (err) {
            showToast(err.message);
          }
        });
      });
    } catch (err) {
      showToast('Could not load personas: ' + err.message);
    }
  }

  async init() {
    const currentUser = await api.getCurrentUser();
    if (!currentUser) {
      window.location.href = '/auth?mode=signin&return=/personas';
      return;
    }
    await initSidebar('personas');
    await this.loadPersonas();

    if (this.form) {
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = this.nameInput?.value.trim();
        if (!name) return;

        const payload = {
          name,
          avatar: this.avatarInput?.value.trim().toUpperCase() || 'TR',
          description: this.descInput?.value.trim() || '',
          isDefault: this.defaultCheck?.checked || false
        };

        try {
          await api.createPersona(payload);
          showToast(`Saved identity "${name}" to SQL.`);
          this.form.reset();
          if (this.avatarInput) this.avatarInput.value = 'AK';
          if (this.defaultCheck) this.defaultCheck.checked = true;
          await this.loadPersonas();
          await initSidebar('personas');
        } catch (err) {
          showToast('Failed to save persona: ' + err.message);
        }
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new PersonasPageApp();
  app.init();
});
