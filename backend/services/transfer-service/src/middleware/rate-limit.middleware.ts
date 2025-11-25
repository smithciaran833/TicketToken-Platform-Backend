import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';

/**
 * RATE LIMIT MIDDLEWARE
 * 
 * Protects endpoints from abuse using Redis-based rate limiting
 * Phase 7: Production Readiness & Reliability
 */

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly config: RateLimitConfig
  ) {}

  async check(key: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const redisKey = `ratelimit:${key}`;

    // Remove old entries
    await this.redis.zremrangebyscore(redisKey, 0, windowStart);

    // Count requests in current window
    const requestCount = await this.redis.zcard(redisKey);

    if (requestCount >= this.config.max) {
      // Get the oldest request to calculate reset time
      const oldestRequest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const resetTime = oldestRequest.length > 0 
        ? parseInt(oldestRequest[1]) + this.config.windowMs
        : now + this.config.windowMs;

      return {
        allowed: false,
        remaining: 0,
        resetTime
      };
    }

    // Add current request
    await this.redis.zadd(redisKey, now, `${now}-${Math.random()}`);
    await this.redis.pexpire(redisKey, this.config.windowMs);

    return {
      allowed: true,
      remaining: this.config.max - requestCount - 1,
      resetTime: now + this.config.windowMs
    };
  }
}

/**
 * Create rate limit middleware
 */
export function createRateLimitMiddleware(
  redis: Redis,
  config: RateLimitConfig
) {
  const limiter = new RateLimiter(redis, config);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Generate key based on user ID or IP
    const userId = (request as any).user?.id;
    const ip = request.ip;
    const key = userId || ip;

    try {
      const result = await limiter.check(key);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', config.max);
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        return reply.code(429).send({
          error: 'Too Many Requests',
          message: config.message || 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        });
      }
    } catch (error) {
      // Log error but don't block request if Redis is down
      request.log.error({ err: error }, 'Rate limiter error');
    }
  };
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  // Strict: 10 requests per minute
  strict: {
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many requests. Please slow down.'
  },
  
  // Standard: 100 requests per minute
  standard: {
    windowMs: 60 * 1000,
    max: 100,
    message: 'Rate limit exceeded.'
  },
  
  // Lenient: 1000 requests per minute
  lenient: {
    windowMs: 60 * 1000,
    max: 1000,
    message: 'Rate limit exceeded.'
  },
  
  // Transfer creation: 5 per minute
  transferCreation: {
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many transfer requests. Please wait before creating more transfers.'
  },
  
  // Transfer acceptance: 10 per minute
  transferAcceptance: {
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many acceptance requests.'
  }
};
