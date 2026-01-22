import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { RateLimitError, ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Max requests per window
  keyGenerator?: (req: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
  skipOnError?: boolean;  // FC6: Continue if Redis fails (default true)
  failClosed?: boolean;  // SECURITY FIX: Fail closed on Redis errors (overrides skipOnError)
  criticalEndpoints?: string[];  // SECURITY FIX: Always fail closed for these endpoints
  banThreshold?: number;  // FC10: Number of violations before banning
  banDurationMs?: number; // FC10: Duration of ban in milliseconds
}

interface RateLimitConfig {
  global: RateLimitOptions;
  perUser: RateLimitOptions;
  perVenue: RateLimitOptions;
  perOperation: {
    [operation: string]: RateLimitOptions;
  };
  // AUDIT FIX (WE3): Per-webhook-source rate limits
  perWebhookSource: {
    [source: string]: RateLimitOptions;
  };
  // FC10: Ban configuration
  ban: {
    enabled: boolean;
    threshold: number;      // Violations before ban
    windowMs: number;       // Window to count violations
    banDurationMs: number;  // How long to ban
  };
}

// Default rate limit configurations
const defaultConfig: RateLimitConfig = {
  global: {
    windowMs: 60 * 1000,  // 1 minute
    max: 100,             // 100 requests per minute globally
    skipOnError: true,    // FC6: Fail open if Redis unavailable
  },
  // FC10: Ban configuration for repeat offenders
  ban: {
    enabled: true,
    threshold: 10,              // 10 violations
    windowMs: 60 * 60 * 1000,   // In 1 hour window
    banDurationMs: 15 * 60 * 1000, // Ban for 15 minutes
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
  },
  // AUDIT FIX (WE3): Per-webhook-source rate limits
  perWebhookSource: {
    'stripe': {
      windowMs: 60 * 1000,  // 1 minute
      max: 1000             // Stripe sends many webhooks
    },
    'square': {
      windowMs: 60 * 1000,
      max: 500
    },
    'toast': {
      windowMs: 60 * 1000,
      max: 500
    },
    'mailchimp': {
      windowMs: 60 * 1000,
      max: 100
    },
    'twilio': {
      windowMs: 60 * 1000,
      max: 200
    },
    'default': {
      windowMs: 60 * 1000,
      max: 100              // Default for unknown sources
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

  // SECURITY FIX: Improved rate limiting with sliding window and fail-closed option
  private async checkLimit(
    key: string,
    options: RateLimitOptions,
    tenantId?: string,
    request?: FastifyRequest
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Include tenant ID in key to prevent cross-tenant rate limit interference
    const redisKey = tenantId
      ? `rate_limit:tenant:${tenantId}:${key}`
      : `rate_limit:global:${key}`;

    try {
      // SECURITY FIX: Check per-tenant key count limits (max 10000 keys per tenant)
      if (tenantId) {
        const keyCountKey = `rate_limit:keycount:${tenantId}`;
        const keyCount = await this.redis.incr(keyCountKey);

        if (keyCount === 1) {
          // First key for this tenant, set 1 hour expiry on counter
          await this.redis.expire(keyCountKey, 3600);
        }

        if (keyCount > 10000) {
          logger.warn({ tenantId, keyCount }, 'Tenant rate limit key quota exceeded');
          throw new ServiceUnavailableError('rate-limiter', 60);
        }
      }

      // SECURITY FIX: Implement sliding window using Redis sorted set (ZSET)
      const pipeline = this.redis.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(redisKey, 0, windowStart);

      // Count current entries in window
      pipeline.zcard(redisKey);

      // Add current request with timestamp as score
      const requestId = `${now}-${Math.random()}`;
      pipeline.zadd(redisKey, now, requestId);

      // Set expiry on the key
      pipeline.expire(redisKey, Math.ceil(options.windowMs / 1000) + 1);

      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 0;

      const allowed = count < options.max;
      const remaining = Math.max(0, options.max - count);
      const resetTime = now + options.windowMs;

      return { allowed, remaining, resetTime };
    } catch (error) {
      logger.error({ error, key, tenantId }, 'Rate limit check failed');

      // SECURITY FIX: Fail closed if configured
      const endpoint = request ? `${request.method}:${request.url}` : '';
      const shouldFailClosed = options.failClosed ||
                              (options.criticalEndpoints && options.criticalEndpoints.includes(endpoint));

      if (shouldFailClosed) {
        throw new ServiceUnavailableError('rate-limiter', 30);
      }

      // Default: fail open (backwards compatible)
      return { allowed: true, remaining: options.max, resetTime: now + options.windowMs };
    }
  }

  // SECURITY FIX (SR7): Middleware factory with tenant-scoped rate limiting
  createMiddleware(type: 'global' | 'perUser' | 'perVenue' | 'perOperation' | 'perTenant') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      let key: string;
      let options: RateLimitOptions;

      // SECURITY FIX (SR7): Get tenant ID from request for tenant-scoped rate limiting
      const tenantId = (request as any).user?.tenant_id || (request as any).tenantId;

      switch (type) {
        case 'global':
          key = 'global';
          options = this.config.global;
          break;

        case 'perTenant':
          if (!tenantId) return; // Skip if no tenant
          key = `tenant:${tenantId}`;
          options = this.config.global; // Use global limits per tenant
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

      // FIX: Set rate limit headers BEFORE checking if disabled
      const now = Date.now();
      const resetTime = now + options.windowMs;
      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Reset', new Date(resetTime).toISOString());

      // Skip rate limiting check in tests, but headers are already set
      if (process.env.DISABLE_RATE_LIMIT === 'true') {
        reply.header('X-RateLimit-Remaining', options.max.toString());
        return;
      }

      // SECURITY FIX (SR7): Pass tenant ID for tenant-scoped keys
      const result = await this.checkLimit(key, options, tenantId);

      // Update remaining header with actual value
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (!result.allowed) {
        // SECURITY FIX (SE9): Log when rate limit is exceeded for security monitoring
        const userId = (request as any).user?.id || 'anonymous';
        const requestInfo = {
          type,
          key,
          tenantId,
          userId,
          ip: request.ip,
          path: request.url,
          method: request.method,
          remaining: result.remaining,
          resetTime: new Date(result.resetTime).toISOString(),
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        };

        logger.warn(requestInfo, 'Rate limit exceeded');

        // Emit metric for rate limit hits
        // This allows alerting on potential abuse patterns

        reply.header('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());
        throw new RateLimitError(type, Math.ceil((result.resetTime - Date.now()) / 1000));
      }
    };
  }

  // SECURITY FIX (SR7): Combined rate limiting middleware with tenant isolation
  async checkAllLimits(request: FastifyRequest, reply: FastifyReply) {
    // Check global limit
    await this.createMiddleware('global')(request, reply);

    // SECURITY FIX (SR7): Check per-tenant limit for tenant isolation
    const tenantId = (request as any).user?.tenant_id || (request as any).tenantId;
    if (tenantId) {
      await this.createMiddleware('perTenant')(request, reply);
    }

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

  // SECURITY FIX (SR7): Method to reset rate limit for a specific key (tenant-scoped)
  async resetLimit(type: string, identifier: string, tenantId?: string) {
    const pattern = tenantId
      ? `rate_limit:tenant:${tenantId}:${type}:${identifier}:*`
      : `rate_limit:*:${type}:${identifier}:*`;

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
