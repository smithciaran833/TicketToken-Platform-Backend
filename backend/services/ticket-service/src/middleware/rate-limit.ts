import { FastifyRequest, FastifyReply } from 'fastify';
import { RedisService } from '../services/redisService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RateLimiter' });

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Redis key prefix
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;      // Don't count failed requests
}

/**
 * Rate limit tiers for different endpoint types
 */
export const RateLimitTiers = {
  // Global default rate limit
  GLOBAL: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:global'
  },
  
  // Read operations (GET requests)
  READ: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:read'
  },
  
  // Write operations (POST/PUT/DELETE)
  WRITE: {
    windowMs: 60000,      // 1 minute
    maxRequests: 10,
    keyPrefix: 'ratelimit:write'
  },
  
  // Purchase operations (critical path)
  PURCHASE: {
    windowMs: 60000,      // 1 minute
    maxRequests: 5,
    keyPrefix: 'ratelimit:purchase'
  },
  
  // Transfer operations
  TRANSFER: {
    windowMs: 60000,      // 1 minute
    maxRequests: 5,
    keyPrefix: 'ratelimit:transfer'
  },
  
  // Admin operations
  ADMIN: {
    windowMs: 60000,      // 1 minute
    maxRequests: 20,
    keyPrefix: 'ratelimit:admin'
  },
  
  // Webhook operations (per tenant)
  WEBHOOK: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:webhook'
  },
  
  // QR validation (venue scanners)
  QR_SCAN: {
    windowMs: 60000,      // 1 minute
    maxRequests: 30,
    keyPrefix: 'ratelimit:qr-scan'
  }
};

/**
 * Creates a rate limiter middleware with the specified configuration
 */
export function createRateLimiter(config: RateLimitConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip rate limiting if disabled
    if (process.env.ENABLE_RATE_LIMITING === 'false') {
      return;
    }

    try {
      // Get user identifier (IP address or user ID)
      const userId = (request as any).user?.id || (request as any).user?.sub;
      const identifier = userId || request.ip || 'anonymous';

      // Create rate limit key
      const key = `${config.keyPrefix}:${identifier}`;

      // Get current count and TTL from Redis
      const redis = RedisService.getClient();
      const current = await redis.get(key);
      const currentCount = current ? parseInt(current, 10) : 0;

      // Check if limit exceeded
      if (currentCount >= config.maxRequests) {
        const ttl = await redis.ttl(key);
        const resetTime = Date.now() + (ttl * 1000);

        log.warn('Rate limit exceeded', {
          identifier,
          keyPrefix: config.keyPrefix,
          currentCount,
          limit: config.maxRequests,
          resetTime
        });

        // Set rate limit headers
        reply.header('X-RateLimit-Limit', config.maxRequests);
        reply.header('X-RateLimit-Remaining', 0);
        reply.header('X-RateLimit-Reset', resetTime);
        reply.header('Retry-After', ttl);

        return reply.status(429).send({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please try again in ${ttl} seconds.`,
          retryAfter: ttl
        });
      }

      // Increment counter
      const newCount = await redis.incr(key);

      // Set expiry on first request
      if (newCount === 1) {
        await redis.pexpire(key, config.windowMs);
      }

      // Set rate limit headers
      const remaining = Math.max(0, config.maxRequests - newCount);
      const ttl = await redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);

      reply.header('X-RateLimit-Limit', config.maxRequests);
      reply.header('X-RateLimit-Remaining', remaining);
      reply.header('X-RateLimit-Reset', resetTime);

    } catch (error) {
      // Log error but don't block request if rate limiting fails
      log.error('Rate limiting error', { error });
      // Allow request to proceed
    }
  };
}

/**
 * Pre-configured rate limiters for different endpoint types
 */
export const rateLimiters = {
  global: createRateLimiter(RateLimitTiers.GLOBAL),
  read: createRateLimiter(RateLimitTiers.READ),
  write: createRateLimiter(RateLimitTiers.WRITE),
  purchase: createRateLimiter(RateLimitTiers.PURCHASE),
  transfer: createRateLimiter(RateLimitTiers.TRANSFER),
  admin: createRateLimiter(RateLimitTiers.ADMIN),
  webhook: createRateLimiter(RateLimitTiers.WEBHOOK),
  qrScan: createRateLimiter(RateLimitTiers.QR_SCAN)
};

/**
 * Rate limiter that combines multiple tiers
 * Checks all tiers and fails if any limit is exceeded
 */
export function combinedRateLimiter(...limiters: Array<(req: FastifyRequest, reply: FastifyReply) => Promise<void>>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    for (const limiter of limiters) {
      await limiter(request, reply);
      // If response was sent (429), stop checking other limiters
      if (reply.sent) {
        return;
      }
    }
  };
}
