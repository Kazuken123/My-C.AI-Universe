/**
 * Standard API error detail returned by Express BaseController
 */
export interface ApiErrorDetail {
  message: string;
  code?: number;
  field?: string;
}

/**
 * Standard API error response body
 */
export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

/**
 * Strongly typed error thrown by ApiClient
 */
export class ApiError extends Error {
  public status: number;
  public code?: number;
  public field?: string;
  public data?: unknown;

  constructor(message: string, status = 500, code?: number, field?: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || status;
    this.field = field;
    this.data = data;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static fromResponse(data: unknown, status = 500, fallbackMessage = `HTTP ${status}: Request failed`): ApiError {
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const rawError = (data as { error?: unknown }).error;
      if (typeof rawError === 'object' && rawError !== null) {
        const detail = rawError as Partial<ApiErrorDetail>;
        const message = typeof detail.message === 'string' && detail.message.trim()
          ? detail.message
          : fallbackMessage;
        const code = typeof detail.code === 'number' ? detail.code : status;
        const field = typeof detail.field === 'string' ? detail.field : undefined;
        return new ApiError(message, status, code, field, data);
      }
      if (typeof rawError === 'string' && rawError.trim()) {
        return new ApiError(rawError, status, status, undefined, data);
      }
    }
    if (typeof data === 'string' && data.trim()) {
      return new ApiError(data, status, status, undefined, data);
    }
    return new ApiError(fallbackMessage, status, status, undefined, data);
  }
}

/**
 * Health check response from GET /api/health
 */
export interface HealthResponse {
  status: string;
  database: string;
  stats?: {
    users?: number;
    characters?: number;
    chat_sessions?: number;
  };
  aiProvider?: string;
  uptime?: number;
}

/**
 * Telemetry ping response from GET /api/system/ping
 */
export interface SystemPingResponse {
  status: string;
  version: string;
  uptime: number;
  timestamp: string;
}

/**
 * Admin telemetry overview from GET /api/admin/overview
 */
export interface AdminOverviewResponse {
  telemetry: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    databaseEngine: string;
    aiProvider: string;
    aiModel: string;
    memory: {
      rss: string;
      heapUsed: string;
      heapTotal: string;
    };
  };
  counts: {
    totalUsers: number;
    admins: number;
    standardUsers: number;
    characters: number;
    chatSessions: number;
    chatMessages: number;
    personas: number;
    memories: number;
  };
  securityChecklist: Array<{
    id: number;
    rule: string;
    status: 'pass' | 'fail' | 'info';
    severity: 'critical' | 'high' | 'medium' | 'low';
    detail: string;
  }>;
  rateLimiters: {
    global: { activeKeysCount: number; throttledCount: number; throttled: string[] };
    auth: { activeKeysCount: number; throttledCount: number; throttled: string[] };
    sensitiveAi: { activeKeysCount: number; throttledCount: number; throttled: string[] };
  };
}
