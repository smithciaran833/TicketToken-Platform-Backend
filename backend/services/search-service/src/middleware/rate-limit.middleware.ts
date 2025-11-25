/**
 * Advanced Rate Limiting Middleware
 * Implements per-tenant and per-user rate limiting with Redis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from './auth.middleware';
import Redis from 'ioredis';

export interface RateLimitConfig {
  max: number;           // Maximum requests
  window: number;        // Time window in milliseconds
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Creates rate limit key for a user/tenant
   */
  private getKey(identifier: string, type: 'user' | 'tenant'): string {
    const window = Math.floor(Date.now() / this.config.window);
    return `ratelimit:${type}:${identifier}:${window}`;
  }

  /**
   * Check rate limit for a request
   */
  async checkLimit(
    userId: string,
    venueId?: string
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const userKey = this.getKey(userId, 'user');
    const window = this.config.window;
    const max = this.config.max;

    try {
      // Increment counter with TTL
      const userCount = await this.redis
        .multi()
        .incr(userKey)
        .pexpire(userKey, window)
        .exec();

      const count = userCount?.[0]?.[1] as number || 0;
      const remaining = Math.max(0, max - count);
      const resetTime = Date.now() + window;

      // Also check tenant limit if venueId provided
      if (venueId) {
        const tenantKey = this.getKey(venueId, 'tenant');
        const tenantMax = max * 10; // 10x limit for entire tenant
        
        const tenantCount = await this.redis
          .multi()
          .incr(tenantKey)
          .pexpire(tenantKey, window)
          .exec();

        const tCount = tenantCount?.[0]?.[1] as number || 0;
        
        if (tCount > tenantMax) {
          return {
            allowed: false,
            remaining: 0,
            resetTime
          };
        }
      }

      return {
        allowed: count <= max,
        remaining,
        resetTime
      };
    } catch (error) {
      // If Redis fails, allow request but log error
      console.error('Rate limit check failed:', error);
      return {
        allowed: true,
        remaining: max,
        resetTime: Date.now() + window
      };
    }
  }

  /**
   * Reset rate limit for a user (admin function)
   */
  async resetLimit(userId: string): Promise<void> {
    const pattern = `ratelimit:user:${userId}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

/**
 * Factory to create rate limit middleware
 */
export function createRateLimitMiddleware(redis: Redis, config: RateLimitConfig) {
  const limiter = new RateLimiter(redis, config);

  return async (request: AuthenticatedRequest, reply: FastifyReply): Promise<void> => {
    // Require authentication for rate limiting
    if (!request.user?.id) {
      return reply.status(401).send({
        error: 'Authentication required'
      });
    }

    const { allowed, remaining, resetTime } = await limiter.checkLimit(
      request.user.id,
      request.user.venueId
    );

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', config.max.toString());
    reply.header('X-RateLimit-Remaining', remaining.toString());
    reply.header('X-RateLimit-Reset', new Date(resetTime).toISOString());

    if (!allowed) {
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again after ${new Date(resetTime).toISOString()}`,
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
      });
    }
  };
}

/**
 * Different rate limits for different endpoint types
 */
export const rateLimitPresets = {
  // Standard search endpoint
  search: {
    max: 100,
    window: 60000 // 100 requests per minute
  },
  
  // Autocomplete/suggest (higher limit for UX)
  suggest: {
    max: 200,
    window: 60000 // 200 requests per minute
  },
  
  // Admin endpoints (higher limits)
  admin: {
    max: 1000,
    window: 60000 // 1000 requests per minute
  },
  
  // Strict limit for expensive operations
  analytics: {
    max: 20,
    window: 60000 // 20 requests per minute
  }
};

/**
 * Register rate limiting with Fastify
 */
export async function registerRateLimiting(
  fastify: FastifyInstance,
  redis: Redis,
  config?: Partial<RateLimitConfig>
): Promise<void> {
  const finalConfig: RateLimitConfig = {
    max: config?.max || 100,
    window: config?.window || 60000,
    skipSuccessfulRequests: config?.skipSuccessfulRequests || false,
    skipFailedRequests: config?.skipFailedRequests || false
  };

  // Create middleware
  const middleware = createRateLimitMiddleware(redis, finalConfig);

  // Register as global preHandler (will run after auth)
  fastify.addHook('preHandler', middleware);
}
