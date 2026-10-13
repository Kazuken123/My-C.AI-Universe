export function extractClientIp(req) {
  return req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Security Middleware Suite for My C.AI Universe
 * Provides in-memory Rate Limiting and HTTP Security Headers without external dependencies.
 */

export class MemoryRateLimiter {
  constructor({
    name = 'rate-limiter',
    windowMs = 60 * 1000,
    maxRequests = 100,
    message = 'Too many requests, please try again later.',
    keyGenerator = null
  } = {}) {
    this.name = name;
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.message = message;
    this.keyGenerator = keyGenerator;
    this.hits = new Map();

    // Periodic sweep to prevent memory leaks from stale IP keys
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.hits.entries()) {
        if (now - record.resetTime > this.windowMs) {
          this.hits.delete(key);
        }
      }
    }, Math.max(windowMs, 30000));

    // Ensure timer doesn't prevent Node process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  middleware() {
    return (req, res, next) => {
      let key;
      if (typeof this.keyGenerator === 'function') {
        key = this.keyGenerator(req);
      } else if (req.user && req.user.id) {
        key = `user:${req.user.id}`;
      } else {
        key = `ip:${extractClientIp(req)}`;
      }

      const now = Date.now();

      let record = this.hits.get(key);
      if (!record || now > record.resetTime) {
        record = {
          count: 1,
          resetTime: now + this.windowMs
        };
        this.hits.set(key, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, this.maxRequests - record.count);
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);

      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

      if (record.count > this.maxRequests) {
        res.setHeader('Retry-After', retryAfterSeconds);
        return res.status(429).json({
          error: this.message,
          retryAfter: retryAfterSeconds
        });
      }

      next();
    };
  }

  getStats() {
    const now = Date.now();
    const throttled = [];
    for (const [key, record] of this.hits.entries()) {
      if (record.count > this.maxRequests && record.resetTime > now) {
        throttled.push({
          key,
          count: record.count,
          maxRequests: this.maxRequests,
          retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000)
        });
      }
    }
    return {
      name: this.name,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests,
      activeKeysCount: this.hits.size,
      throttledCount: throttled.length,
      throttled
    };
  }

  resetKey(key) {
    return this.hits.delete(key);
  }

  resetAll() {
    this.hits.clear();
  }
}

/**
 * Security Headers Middleware (OWASP recommended baseline)
 */
export function securityHeadersMiddleware() {
  return (_req, res, next) => {
    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking / frame embedding
    res.setHeader('X-Frame-Options', 'DENY');
    // Cross-site scripting filter
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  };
}

// IP extractor helper
const getClientIp = (req) => `ip:${extractClientIp(req)}`;

// Global API rate limiter (120 req / minute)
export const globalRateLimiter = new MemoryRateLimiter({
  name: 'global-api',
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'API rate limit exceeded. Please wait a moment before sending more requests.',
  keyGenerator: getClientIp
});

// Strict rate limiter for authentication routes (login, register, reset password)
export const authRateLimiter = new MemoryRateLimiter({
  name: 'auth-endpoints',
  windowMs: 60 * 1000,
  maxRequests: process.env.NODE_ENV === 'test' ? 40 : 15,
  message: 'Too many authentication attempts. Please wait a minute before trying again.',
  keyGenerator: getClientIp
});

// Strict rate limiter for compute/AI-heavy endpoints (30 req / minute per user/IP)
export const sensitiveEndpointLimiter = new MemoryRateLimiter({
  name: 'sensitive-ai',
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'High-frequency request limit reached for AI / external scraping services. Please slow down.'
});
