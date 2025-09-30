// Simplified Rate Limiting Middleware

class RateLimiter {
  // Simple in-memory rate limiter for Express
  static createExpressLimiter(options = {}) {
    const requests = new Map();
    const windowMs = options.windowMs || 60000; // 1 minute default
    const max = options.max || 100; // 100 requests default
    
    return (req, res, next) => {
      const key = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      
      // Clean old entries
      for (const [k, v] of requests.entries()) {
        if (now - v.firstRequest > windowMs) {
          requests.delete(k);
        }
      }
      
      // Check rate limit
      if (!requests.has(key)) {
        requests.set(key, { count: 1, firstRequest: now });
        next();
      } else {
        const userData = requests.get(key);
        if (userData.count >= max) {
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests, please try again later',
              timestamp: new Date().toISOString(),
              requestId: req.id
            }
          });
        }
        userData.count++;
        next();
      }
    };
  }
  
  // Simple rate limiter for Fastify
  static createFastifyLimiter(options = {}) {
    const requests = new Map();
    const windowMs = options.windowMs || 60000;
    const max = options.max || 100;
    
    return {
      global: options.global !== false,
      max: max,
      timeWindow: windowMs,
      errorResponseBuilder: (req, context) => {
        return {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            max: context.max,
            ttl: context.ttl,
            timestamp: new Date().toISOString(),
            requestId: req.id
          }
        };
      }
    };
  }
  
  // Service-specific rate limits
  static limits = {
    auth: {
      register: { windowMs: 3600000, max: 5 }, // 5 per hour
      login: { windowMs: 900000, max: 10 }, // 10 per 15 minutes
      passwordReset: { windowMs: 3600000, max: 3 } // 3 per hour
    },
    api: {
      default: { windowMs: 60000, max: 100 }, // 100 per minute
      search: { windowMs: 60000, max: 30 }, // 30 per minute
      heavy: { windowMs: 60000, max: 10 } // 10 per minute for heavy operations
    }
  };
}

module.exports = RateLimiter;
