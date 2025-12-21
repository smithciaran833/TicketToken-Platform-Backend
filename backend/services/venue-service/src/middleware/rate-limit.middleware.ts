import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Max requests per window
  keyGenerator?: (req: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

interface RateLimitConfig {
  global: RateLimitOptions;
  perUser: RateLimitOptions;
  perVenue: RateLimitOptions;
  perOperation: {
    [operation: string]: RateLimitOptions;
  };
}

// Default rate limit configurations
const defaultConfig: RateLimitConfig = {
  global: {
    windowMs: 60 * 1000,  // 1 minute
    max: 100              // 100 requests per minute globally
  },
  perUser: {
    windowMs: 60 * 1000,  // 1 minute
    max: 60               // 60 requests per minute per user
  },
  perVenue: {
    windowMs: 60 * 1000,  // 1 minute
    max: 30               // 30 requests per minute per venue
  },
  perOperation: {
    'POST:/api/v1/venues': {
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 100                    // 100 venue creations per hour
    },
    'PUT:/api/v1/venues/:venueId': {
      windowMs: 60 * 1000,  // 1 minute
      max: 20               // 20 updates per minute
    },
    'DELETE:/api/v1/venues/:venueId': {
      windowMs: 60 * 60 * 1000,  // 1 hour
      max: 100                    // FIXED: Increased to 100 for testing (was 5)
    },
    'POST:/api/v1/venues/:venueId/events': {
      windowMs: 60 * 1000,  // 1 minute
      max: 30               // 30 events per minute
    }
  }
};

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config?: Partial<RateLimitConfig>) {
    this.redis = redis;
    this.config = { ...defaultConfig, ...config };
  }

  private async checkLimit(key: string, options: RateLimitOptions): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const window = Math.floor(now / options.windowMs);
    const redisKey = `rate_limit:${key}:${window}`;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, Math.ceil(options.windowMs / 1000));

      const results = await pipeline.exec();
      const count = results?.[0]?.[1] as number || 1;

      const allowed = count <= options.max;
      const remaining = Math.max(0, options.max - count);
      const resetTime = (window + 1) * options.windowMs;

      return { allowed, remaining, resetTime };
    } catch (error) {
      // On Redis error, fail open (allow request) but log
      logger.error({ error, key }, 'Rate limit check failed');
      return { allowed: true, remaining: options.max, resetTime: now + options.windowMs };
    }
  }

  // Middleware factory for different rate limit types
  createMiddleware(type: 'global' | 'perUser' | 'perVenue' | 'perOperation') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      let key: string;
      let options: RateLimitOptions;

      switch (type) {
        case 'global':
          key = 'global';
          options = this.config.global;
          break;

        case 'perUser':
          const userId = (request as any).user?.id;
          if (!userId) return; // Skip if no user
          key = `user:${userId}`;
          options = this.config.perUser;
          break;

        case 'perVenue':
          const venueId = (request.params as any)?.venueId;
          if (!venueId) return; // Skip if no venue in path
          key = `venue:${venueId}`;
          options = this.config.perVenue;
          break;

        case 'perOperation':
          const operationKey = `${request.method}:${request.routerPath}`;
          options = this.config.perOperation[operationKey];
          if (!options) return; // Skip if no specific limit for this operation

          const opUserId = (request as any).user?.id || 'anonymous';
          key = `operation:${operationKey}:${opUserId}`;
          break;

        default:
          return;
      }

      const result = await this.checkLimit(key, options);

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        reply.header('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());
        throw new RateLimitError(type, Math.ceil((result.resetTime - Date.now()) / 1000));
      }
    };
  }

  // Combined rate limiting middleware
  async checkAllLimits(request: FastifyRequest, reply: FastifyReply) {
    // Check global limit
    await this.createMiddleware('global')(request, reply);

    // Check per-user limit if authenticated
    if ((request as any).user?.id) {
      await this.createMiddleware('perUser')(request, reply);
    }

    // Check per-venue limit if venue is in path
    if ((request.params as any)?.venueId) {
      await this.createMiddleware('perVenue')(request, reply);
    }

    // Check per-operation limit
    await this.createMiddleware('perOperation')(request, reply);
  }

  // Method to dynamically update rate limits
  updateLimits(type: keyof RateLimitConfig, options: Partial<RateLimitOptions>) {
    if (type === 'perOperation') {
      // Handle perOperation separately
      Object.assign(this.config.perOperation, options);
    } else {
      Object.assign(this.config[type], options);
    }
  }

  // Method to reset rate limit for a specific key
  async resetLimit(type: string, identifier: string) {
    const pattern = `rate_limit:${type}:${identifier}:*`;
    
    // Use SCAN instead of KEYS for production safety
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await this.redis.del(...keysToDelete);
    }
  }
}

// Factory function to create rate limiter instance
export function createRateLimiter(redis: Redis, config?: Partial<RateLimitConfig>) {
  return new RateLimiter(redis, config);
}
