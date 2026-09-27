import { api } from './api.js';

/**
 * User Personas Manager Module
 */
export function initPersonasModule(appState, showToast) {
  const listEl = document.getElementById('personas-list');
  const formEl = document.getElementById('persona-form');
  const sidebarPersonaName = document.getElementById('sidebar-persona-name');
  const sidebarPersonaEmoji = document.getElementById('sidebar-persona-emoji');
  const chatPersonaSelect = document.getElementById('chatPersonaSelect');

  async function loadPersonas() {
    try {
      const personas = await api.getPersonas();
      appState.personas = personas;
      appState.activePersona = personas.find(p => p.isDefault) || personas[0] || null;
      renderSidebarPersona();
      renderPersonasList();
      renderChatPersonaSelector();
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  }

  function renderSidebarPersona() {
    const active = appState.activePersona;
    if (!active) return;
    if (sidebarPersonaName) sidebarPersonaName.textContent = active.name;
    if (sidebarPersonaEmoji) sidebarPersonaEmoji.textContent = active.avatar || '🌟';
  }

  function renderChatPersonaSelector() {
    if (!chatPersonaSelect) return;
    chatPersonaSelect.innerHTML = appState.personas
      .map(p => `<option value="${p.id}" ${p.isDefault ? 'selected' : ''}>${p.avatar || '👤'} ${escapeHtml(p.name)}</option>`)
      .join('');
  }

  function renderPersonasList() {
    if (!listEl) return;
    if (!appState.personas || appState.personas.length === 0) {
      listEl.innerHTML = `<p style="color: var(--text-muted);">No personas found.</p>`;
      return;
    }

    listEl.innerHTML = appState.personas.map(p => `
      <div class="cai-card" style="cursor: default;">
        <div class="cai-card-top">
          <div class="msg-avatar" style="width: 52px; height: 52px; font-size: 1.5rem; border: 1px solid var(--border-light);">
            ${escapeHtml(p.avatar || '🌟')}
          </div>
          <div class="cai-card-info">
            <div class="cai-card-name">
              ${escapeHtml(p.name)}
              ${p.isDefault ? '<span class="tag-badge" style="background: var(--accent); color: #fff; margin-left: 6px;">Active Default</span>' : ''}
            </div>
            <div class="cai-card-tagline" style="margin-top: 4px;">
              ${escapeHtml(p.description || 'No persona bio set.')}
            </div>
          </div>
        </div>
        <div class="cai-card-footer">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Used across roleplay chats</span>
          <div class="card-actions">
            ${!p.isDefault ? `<button class="btn btn-secondary btn-sm" data-set-default="${p.id}">Set Active</button>` : ''}
            ${appState.personas.length > 1 ? `<button class="btn btn-danger btn-sm" data-del-persona="${p.id}">Delete</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-set-default]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.updatePersona(btn.dataset.setDefault, { isDefault: true });
          await loadPersonas();
          showToast('Active roleplay persona updated!');
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    listEl.querySelectorAll('[data-del-persona]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.deletePersona(btn.dataset.delPersona);
          await loadPersonas();
          showToast('Persona deleted.');
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  if (formEl) {
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('personaNameInput').value.trim();
      const avatar = document.getElementById('personaAvatarInput').value.trim() || '🌟';
      const description = document.getElementById('personaDescInput').value.trim();
      const isDefault = document.getElementById('personaDefaultCheck').checked;

      if (!name) {
        showToast('Please enter a persona name.');
        return;
      }

      try {
        await api.createPersona({ name, avatar, description, isDefault });
        formEl.reset();
        await loadPersonas();
        showToast(`Created persona "${name}"!`);
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  return { loadPersonas };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
