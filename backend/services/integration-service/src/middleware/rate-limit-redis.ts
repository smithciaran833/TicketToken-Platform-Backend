/**
 * Redis-backed Rate Limiting Middleware for Integration Service
 * 
 * AUDIT FIXES:
 * - RL-1: In-memory rate limiting → Redis distributed rate limiting
 * - RL-2: No outbound rate limiting → Provider-specific rate limiting
 * - RL-3: No rate limit headers → Standard headers included
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { getRedisConfig, getRateLimitConfig, isProduction } from '../config/index';
import { logger } from '../utils/logger';
import { RateLimitError } from '../errors/index';

// =============================================================================
// TYPES
// =============================================================================

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

interface RateLimitOptions {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
  skipFailedRequests?: boolean;
  keyGenerator?: (request: FastifyRequest) => string;
}

// =============================================================================
// REDIS CONNECTION
// =============================================================================

let redisClient: InstanceType<typeof Redis> | null = null;

function getRedisClient(): InstanceType<typeof Redis> | null {
  if (!redisClient) {
    try {
      const config = getRedisConfig();
      redisClient = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        tls: config.tls,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      });
      
      redisClient.on('error', (err) => {
        logger.error('Redis rate limit client error', { error: err.message });
      });
      
    } catch (error) {
      logger.warn('Failed to create Redis client for rate limiting', {
        error: (error as Error).message
      });
      return null;
    }
  }
  return redisClient;
}

// =============================================================================
// IN-MEMORY FALLBACK
// =============================================================================

const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (data.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 60 * 1000);

// =============================================================================
// RATE LIMIT ALGORITHM
// =============================================================================

/**
 * Sliding window rate limiter using Redis
 * AUDIT FIX RL-1: Redis-based distributed rate limiting
 */
async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (redis) {
    try {
      // Use Redis sorted set for sliding window
      const multi = redis.multi();
      
      // Remove old entries outside the window
      multi.zremrangebyscore(key, '-inf', windowStart);
      
      // Add current request
      multi.zadd(key, now, `${now}-${Math.random()}`);
      
      // Count requests in window
      multi.zcard(key);
      
      // Set TTL
      multi.pexpire(key, windowMs);
      
      const results = await multi.exec();
      
      if (results) {
        const count = results[2][1] as number;
        const resetAt = now + windowMs;
        const remaining = Math.max(0, maxRequests - count);
        
        return {
          allowed: count <= maxRequests,
          limit: maxRequests,
          remaining,
          resetAt,
          retryAfter: count > maxRequests ? Math.ceil(windowMs / 1000) : undefined
        };
      }
    } catch (error) {
      logger.warn('Redis rate limit error, falling back to memory', {
        error: (error as Error).message
      });
    }
  }
  
  // Memory fallback
  const data = memoryStore.get(key);
  const resetAt = now + windowMs;
  
  if (!data || data.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetAt
    };
  }
  
  data.count++;
  const remaining = Math.max(0, maxRequests - data.count);
  
  return {
    allowed: data.count <= maxRequests,
    limit: maxRequests,
    remaining,
    resetAt: data.resetAt,
    retryAfter: data.count > maxRequests ? Math.ceil((data.resetAt - now) / 1000) : undefined
  };
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * Create rate limiting middleware with custom options
 */
export function createRateLimiter(options: RateLimitOptions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const config = getRateLimitConfig();
    
    if (!config.enabled) {
      return;
    }
    
    const key = options.keyGenerator
      ? options.keyGenerator(request)
      : `${options.keyPrefix}:${request.ip}:${request.tenantId || 'global'}`;
    
    const result = await checkRateLimit(key, options.maxRequests, options.windowMs);
    
    // Set rate limit headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
    reply.header('X-RateLimit-Limit', result.limit);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
    
    if (!result.allowed) {
      logger.warn('Rate limit exceeded', {
        requestId: request.id,
        key,
        limit: result.limit,
        remaining: result.remaining
      });
      
      reply.header('Retry-After', result.retryAfter);
      
      throw new RateLimitError({
        retryAfter: result.retryAfter || 60,
        limit: result.limit,
        remaining: 0,
        requestId: request.id as string
      });
    }
  };
}

// =============================================================================
// DEFAULT RATE LIMITERS
// =============================================================================

/**
 * Standard API rate limiter
 */
export const apiRateLimiter = createRateLimiter({
  keyPrefix: 'integration:rate:api',
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  keyGenerator: (request) => {
    const userId = request.user?.id || 'anonymous';
    const tenantId = request.tenantId || 'global';
    return `integration:rate:api:${tenantId}:${userId}`;
  }
});

/**
 * Webhook rate limiter (higher limits)
 */
export const webhookRateLimiter = createRateLimiter({
  keyPrefix: 'integration:rate:webhook',
  maxRequests: 1000,
  windowMs: 60 * 1000, // 1 minute
  keyGenerator: (request) => {
    const provider = request.params && (request.params as any).provider;
    return `integration:rate:webhook:${provider || 'unknown'}:${request.ip}`;
  }
});

/**
 * OAuth flow rate limiter
 */
export const oauthRateLimiter = createRateLimiter({
  keyPrefix: 'integration:rate:oauth',
  maxRequests: 20,
  windowMs: 60 * 1000, // 1 minute
  keyGenerator: (request) => {
    const tenantId = request.tenantId || 'global';
    return `integration:rate:oauth:${tenantId}:${request.ip}`;
  }
});

/**
 * Admin rate limiter (lower limits)
 */
export const adminRateLimiter = createRateLimiter({
  keyPrefix: 'integration:rate:admin',
  maxRequests: 30,
  windowMs: 60 * 1000,
  keyGenerator: (request) => {
    const userId = request.user?.id || 'anonymous';
    return `integration:rate:admin:${userId}`;
  }
});

// =============================================================================
// OUTBOUND RATE LIMITING (RL-2)
// =============================================================================

interface ProviderRateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const providerRateLimits: Record<string, ProviderRateLimitConfig> = {
  stripe: { maxRequests: 100, windowMs: 1000 }, // 100/sec
  square: { maxRequests: 60, windowMs: 60000 }, // 60/min
  mailchimp: { maxRequests: 10, windowMs: 1000 }, // 10/sec
  quickbooks: { maxRequests: 500, windowMs: 60000 } // 500/min
};

/**
 * Check if outbound request to provider is allowed
 * AUDIT FIX RL-2: Outbound rate limiting per provider
 */
export async function checkProviderRateLimit(
  provider: string,
  tenantId: string
): Promise<RateLimitResult> {
  const config = providerRateLimits[provider] || { maxRequests: 60, windowMs: 60000 };
  const key = `integration:rate:provider:${provider}:${tenantId}`;
  
  return checkRateLimit(key, config.maxRequests, config.windowMs);
}

/**
 * Middleware to check provider rate limit before outbound calls
 */
export async function providerRateLimitMiddleware(
  provider: string,
  tenantId: string
): Promise<void> {
  const result = await checkProviderRateLimit(provider, tenantId);
  
  if (!result.allowed) {
    logger.warn('Provider rate limit exceeded', {
      provider,
      tenantId,
      retryAfter: result.retryAfter
    });
    
    throw new RateLimitError({
      retryAfter: result.retryAfter || 60,
      limit: result.limit,
      remaining: 0
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createRateLimiter,
  apiRateLimiter,
  webhookRateLimiter,
  oauthRateLimiter,
  adminRateLimiter,
  checkProviderRateLimit,
  providerRateLimitMiddleware
};
