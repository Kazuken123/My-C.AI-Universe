/**
 * Frontend REST API Client for My C.AI Universe
 */
async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `HTTP Error ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  // Health
  getHealth: () => request('/api/health'),

  // Characters
  getCharacters: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'All') qs.set('category', params.category);
    if (params.sort) qs.set('sort', params.sort);
    const queryStr = qs.toString();
    return request(`/api/characters${queryStr ? `?${queryStr}` : ''}`);
  },
  getCharacter: (id) => request(`/api/character/${encodeURIComponent(id)}`),
  createCharacter: (payload) => request('/api/character', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateCharacter: (id, payload) => request(`/api/character/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }),
  deleteCharacter: (id) => request(`/api/character/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }),
  toggleLike: (id) => request(`/api/character/${encodeURIComponent(id)}/like`, {
    method: 'POST'
  }),
  parseWikiPreview: (url) => request('/api/character/parse-wiki', {
    method: 'POST',
    body: JSON.stringify({ url })
  }),
  generateCharacterAI: (concept) => request('/api/character/generate', {
    method: 'POST',
    body: JSON.stringify({ concept })
  }),

  // Chat Sessions & Messages
  getChatSessions: (characterId = null) => {
    const qs = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
    return request(`/api/chats${qs}`);
  },
  createChatSession: (payload) => request('/api/chats', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getChatSession: (sessionId) => request(`/api/chats/${encodeURIComponent(sessionId)}`),
  deleteChatSession: (sessionId) => request(`/api/chats/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE'
  }),
  sendChatMessage: (payload) => request('/api/chat', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updateChatMessage: (sessionId, messageId, payload) =>
    request(`/api/chats/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  rewindChatSession: (sessionId, messageId) =>
    request(`/api/chats/${encodeURIComponent(sessionId)}/rewind`, {
      method: 'POST',
      body: JSON.stringify({ messageId })
    }),

  // Personas
  getPersonas: () => request('/api/personas'),
  createPersona: (payload) => request('/api/personas', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  updatePersona: (id, payload) => request(`/api/personas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }),
  deletePersona: (id) => request(`/api/personas/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }),

  // Long-Term Memories
  getMemories: (characterId) => {
    const qs = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
    return request(`/api/memories${qs}`);
  },
  addMemory: (characterId, content) => request('/api/memories', {
    method: 'POST',
    body: JSON.stringify({ characterId, content, source: 'manual' })
  }),
  deleteMemory: (id) => request(`/api/memories/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
};
