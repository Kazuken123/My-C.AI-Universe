import { api } from './api.js';
import { showToast, escapeHtml } from './common.js';

class AdminPageController {
  constructor() {
    this.currentUser = null;
    this.overviewData = null;
    this.usersData = [];
    this.charactersData = [];
    this.activeTab = 'security';
    this.autoRefreshInterval = null;

    this.accessDeniedEl = document.getElementById('adminAccessDenied');
    this.workspaceEl = document.getElementById('adminWorkspace');
    this.tabButtons = document.querySelectorAll('.admin-tab-btn');
    this.tabContents = document.querySelectorAll('.admin-tab-content');

    this.userSearchInput = document.getElementById('userSearchInput');
    this.charSearchInput = document.getElementById('characterSearchInput');
    this.btnRefresh = document.getElementById('btnRefreshAdmin');
  }

  async init() {
    try {
      this.currentUser = await api.getCurrentUser();
      if (!this.currentUser || this.currentUser.role !== 'admin') {
        this.showAccessDenied();
        return;
      }

      this.showWorkspace();
      this.bindEvents();
      await this.loadAll();

      // Auto-poll live rate limits and telemetry every 10 seconds
      this.autoRefreshInterval = setInterval(() => {
        if (this.activeTab === 'security') {
          this.loadOverview(true);
        }
      }, 10000);
    } catch {
      this.showAccessDenied();
    }
  }

  showAccessDenied() {
    if (this.accessDeniedEl) this.accessDeniedEl.classList.remove('hidden');
    if (this.workspaceEl) this.workspaceEl.classList.add('hidden');
  }

  showWorkspace() {
    if (this.accessDeniedEl) this.accessDeniedEl.classList.add('hidden');
    if (this.workspaceEl) this.workspaceEl.classList.remove('hidden');
  }

  bindEvents() {
    // Tabs switching
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Refresh button
    if (this.btnRefresh) {
      this.btnRefresh.addEventListener('click', async () => {
        this.btnRefresh.querySelector('i')?.classList.add('ph-spin');
        await this.loadAll();
        setTimeout(() => {
          this.btnRefresh.querySelector('i')?.classList.remove('ph-spin');
          showToast('Admin telemetry refreshed');
        }, 300);
      });
    }

    // User search filtering
    if (this.userSearchInput) {
      this.userSearchInput.addEventListener('input', () => {
        this.renderUsers();
      });
    }

    // Character search filtering
    if (this.charSearchInput) {
      this.charSearchInput.addEventListener('input', () => {
        this.renderCharacters();
      });
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.tabButtons.forEach(btn => {
      const match = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    this.tabContents.forEach(content => {
      const match = content.id === `tabContent-${tab}`;
      content.classList.toggle('hidden', !match);
    });

    if (tab === 'users' && this.usersData.length === 0) {
      this.loadUsers();
    } else if (tab === 'characters' && this.charactersData.length === 0) {
      this.loadCharacters();
    }
  }

  async loadAll() {
    await Promise.all([
      this.loadOverview(),
      this.loadUsers(),
      this.loadCharacters()
    ]);
  }

  async loadOverview(silent = false) {
    try {
      const data = await api.getAdminOverview();
      this.overviewData = data;
      this.renderOverview(data);
    } catch (err) {
      if (!silent) showToast('Failed to load overview: ' + err.message);
    }
  }

  renderOverview(data) {
    if (!data) return;

    // KPIs
    const elUsers = document.getElementById('kpiTotalUsers');
    const elAdmins = document.getElementById('kpiAdminCount');
    const elChars = document.getElementById('kpiTotalCharacters');
    const elSessions = document.getElementById('kpiTotalSessions');
    const elMessages = document.getElementById('kpiTotalMessages');
    const elDbEngine = document.getElementById('kpiDbEngine');

    if (elUsers) elUsers.textContent = data.counts.totalUsers;
    if (elAdmins) elAdmins.textContent = `${data.counts.admins} Admins, ${data.counts.standardUsers} Users`;
    if (elChars) elChars.textContent = data.counts.characters;
    if (elSessions) elSessions.textContent = data.counts.chatSessions;
    if (elMessages) elMessages.textContent = `${data.counts.chatMessages} total messages`;
    if (elDbEngine) elDbEngine.textContent = data.telemetry.databaseEngine || 'SQLite / Turso';

    // 7 Security Rules Checklist
    const secContainer = document.getElementById('securityChecklistContainer');
    if (secContainer && Array.isArray(data.securityChecklist)) {
      secContainer.innerHTML = data.securityChecklist.map(rule => {
        const badgeClass = rule.status === 'pass' ? 'badge-pass' : (rule.status === 'info' ? 'badge-info' : 'badge-warn');
        const badgeText = rule.status === 'pass' ? 'Active Guard' : (rule.status === 'info' ? 'Verified Safe' : 'Attention');
        return `
          <div class="sec-rule-card rule-${rule.severity || 'info'}">
            <div class="sec-card-header">
              <span class="sec-rule-num">RULE #${rule.id}</span>
              <span class="badge-pill ${badgeClass}">${badgeText}</span>
            </div>
            <h3 class="sec-rule-title">${escapeHtml(rule.rule)}</h3>
            <p class="sec-rule-desc">${escapeHtml(rule.detail)}</p>
          </div>
        `;
      }).join('');
    }

    // Rate Limiters Summary
    const rGlobal = data.rateLimiters?.global;
    const rAuth = data.rateLimiters?.auth;
    const rAi = data.rateLimiters?.sensitiveAi;

    const elLimitGlobal = document.getElementById('limitGlobalTracked');
    const elLimitAuth = document.getElementById('limitAuthTracked');
    const elLimitAi = document.getElementById('limitAiTracked');

    if (elLimitGlobal && rGlobal) elLimitGlobal.textContent = `${rGlobal.activeKeysCount} active keys`;
    if (elLimitAuth && rAuth) elLimitAuth.textContent = `${rAuth.activeKeysCount} active keys`;
    if (elLimitAi && rAi) elLimitAi.textContent = `${rAi.activeKeysCount} active keys`;

    // Throttled Clients Table
    const throttledBody = document.getElementById('throttledTableBody');
    if (throttledBody) {
      const allThrottled = [
        ...(rAuth?.throttled || []).map(t => ({ ...t, limiter: 'auth' })),
        ...(rAi?.throttled || []).map(t => ({ ...t, limiter: 'sensitiveAi' })),
        ...(rGlobal?.throttled || []).map(t => ({ ...t, limiter: 'global' }))
      ];

      if (allThrottled.length === 0) {
        throttledBody.innerHTML = `
          <tr>
            <td colspan="6" class="admin-empty-state">
              <i class="ph-light ph-check-circle" style="color: #34d399;"></i>
              No clients currently throttled. All traffic operating within safe limits.
            </td>
          </tr>
        `;
      } else {
        throttledBody.innerHTML = allThrottled.map(item => `
          <tr>
            <td><code style="color: #f87171;">${escapeHtml(item.key)}</code></td>
            <td><span class="badge-pill badge-info">${escapeHtml(item.limiter)}</span></td>
            <td><strong>${item.count}</strong></td>
            <td>${item.maxRequests}</td>
            <td>${item.retryAfterSeconds}s</td>
            <td>
              <button class="btn-admin-action btn-admin-success btn-unblock" data-key="${escapeHtml(item.key)}" data-limiter="${escapeHtml(item.limiter)}">
                <i class="ph-light ph-lock-key-open"></i> Unblock
              </button>
            </td>
          </tr>
        `).join('');

        throttledBody.querySelectorAll('.btn-unblock').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const key = e.currentTarget.getAttribute('data-key');
            const limiter = e.currentTarget.getAttribute('data-limiter');
            await this.unblockClient(key, limiter);
          });
        });
      }
    }

    // System Telemetry Tab
    const elUptime = document.getElementById('sysUptime');
    const elNode = document.getElementById('sysNode');
    const elPlatform = document.getElementById('sysPlatform');
    const elHeap = document.getElementById('sysHeapUsed');
    const elRss = document.getElementById('sysRss');
    const elAi = document.getElementById('sysAi');
    const elAiModel = document.getElementById('sysAiModel');
    const elRawJson = document.getElementById('rawDiagnosticsJson');

    if (elUptime) elUptime.textContent = `${data.telemetry.uptimeSeconds}s`;
    if (elNode) elNode.textContent = data.telemetry.nodeVersion;
    if (elPlatform) elPlatform.textContent = `Platform: ${data.telemetry.platform}`;
    if (elHeap) elHeap.textContent = data.telemetry.memory.heapUsed;
    if (elRss) elRss.textContent = `RSS: ${data.telemetry.memory.rss}`;
    if (elAi) elAi.textContent = data.telemetry.aiProvider;
    if (elAiModel) elAiModel.textContent = `Model: ${data.telemetry.aiModel}`;
    if (elRawJson) elRawJson.textContent = JSON.stringify(data, null, 2);
  }

  async unblockClient(key, limiter) {
    try {
      await api.unblockClient(key, limiter);
      showToast(`Key "${key}" unblocked successfully`);
      await this.loadOverview();
    } catch (err) {
      showToast('Unblock failed: ' + err.message);
    }
  }

  async loadUsers() {
    try {
      this.usersData = await api.getAdminUsers();
      this.renderUsers();
    } catch (err) {
      showToast('Failed to load users: ' + err.message);
    }
  }

  renderUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const query = (this.userSearchInput?.value || '').trim().toLowerCase();
    const filtered = this.usersData.filter(u =>
      !query ||
      u.username.toLowerCase().includes(query) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.displayName && u.displayName.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="admin-empty-state">
            <i class="ph-light ph-user-circle"></i>
            No users found matching "${escapeHtml(query)}"
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(u => {
      const isCurrent = u.id === this.currentUser?.id;
      const isAdmin = u.role === 'admin';
      const roleBadge = isAdmin
        ? '<span class="badge-pill badge-admin"><i class="ph-light ph-shield-star"></i> ADMIN</span>'
        : '<span class="badge-pill badge-user">USER</span>';

      const toggleRoleBtn = isCurrent
        ? '<span style="font-size: 0.75rem; color: rgba(255,255,255,0.4);">(Current User)</span>'
        : `
          <button class="btn-admin-action btn-toggle-role" data-id="${escapeHtml(u.id)}" data-role="${isAdmin ? 'user' : 'admin'}">
            <i class="ph-light ${isAdmin ? 'ph-user-minus' : 'ph-shield-plus'}"></i>
            ${isAdmin ? 'Demote to User' : 'Make Admin'}
          </button>
        `;

      const deleteBtn = isCurrent
        ? ''
        : `
          <button class="btn-admin-action btn-admin-danger btn-delete-user" data-id="${escapeHtml(u.id)}" data-username="${escapeHtml(u.username)}">
            <i class="ph-light ph-trash"></i> Delete
          </button>
        `;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.2rem;">${escapeHtml(u.avatar || '👤')}</span>
              <div>
                <strong>${escapeHtml(u.displayName || u.username)}</strong>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">@${escapeHtml(u.username)}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(u.email || 'N/A')}</td>
          <td>${roleBadge}</td>
          <td><span style="text-transform: capitalize;">${escapeHtml(u.authProvider)}</span></td>
          <td>${u.sessionCount || 0} chats</td>
          <td style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">${new Date(u.createdAt).toLocaleDateString()}</td>
          <td>
            <div style="display: flex; gap: 0.4rem; align-items: center;">
              ${toggleRoleBtn}
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Bind action listeners
    tbody.querySelectorAll('.btn-toggle-role').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const newRole = e.currentTarget.getAttribute('data-role');
        await this.handleUpdateRole(id, newRole);
      });
    });

    tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const username = e.currentTarget.getAttribute('data-username');
        if (confirm(`Are you sure you want to permanently delete user @${username}? This action is irreversible.`)) {
          await this.handleDeleteUser(id);
        }
      });
    });
  }

  async handleUpdateRole(userId, newRole) {
    try {
      await api.updateUserRole(userId, newRole);
      showToast(`User role updated to ${newRole}`);
      await this.loadUsers();
      await this.loadOverview(true);
    } catch (err) {
      showToast('Role update failed: ' + err.message);
    }
  }

  async handleDeleteUser(userId) {
    try {
      await api.deleteAdminUser(userId);
      showToast('User deleted successfully');
      await this.loadUsers();
      await this.loadOverview(true);
    } catch (err) {
      showToast('Delete failed: ' + err.message);
    }
  }

  async loadCharacters() {
    try {
      this.charactersData = await api.getAdminCharacters();
      this.renderCharacters();
    } catch (err) {
      showToast('Failed to load characters: ' + err.message);
    }
  }

  renderCharacters() {
    const tbody = document.getElementById('charactersTableBody');
    if (!tbody) return;

    const query = (this.charSearchInput?.value || '').trim().toLowerCase();
    const filtered = this.charactersData.filter(c =>
      !query ||
      c.name.toLowerCase().includes(query) ||
      (c.tagline && c.tagline.toLowerCase().includes(query)) ||
      (c.creator && c.creator.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="admin-empty-state">
            <i class="ph-light ph-mask-happy"></i>
            No characters found matching "${escapeHtml(query)}"
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(c => `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <img src="${escapeHtml(c.avatar || '/favicon.svg')}" alt="" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover;" onerror="this.src='/favicon.svg'" />
            <div>
              <strong>${escapeHtml(c.name)}</strong>
              <div style="font-size: 0.72rem; color: #a855f7;">ID: ${escapeHtml(c.id)}</div>
            </div>
          </div>
        </td>
        <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(c.tagline || '--')}
        </td>
        <td><code>${escapeHtml(c.creator || '@community')}</code></td>
        <td>${c.interactions || 0}</td>
        <td>${c.likes || 0}</td>
        <td>
          <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
            ${(c.categories || []).map(cat => `<span class="badge-pill badge-user" style="font-size: 0.65rem;">${escapeHtml(cat)}</span>`).join('')}
          </div>
        </td>
        <td>
          <button class="btn-admin-action btn-admin-danger btn-delete-char" data-id="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}">
            <i class="ph-light ph-trash"></i> Moderate
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-delete-char').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        if (confirm(`Are you sure you want to moderate and delete character "${name}"?`)) {
          await this.handleDeleteCharacter(id);
        }
      });
    });
  }

  async handleDeleteCharacter(charId) {
    try {
      await api.deleteAdminCharacter(charId);
      showToast('Character deleted by administrator');
      await this.loadCharacters();
      await this.loadOverview(true);
    } catch (err) {
      showToast('Character deletion failed: ' + err.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const adminPage = new AdminPageController();
  adminPage.init();
});
