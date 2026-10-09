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
    if (token) {
      localStorage.setItem('cai_auth_token', token);
    } else {
      localStorage.removeItem('cai_auth_token');
    }
  }

  async request(url, options = {}) {
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
  getHealth() {
    return this.request('/api/health');
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

  sendChatMessage(payload) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  updateChatMessage(sessionId, messageId, payload) {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  rewindChatSession(sessionId, messageId) {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}/rewind`, {
      method: 'POST',
      body: JSON.stringify({ messageId })
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
  getMemories(characterId) {
    const qs = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
    return this.request(`/api/memories${qs}`);
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
}

export const api = new ApiClient();
