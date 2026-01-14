/**
 * Enhanced Rate Limiting Middleware for Marketplace Service
 * 
 * Issues Fixed:
 * - RL-H1: No per-user rate limiting → User-specific limits
 * - RL-H2: No per-IP rate limiting → IP-based limits
 * - RL-H3: Hardcoded limits → Configurable via env
 * - RL-H4: No endpoint-specific limits → Route-based config
 * 
 * Features:
 * - Redis-backed distributed rate limiting
 * - Sliding window algorithm
 * - Per-user, per-IP, and per-endpoint limits
 * - Graceful degradation if Redis unavailable
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RateLimit' });

// Configuration from environment
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const DEFAULT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

// Per-endpoint limits
const ENDPOINT_LIMITS: Record<string, { windowMs: number; max: number }> = {
  // Purchase endpoints - strict limits
  'POST /api/v1/purchases': { windowMs: 60000, max: 10 },
  'POST /api/v1/listings/:id/buy': { windowMs: 60000, max: 10 },
  
  // Listing creation - moderate limits
  'POST /api/v1/listings': { windowMs: 60000, max: 30 },
  
  // Search/read endpoints - relaxed limits
  'GET /api/v1/listings': { windowMs: 60000, max: 300 },
  'GET /api/v1/listings/:id': { windowMs: 60000, max: 300 },
  
  // Webhook endpoints - separate limits
  'POST /api/v1/webhooks': { windowMs: 60000, max: 100 },
  
  // Admin endpoints - stricter limits
  'POST /api/v1/admin/*': { windowMs: 60000, max: 50 },
};

// User tier multipliers
const USER_TIER_MULTIPLIERS: Record<string, number> = {
  free: 1,
  basic: 2,
  premium: 5,
  enterprise: 10,
  admin: 50,
};

// Key prefixes
const KEY_PREFIX_USER = 'ratelimit:user:';
const KEY_PREFIX_IP = 'ratelimit:ip:';
const KEY_PREFIX_ENDPOINT = 'ratelimit:endpoint:';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skip?: (request: FastifyRequest) => boolean;
  handler?: (request: FastifyRequest, reply: FastifyReply) => void;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
}

/**
 * Check rate limit using sliding window algorithm
 */
async function checkRateLimit(
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<RateLimitResult> {
  try {
    const redis = getRedis();
    const now = Date.now();
    const windowStart = now - windowMs;

    // Use a sorted set with timestamps as scores
    const pipeline = redis.multi();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, 0, windowStart);
    
    // Add current request
    pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`);
    
    // Count requests in window
    pipeline.zcard(key);
    
    // Set expiration
    pipeline.pexpire(key, windowMs);
    
    const results = await pipeline.exec();
    
    if (!results) {
      return { allowed: true, remaining: maxRequests, resetMs: windowMs, limit: maxRequests };
    }
    
    const count = (results[2]?.[1] as number) || 0;
    const remaining = Math.max(0, maxRequests - count);
    const allowed = count <= maxRequests;
    
    return {
      allowed,
      remaining,
      resetMs: windowMs,
      limit: maxRequests
    };
  } catch (error: any) {
    log.warn('Rate limit check failed, allowing request', { error: error.message });
    return { allowed: true, remaining: 1, resetMs: windowMs, limit: maxRequests };
  }
}

/**
 * Get IP address from request
 */
function getClientIp(request: FastifyRequest): string {
  // Check various headers for proxied requests
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  
  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return typeof realIp === 'string' ? realIp : realIp[0];
  }
  
  return request.ip || 'unknown';
}

/**
 * Get endpoint key for rate limiting
 */
function getEndpointKey(request: FastifyRequest): string {
  const method = request.method;
  const url = request.routeOptions?.url || request.url.split('?')[0];
  return `${method} ${url}`;
}

/**
 * Get limit configuration for endpoint
 */
function getEndpointLimits(request: FastifyRequest): { windowMs: number; max: number } {
  const endpointKey = getEndpointKey(request);
  
  // Check for exact match
  if (ENDPOINT_LIMITS[endpointKey]) {
    return ENDPOINT_LIMITS[endpointKey];
  }
  
  // Check for wildcard match
  for (const [pattern, limits] of Object.entries(ENDPOINT_LIMITS)) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(endpointKey)) {
        return limits;
      }
    }
  }
  
  return { windowMs: DEFAULT_WINDOW_MS, max: DEFAULT_MAX_REQUESTS };
}

/**
 * Get user tier multiplier
 */
function getUserTierMultiplier(request: FastifyRequest): number {
  const user = (request as any).user;
  const tier = user?.tier || user?.subscription_tier || 'free';
  return USER_TIER_MULTIPLIERS[tier] || 1;
}

/**
 * AUDIT FIX RL-H1: Per-user rate limiting middleware
 */
export async function userRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): Promise<void> {
  const userId = (request as any).user?.id;
  
  if (!userId) {
    // No user - skip user rate limiting (IP limiting will apply)
    done();
    return;
  }

  const limits = getEndpointLimits(request);
  const multiplier = getUserTierMultiplier(request);
  const adjustedMax = limits.max * multiplier;
  
  const key = `${KEY_PREFIX_USER}${userId}:${getEndpointKey(request)}`;
  const result = await checkRateLimit(key, limits.windowMs, adjustedMax);
  
  // Set rate limit headers
  reply.header('X-RateLimit-Limit', result.limit.toString());
  reply.header('X-RateLimit-Remaining', result.remaining.toString());
  reply.header('X-RateLimit-Reset', Math.ceil(Date.now() + result.resetMs).toString());
  
  if (!result.allowed) {
    log.warn('User rate limit exceeded', {
      userId,
      endpoint: getEndpointKey(request),
      limit: result.limit
    });
    
    reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(result.resetMs / 1000)
    });
    return;
  }
  
  done();
}

/**
 * AUDIT FIX RL-H2: Per-IP rate limiting middleware
 */
export async function ipRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): Promise<void> {
  const clientIp = getClientIp(request);
  const limits = getEndpointLimits(request);
  
  // IP limits are slightly higher than user limits
  const ipMax = Math.ceil(limits.max * 1.5);
  
  const key = `${KEY_PREFIX_IP}${clientIp}:${getEndpointKey(request)}`;
  const result = await checkRateLimit(key, limits.windowMs, ipMax);
  
  if (!result.allowed) {
    log.warn('IP rate limit exceeded', {
      ip: clientIp,
      endpoint: getEndpointKey(request)
    });
    
    reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP address.',
      retryAfter: Math.ceil(result.resetMs / 1000)
    });
    return;
  }
  
  done();
}

/**
 * AUDIT FIX RL-H3: Combined rate limiter factory
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const {
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX_REQUESTS,
    keyGenerator,
    skip,
    handler
  } = config;

  return async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): Promise<void> {
    // Check if should skip
    if (skip && skip(request)) {
      done();
      return;
    }

    // Generate key
    const key = keyGenerator 
      ? keyGenerator(request)
      : `${KEY_PREFIX_ENDPOINT}${getClientIp(request)}:${getEndpointKey(request)}`;

    const result = await checkRateLimit(key, windowMs, max);
    
    // Set headers
    reply.header('X-RateLimit-Limit', result.limit.toString());
    reply.header('X-RateLimit-Remaining', result.remaining.toString());
    reply.header('X-RateLimit-Reset', Math.ceil(Date.now() + result.resetMs).toString());

    if (!result.allowed) {
      if (handler) {
        handler(request, reply);
        return;
      }

      reply.status(429).send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded.',
        retryAfter: Math.ceil(result.resetMs / 1000)
      });
      return;
    }

    done();
  };
}

/**
 * Strict rate limiter for sensitive endpoints
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 5,
  keyGenerator: (req) => `strict:${getClientIp(req)}:${(req as any).user?.id || 'anon'}`
});

/**
 * Relaxed rate limiter for read endpoints
 */
export const relaxedRateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 500
});

/**
 * Reset rate limit for a user (admin function)
 */
export async function resetUserRateLimit(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    const pattern = `${KEY_PREFIX_USER}${userId}:*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      log.info('User rate limits reset', { userId, keysDeleted: keys.length });
    }
  } catch (error: any) {
    log.error('Failed to reset user rate limits', { userId, error: error.message });
  }
}

// Export config for testing
export const rateLimitConfig = {
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_REQUESTS,
  ENDPOINT_LIMITS,
  USER_TIER_MULTIPLIERS
};
