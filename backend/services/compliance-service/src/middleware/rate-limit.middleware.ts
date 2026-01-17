import fastifyRateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

/**
 * RATE LIMITING MIDDLEWARE
 * 
 * Implements rate limiting for all API endpoints
 * Phase 4: Input Validation & API Hardening
 */

/**
 * Rate limit configuration for different endpoint types
 */
export const rateLimitConfig = {
  // Standard API endpoints - 100 requests per minute
  standard: {
    max: 100,
    timeWindow: '1 minute',
    cache: 10000,
    allowList: ['127.0.0.1'],
    continueExceeding: false,
    skipOnError: true,
  },

  // Authentication endpoints - stricter limits
  auth: {
    max: 20,
    timeWindow: '1 minute',
    cache: 5000,
    skipOnError: false,
  },

  // OFAC screening - moderate limits (external API dependency)
  ofac: {
    max: 50,
    timeWindow: '1 minute',
    cache: 5000,
    skipOnError: true,
  },

  // Document upload - strict limits (resource intensive)
  upload: {
    max: 10,
    timeWindow: '1 minute',
    cache: 1000,
    skipOnError: false,
  },

  // Batch operations - very strict limits
  batch: {
    max: 5,
    timeWindow: '1 minute',
    cache: 500,
    skipOnError: false,
  },

  // Webhook endpoints - generous limits (external services)
  webhook: {
    max: 1000,
    timeWindow: '1 minute',
    cache: 10000,
    skipOnError: true,
  },

  // Health check endpoints - very generous
  health: {
    max: 1000,
    timeWindow: '1 minute',
    cache: 10000,
    skipOnError: true,
  },
};

/**
 * Initialize rate limiting with Redis store for distributed rate limiting
 */
export async function setupRateLimiting(fastify: FastifyInstance) {
  const redisClient = process.env.REDIS_URL 
    ? new Redis(process.env.REDIS_URL)
    : null;

  // Register rate limit plugin
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: rateLimitConfig.standard.max,
    timeWindow: rateLimitConfig.standard.timeWindow,
    cache: rateLimitConfig.standard.cache,
    allowList: rateLimitConfig.standard.allowList,
    redis: redisClient || undefined,
    skipOnError: true,
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP
      return (request as any).user?.id || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: context.ttl,
      };
    },
    onExceeding: (request, key) => {
      fastify.log.warn(`Rate limit approaching for key: ${key}`);
    },
    onExceeded: (request, key) => {
      fastify.log.error(`Rate limit exceeded for key: ${key}`);
    },
  });

  fastify.log.info('Rate limiting initialized' + (redisClient ? ' with Redis store' : ' with in-memory store'));
}

/**
 * Apply custom rate limit to specific route
 * Usage in route: { config: { rateLimit: rateLimitConfig.auth } }
 */
export function applyCustomRateLimit(routeOptions: any, config: typeof rateLimitConfig.standard) {
  return {
    ...routeOptions,
    config: {
      ...routeOptions.config,
      rateLimit: config,
    },
  };
}

/**
 * Bypass rate limiting for specific IPs or user types
 */
export function bypassRateLimit(request: any): boolean {
  // Bypass for internal services
  if (process.env.INTERNAL_SERVICE_SECRET && request.headers['x-internal-service'] === process.env.INTERNAL_SERVICE_SECRET) {
    return true;
  }

  // Bypass for specific IPs (load balancer health checks, etc.)
  const bypassIPs = (process.env.RATE_LIMIT_BYPASS_IPS || '').split(',');
  if (bypassIPs.includes(request.ip)) {
    return true;
  }

  return false;
}

/**
 * Rate limit headers helper
 * Adds rate limit information to response headers
 */
export function addRateLimitHeaders(reply: any, limit: number, remaining: number, reset: number) {
  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Reset', reset);
}

/**
 * Get current rate limit status for a key
 */
export async function getRateLimitStatus(key: string): Promise<{
  limit: number;
  remaining: number;
  reset: number;
}> {
  // Implementation depends on Redis vs in-memory
  // This is a placeholder that should be implemented based on store
  return {
    limit: 100,
    remaining: 95,
    reset: Date.now() + 60000,
  };
}
