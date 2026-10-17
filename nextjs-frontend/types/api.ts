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
