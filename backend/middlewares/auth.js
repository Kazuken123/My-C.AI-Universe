import { authService } from '../services/auth.service.js';

/**
 * Extract token from Authorization header or custom header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }
  if (req.headers['x-auth-token']) return req.headers['x-auth-token'];
  if (req.headers.cookie && typeof req.headers.cookie === 'string') {
    const match = req.headers.cookie.match(/(?:^|;\s*)cai_auth_token=([^;]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Optional Authentication Middleware
 * Attaches req.user if a valid token is provided, without blocking unauthenticated requests
 */
export async function optionalAuth(req, _res, next) {
  // If req.user is already evaluated on this request, avoid re-running DB query
  if (req.user !== undefined) {
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const user = await authService.getUserFromToken(token);
  req.user = user ? user : null;
  return next();
}

/**
 * Required Authentication Middleware
 * Enforces authenticated identity, returning 401 Unauthorized if not authenticated
 */
export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Authentication required. Please sign in or create an account.',
          code: 401
        }
      });
    }
    return next();
  });
}

/**
 * Required Admin Authentication Middleware
 * Enforces admin role, returning 401 if unauthenticated and 403 if not admin
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          message: 'Admin access required. You do not have permission to access this resource.',
          code: 403
        }
      });
    }
    return next();
  });
}
