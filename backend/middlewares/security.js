/**
 * Security Middleware Suite for My C.AI Universe
 * Provides in-memory Rate Limiting and HTTP Security Headers without external dependencies.
 */

export class MemoryRateLimiter {
  constructor({ windowMs = 60 * 1000, maxRequests = 100, message = 'Too many requests, please try again later.' } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.message = message;
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
      const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const now = Date.now();

      let record = this.hits.get(clientIp);
      if (!record || now > record.resetTime) {
        record = {
          count: 1,
          resetTime: now + this.windowMs
        };
        this.hits.set(clientIp, record);
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

// Global API rate limiter (120 req / minute)
export const globalRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'API rate limit exceeded. Please wait a moment before sending more requests.'
});

// Strict rate limiter for compute/AI-heavy endpoints (30 req / minute)
export const sensitiveEndpointLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'High-frequency request limit reached for AI / external scraping services. Please slow down.'
});
