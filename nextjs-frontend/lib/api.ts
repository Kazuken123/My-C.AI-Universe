import { getAuthToken, setAuthToken, removeAuthToken } from './auth';
import { ApiError, HealthResponse, SystemPingResponse, AdminOverviewResponse } from '@/types/api';
import type {
  AuthResponse,
  AuthMeResponse,
  LoginCredentials,
  RegisterPayload,
  SocialAuthPayload,
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  VerifyResetCodePayload,
  VerifyResetCodeResponse,
  ResetPasswordPayload,
  ResetPasswordResponse,
  UpdateProfilePayload,
  UploadAvatarResponse,
  LogoutResponse,
  User,
} from '@/types/auth';
import type {
  Character,
  CharacterListParams,
  CharacterCreatePayload,
  CharacterUpdatePayload,
  CharacterLikeResponse,
  WikiParseResponse,
  AIGenerateCharacterResponse,
} from '@/types/character';
import type {
  ChatSession,
  ChatSessionSummary,
  CreateChatSessionPayload,
  SendChatMessagePayload,
  SendChatMessageResponse,
  ChatStreamDoneChunk,
  UpdateMessagePayload,
  UpdateMessageResponse,
  UpdateRelationshipPayload,
  RelationshipMetrics,
} from '@/types/chat';
import type {
  UserPersona,
  PersonaCreatePayload,
  PersonaUpdatePayload,
} from '@/types/persona';
import type {
  CharacterMemory,
  MemoriesResponse,
} from '@/types/memory';

export interface RequestOptions extends RequestInit {
  silent?: boolean;
  token?: string | null;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic REST request dispatcher with automatic JWT injection and error parsing
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const token = options.token !== undefined ? options.token : getAuthToken();

    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await response.json().catch(() => ({})) : await response.text();

      if (!response.ok) {
        const errorDetail =
          typeof data === 'object' && data !== null && 'error' in data
            ? (data as { error: { message?: string; code?: number; field?: string } }).error
            : null;

        const message =
          errorDetail?.message ||
          (typeof data === 'string' && data ? data : `HTTP ${response.status}: Request failed`);
        const code = errorDetail?.code || response.status;
        const field = errorDetail?.field;

        throw new ApiError(message, response.status, code, field, data);
      }

      return data as T;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network request failed';
      throw new ApiError(message, 500);
    }
  }

  // ==========================================
  // Authentication & Profile Endpoints
  // ==========================================

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res?.token) setAuthToken(res.token);
    return res;
  }

  async login(payload: LoginCredentials): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res?.token) setAuthToken(res.token);
    return res;
  }

  async socialAuth(payload: SocialAuthPayload): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/social', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res?.token) setAuthToken(res.token);
    return res;
  }

  getMe(token?: string): Promise<AuthMeResponse> {
    return this.request<AuthMeResponse>('/api/auth/me', { method: 'GET', token });
  }

  updateProfile(payload: UpdateProfilePayload): Promise<{ user: User; message: string }> {
    return this.request<{ user: User; message: string }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  uploadAvatar(base64Image: string): Promise<UploadAvatarResponse> {
    return this.request<UploadAvatarResponse>('/api/auth/upload-avatar', {
      method: 'POST',
      body: JSON.stringify({ image: base64Image }),
    });
  }

  forgotPassword(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
    return this.request<ForgotPasswordResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  verifyResetCode(payload: VerifyResetCodePayload): Promise<VerifyResetCodeResponse> {
    return this.request<VerifyResetCodeResponse>('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  resetPassword(payload: ResetPasswordPayload): Promise<ResetPasswordResponse> {
    return this.request<ResetPasswordResponse>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async logout(): Promise<LogoutResponse> {
    try {
      return await this.request<LogoutResponse>('/api/auth/logout', { method: 'POST' });
    } finally {
      removeAuthToken();
    }
  }

  // ==========================================
  // Character Endpoints
  // ==========================================

  getCharacters(params: CharacterListParams = {}): Promise<Character[]> {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('search', params.search);
    if (params.category && params.category !== 'All') searchParams.set('category', params.category);
    if (params.sort) searchParams.set('sort', params.sort);
    const qs = searchParams.toString();
    return this.request<Character[]>(`/api/characters${qs ? `?${qs}` : ''}`);
  }

  getCharacter(id: string): Promise<Character> {
    return this.request<Character>(`/api/character/${encodeURIComponent(id)}`);
  }

  createCharacter(payload: CharacterCreatePayload): Promise<Character> {
    return this.request<Character>('/api/character', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateCharacter(id: string, payload: CharacterUpdatePayload): Promise<Character> {
    return this.request<Character>(`/api/character/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  deleteCharacter(id: string): Promise<{ success: boolean; deletedId: string }> {
    return this.request<{ success: boolean; deletedId: string }>(`/api/character/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  toggleLike(id: string): Promise<CharacterLikeResponse> {
    return this.request<CharacterLikeResponse>(`/api/character/${encodeURIComponent(id)}/like`, {
      method: 'POST',
    });
  }

  parseWiki(url: string): Promise<WikiParseResponse> {
    return this.request<WikiParseResponse>('/api/character/parse-wiki', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  generateCharacterAI(concept: string): Promise<AIGenerateCharacterResponse> {
    return this.request<AIGenerateCharacterResponse>('/api/character/generate', {
      method: 'POST',
      body: JSON.stringify({ concept }),
    });
  }

  // ==========================================
  // Persona Endpoints
  // ==========================================

  getPersonas(): Promise<UserPersona[]> {
    return this.request<UserPersona[]>('/api/personas');
  }

  createPersona(payload: PersonaCreatePayload): Promise<UserPersona> {
    return this.request<UserPersona>('/api/personas', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updatePersona(id: string, payload: PersonaUpdatePayload): Promise<UserPersona> {
    return this.request<UserPersona>(`/api/personas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  setDefaultPersona(id: string): Promise<UserPersona> {
    return this.updatePersona(id, { isDefault: true });
  }

  deletePersona(id: string): Promise<{ success: boolean; deletedId: string }> {
    return this.request<{ success: boolean; deletedId: string }>(`/api/personas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Chat Sessions & Streaming Endpoints
  // ==========================================

  getChatSessions(characterId?: string): Promise<ChatSessionSummary[]> {
    const qs = characterId ? `?characterId=${encodeURIComponent(characterId)}` : '';
    return this.request<ChatSessionSummary[]>(`/api/chats${qs}`);
  }

  createChatSession(payload: CreateChatSessionPayload): Promise<ChatSession> {
    return this.request<ChatSession>('/api/chats', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getChatSession(sessionId: string): Promise<ChatSession> {
    return this.request<ChatSession>(`/api/chats/${encodeURIComponent(sessionId)}`);
  }

  deleteChatSession(sessionId: string): Promise<{ success: boolean; deletedId: string }> {
    return this.request<{ success: boolean; deletedId: string }>(`/api/chats/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  updateSessionRelationship(
    sessionId: string,
    payload: UpdateRelationshipPayload
  ): Promise<{ success: boolean; relationship: RelationshipMetrics; session: ChatSession }> {
    return this.request<{ success: boolean; relationship: RelationshipMetrics; session: ChatSession }>(
      `/api/chats/${encodeURIComponent(sessionId)}/relationship`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }

  sendChatMessage(payload: SendChatMessagePayload): Promise<SendChatMessageResponse> {
    return this.request<SendChatMessageResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      silent: true,
    });
  }

  /**
   * Real-Time SSE Token Stream Consumer
   */
  async sendChatMessageStream(
    payload: SendChatMessagePayload,
    onToken: (token: string) => void,
    onDone?: (doneChunk: ChatStreamDoneChunk) => Promise<void> | void
  ): Promise<void> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}`, 'x-auth-token': token } : {}),
    };

    const response = await fetch(`${this.baseUrl}/api/chat?stream=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data?.error?.message || `HTTP ${response.status}: Chat stream failed`;
      throw new ApiError(message, response.status, data?.error?.code);
    }

    if (!response.body) {
      throw new ApiError('ReadableStream not supported by response body', 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
      let receivedDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const trimmed = event.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
          const parsed = JSON.parse(jsonStr);
          if (parsed.error) throw new Error(typeof parsed.error === 'string' ? parsed.error : parsed.error.message);
          if (parsed.token) onToken(parsed.token);
          if (parsed.done) {
            receivedDone = true;
            if (typeof onDone === 'function') await onDone(parsed);
          }
      }
    }
    if (!receivedDone) throw new Error('Stream ended before the turn was saved');
  }

  updateChatMessage(
    sessionId: string,
    messageId: string,
    payload: UpdateMessagePayload
  ): Promise<UpdateMessageResponse> {
    return this.request<UpdateMessageResponse>(
      `/api/chats/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
        silent: true,
      }
    );
  }

  rewindChatSession(sessionId: string, messageId: string): Promise<ChatSession> {
    return this.request<ChatSession>(`/api/chats/${encodeURIComponent(sessionId)}/rewind`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
      silent: true,
    });
  }

  // ==========================================
  // Memories Endpoints
  // ==========================================

  getMemories(characterId: string, sessionId?: string): Promise<MemoriesResponse> {
    const qs = new URLSearchParams({ characterId });
    if (sessionId) qs.set('sessionId', sessionId);
    return this.request<MemoriesResponse>(`/api/memories?${qs.toString()}`);
  }

  addMemory(characterId: string, content: string): Promise<CharacterMemory> {
    return this.request<CharacterMemory>('/api/memories', {
      method: 'POST',
      body: JSON.stringify({ characterId, content, source: 'manual' }),
    });
  }

  deleteMemory(id: string): Promise<{ success: boolean; deletedId: string }> {
    return this.request<{ success: boolean; deletedId: string }>(`/api/memories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Administrative Operations
  // ==========================================

  getAdminOverview(): Promise<AdminOverviewResponse> {
    return this.request<AdminOverviewResponse>('/api/admin/overview');
  }

  getAdminUsers(): Promise<User[]> {
    return this.request<User[]>('/api/admin/users');
  }

  updateUserRole(userId: string, role: 'admin' | 'user'): Promise<{ success: boolean; user: User; message: string }> {
    return this.request<{ success: boolean; user: User; message: string }>(
      `/api/admin/users/${encodeURIComponent(userId)}/role`,
      {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }
    );
  }

  deleteAdminUser(userId: string): Promise<{ success: boolean; deletedId: string; message: string }> {
    return this.request<{ success: boolean; deletedId: string; message: string }>(
      `/api/admin/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  }

  getAdminCharacters(): Promise<Character[]> {
    return this.request<Character[]>('/api/admin/characters');
  }

  deleteAdminCharacter(characterId: string): Promise<{ success: boolean; deletedId: string; message: string }> {
    return this.request<{ success: boolean; deletedId: string; message: string }>(
      `/api/admin/characters/${encodeURIComponent(characterId)}`,
      { method: 'DELETE' }
    );
  }

  getAdminRateLimits(): Promise<AdminOverviewResponse['rateLimiters']> {
    return this.request<AdminOverviewResponse['rateLimiters']>('/api/admin/rate-limits');
  }

  unblockClient(key: string, limiter = 'all'): Promise<{ success: boolean; key: string; message: string }> {
    return this.request<{ success: boolean; key: string; message: string }>('/api/admin/rate-limits/unblock', {
      method: 'POST',
      body: JSON.stringify({ key, limiter }),
    });
  }

  // ==========================================
  // System Health Endpoints
  // ==========================================

  getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/health', { silent: true });
  }

  getPing(): Promise<SystemPingResponse> {
    return this.request<SystemPingResponse>('/api/system/ping', { silent: true });
  }

  // ==========================================
  // Voice & TTS Endpoints
  // ==========================================

  searchVoiceModels(params: { search?: string; page?: number; pageSize?: number } = {}): Promise<{
    success: boolean;
    total: number;
    items: Array<{
      id: string;
      title: string;
      description: string;
      author: string;
      coverImage: string | null;
      tags: string[];
      sampleAudio: string | null;
    }>;
    unconfigured?: boolean;
  }> {
    const sp = new URLSearchParams();
    if (params.search) sp.set('search', params.search);
    if (params.page) sp.set('page', String(params.page));
    if (params.pageSize) sp.set('pageSize', String(params.pageSize));
    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return this.request(`/api/voice/models${qs}`);
  }

  createCustomVoice(payload: { title: string; description?: string; audioDataUrl: string }): Promise<{
    success: boolean;
    voice: { id: string; title: string };
  }> {
    return this.request('/api/voice/custom', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateSessionVoice(sessionId: string, payload: { voiceIdOverride?: string; voiceNameOverride?: string }): Promise<{
    success: boolean;
    voiceIdOverride: string;
    voiceNameOverride: string;
    session: ChatSession;
  }> {
    return this.request(`/api/chats/${encodeURIComponent(sessionId)}/voice`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async synthesizeMessageVoice(payload: { sessionId: string; messageId: string; variantIndex?: number }): Promise<Blob> {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }

    const res = await fetch(`${this.baseUrl}/api/voice/synthesize`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errData: any;
      try {
        errData = await res.json();
      } catch {
        errData = { error: `Voice synthesis failed (${res.status})` };
      }
      throw new ApiError(errData?.error || 'Voice synthesis failed', res.status, errData);
    }

    return await res.blob();
  }
}

export const api = new ApiClient();
