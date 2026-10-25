import { loadingBar } from './loading-bar.js';

/**
 * ApiClient Class (Frontend OOP REST Client)
 * Encapsulates all HTTP requests to the My C.AI Universe backend API.
 */
export class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  getToken() {
    return localStorage.getItem('cai_auth_token') || null;
  }

  setToken(token) {
    const secureFlag = (typeof window !== 'undefined' && window.location?.protocol === 'https:') ? '; Secure' : '';
    if (token) {
      localStorage.setItem('cai_auth_token', token);
      if (typeof document !== 'undefined') {
        document.cookie = `cai_auth_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax${secureFlag}`;
      }
    } else {
      localStorage.removeItem('cai_auth_token');
      if (typeof document !== 'undefined') {
        document.cookie = `cai_auth_token=; path=/; max-age=0; SameSite=Lax${secureFlag}`;
      }
    }
  }

  async request(url, options = {}) {
    // In-chat messaging operations have inline typing/streaming feedback; do not flash page loading bar
    const isChatMessageEndpoint = typeof url === 'string' && (
      url.startsWith('/api/chat') ||
      url.includes('/messages') ||
      url.includes('/rewind')
    );
    const silent = options.silent === true || isChatMessageEndpoint;
    if (!silent) {
      loadingBar.start();
    }
    try {
      const token = this.getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
      };

      const response = await fetch(`${this.baseUrl}${url}`, {
        headers,
        ...options
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || `HTTP Error ${response.status}`;
        throw new Error(message);
      }
      return data;
    } finally {
      if (!silent) {
        loadingBar.done();
      }
    }
  }

  // Authentication
  async register(payload) {
    const res = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res?.token) this.setToken(res.token);
    return res;
  }

  async login(payload) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res?.token) this.setToken(res.token);
    return res;
  }

  async socialLogin(payload) {
    const res = await this.request('/api/auth/social', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res?.token) this.setToken(res.token);
    return res;
  }

  forgotPassword(email) {
    return this.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  verifyResetCode(payload) {
    return this.request('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  resetPassword(payload) {
    return this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  getMe() {
    return this.request('/api/auth/me');
  }

  updateProfile(payload) {
    return this.request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  uploadAvatar(imageData) {
    return this.request('/api/auth/upload-avatar', {
      method: 'POST',
      body: JSON.stringify({ image: imageData })
    });
  }

  async getCurrentUser() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const data = await this.getMe();
      return data?.user || null;
    } catch {
      return null;
    }
  }

  logout() {
    this.setToken(null);
    return this.request('/api/auth/logout', { method: 'POST' }).catch(() => ({}));
  }

  // Health
  getHealth(options = {}) {
    return this.request('/api/health', { silent: true, ...options });
  }

  // Characters
  getCharacters(params = {}) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'All') qs.set('category', params.category);
    if (params.sort) qs.set('sort', params.sort);
    const queryStr = qs.toString();
    return this.request(`/api/characters${queryStr ? `?${queryStr}` : ''}`);
  }

  getCharacter(id) {
    return this.request(`/api/character/${encodeURIComponent(id)}`);
  }

  createCharacter(payload) {
    return this.request('/api/character', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  updateCharacter(id, payload) {
    return this.request(`/api/character/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  deleteCharacter(id) {
    return this.request(`/api/character/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  toggleLike(id) {
    return this.request(`/api/character/${encodeURIComponent(id)}/like`, {
      method: 'POST'
    });
  }

  parseWikiPreview(url) {
    return this.request('/api/character/parse-wiki', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  }

  parseWiki(url) {
    return this.parseWikiPreview(url);
  }

  generateCharacterAI(concept) {
    return this.request('/api/character/generate', {
      method: 'POST',
      body: JSON.stringify({ concept })
    });
  }

  generateCharacter(concept) {
    return this.generateCharacterAI(concept);
  }

  // Chat Sessions & Messages
  getChatSessions(characterId = null) {
    const qs = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
    return this.request(`/api/chats${qs}`);
  }

  createChatSession(payload) {
    return this.request('/api/chats', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  getChatSession(sessionId) {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}`);
  }

  deleteChatSession(sessionId) {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    });
  }

  updateSessionRelationship(sessionId, payload) {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}/relationship`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  sendChatMessage(payload) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      silent: true
    });
  }

  async sendChatMessageStream(payload, onToken, onDone) {
    try {
      const token = this.getToken();
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const response = await fetch(`${this.baseUrl}/api/chat?stream=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error?.message || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.token && typeof onToken === 'function') {
              onToken(parsed.token);
            }
            if (parsed.done && typeof onDone === 'function') {
              onDone(parsed);
            }
          } catch {
            // ignore chunk parse error
          }
        }
      }
    } finally {
      // Stream completed cleanly without page-loader flicker
    }
  }

  updateChatMessage(sessionId, messageId, payload) {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      silent: true
    });
  }

  rewindChatSession(sessionId, messageId) {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}/rewind`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
      silent: true
    });
  }

  // Personas
  getPersonas() {
    return this.request('/api/personas');
  }

  createPersona(payload) {
    return this.request('/api/personas', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  updatePersona(id, payload) {
    return this.request(`/api/personas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  setDefaultPersona(id) {
    return this.updatePersona(id, { isDefault: true });
  }

  deletePersona(id) {
    return this.request(`/api/personas/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  // Long-Term Memories
  getMemories(characterId, sessionId = null) {
    const qs = new URLSearchParams();
    if (characterId) qs.set('characterId', characterId);
    if (sessionId) qs.set('sessionId', sessionId);
    const query = qs.toString();
    return this.request(`/api/memories${query ? `?${query}` : ''}`);
  }

  addMemory(characterId, content) {
    return this.request('/api/memories', {
      method: 'POST',
      body: JSON.stringify({ characterId, content, source: 'manual' })
    });
  }

  deleteMemory(id) {
    return this.request(`/api/memories/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }

  // Administrative Operations & SOC Monitoring
  getAdminOverview(options = {}) {
    return this.request('/api/admin/overview', options);
  }

  getAdminUsers() {
    return this.request('/api/admin/users');
  }

  updateUserRole(userId, role) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  }

  deleteAdminUser(userId) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
  }

  getAdminCharacters() {
    return this.request('/api/admin/characters');
  }

  deleteAdminCharacter(characterId) {
    return this.request(`/api/admin/characters/${encodeURIComponent(characterId)}`, {
      method: 'DELETE'
    });
  }

  getAdminRateLimits(options = {}) {
    return this.request('/api/admin/rate-limits', options);
  }

  unblockClient(key, limiter = 'all') {
    return this.request('/api/admin/rate-limits/unblock', {
      method: 'POST',
      body: JSON.stringify({ key, limiter })
    });
  }
}

export const api = new ApiClient();
export { loadingBar };

// Synchronize existing localStorage session token to cookie for server-side HTML route protection
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    const existingToken = localStorage.getItem('cai_auth_token');
    if (existingToken && !document.cookie.includes('cai_auth_token=')) {
      const secureFlag = window.location?.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `cai_auth_token=${encodeURIComponent(existingToken)}; path=/; max-age=604800; SameSite=Lax${secureFlag}`;
    }
  } catch {}
}
