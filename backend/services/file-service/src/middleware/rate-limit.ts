/**
 * Rate Limiting Middleware
 * 
 * AUDIT FIX: SEC-R7, SEC-R9 - Apply rate limiters to routes
 * - Redis-backed rate limiting when available
 * - Fallback to in-memory for development
 * - Separate limits for upload, processing, and general routes
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// =============================================================================
// Configuration
// =============================================================================

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Redis key prefix
  message?: string;      // Custom error message
}

// Rate limit configurations
const RATE_LIMITS = {
  // Upload operations - strict limits (10 per 15 minutes)
  upload: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10,
    keyPrefix: 'rl:upload:',
    message: 'Too many upload requests. Please try again later.'
  },
  
  // Processing operations - moderate limits (30 per 15 minutes)
  processing: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 30,
    keyPrefix: 'rl:processing:',
    message: 'Too many processing requests. Please try again later.'
  },
  
  // Download operations - higher limits (100 per 15 minutes)
  download: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    keyPrefix: 'rl:download:',
    message: 'Too many download requests. Please try again later.'
  },
  
  // Global limit - fallback for all routes (100 per 15 minutes)
  global: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    keyPrefix: 'rl:global:',
    message: 'Too many requests. Please try again later.'
  }
} as const;

// =============================================================================
// Redis Client
// =============================================================================

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  
  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT || '6379');
  
  if (!host) {
    logger.warn({}, 'REDIS_HOST not set - rate limiting will use in-memory fallback');
    return null;
  }

  try {
    redisClient = new Redis({
      host,
      port,
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true
    });

    redisClient.on('error', (err) => {
      logger.error({ error: err }, 'Redis connection error');
    });

    return redisClient;
  } catch (error) {
    logger.error({ error }, 'Failed to create Redis client');
    return null;
  }
}

// =============================================================================
// In-Memory Fallback
// =============================================================================

interface InMemoryEntry {
  count: number;
  resetTime: number;
}

const inMemoryStore = new Map<string, InMemoryEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore.entries()) {
    if (entry.resetTime < now) {
      inMemoryStore.delete(key);
    }
  }
}, 60000); // Clean every minute

// =============================================================================
// Rate Limit Functions
// =============================================================================

/**
 * Get rate limit key based on tenant and user
 */
function getRateLimitKey(request: FastifyRequest, prefix: string): string {
  const tenantId = (request as any).tenantId || 'unknown';
  const userId = (request as any).user?.userId || request.ip;
  return `${prefix}${tenantId}:${userId}`;
}

/**
 * Check rate limit using Redis
 */
async function checkRateLimitRedis(
  client: Redis,
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;
  
  const multi = client.multi();
  multi.incr(windowKey);
  multi.pexpire(windowKey, config.windowMs);
  
  const results = await multi.exec();
  const count = results?.[0]?.[1] as number || 0;
  
  const remaining = Math.max(0, config.maxRequests - count);
  const resetTime = Math.ceil(now / config.windowMs) * config.windowMs;
  
  return {
    allowed: count <= config.maxRequests,
    remaining,
    resetTime
  };
}

/**
 * Check rate limit using in-memory store
 */
function checkRateLimitInMemory(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = inMemoryStore.get(key);
  
  if (!entry || entry.resetTime < now) {
    // New window
    const resetTime = now + config.windowMs;
    inMemoryStore.set(key, { count: 1, resetTime });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime
    };
  }
  
  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  
  return {
    allowed: entry.count <= config.maxRequests,
    remaining,
    resetTime: entry.resetTime
  };
}

/**
 * Create rate limit middleware
 */
function createRateLimiter(config: RateLimitConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = getRateLimitKey(request, config.keyPrefix);
    const redis = getRedisClient();
    
    let result: { allowed: boolean; remaining: number; resetTime: number };
    
    if (redis) {
      try {
        result = await checkRateLimitRedis(redis, key, config);
      } catch (error) {
        logger.error({ error }, 'Redis rate limit check failed, using in-memory');
        result = checkRateLimitInMemory(key, config);
      }
    } else {
      result = checkRateLimitInMemory(key, config);
    }
    
    // Set rate limit headers
    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
    
    if (!result.allowed) {
      logger.warn({
        key,
        remaining: result.remaining,
        resetTime: result.resetTime
      }, 'Rate limit exceeded');
      
      reply.status(429).send({
        type: 'https://api.tickettoken.com/errors/rate-limit',
        title: 'Too Many Requests',
        status: 429,
        detail: config.message,
        instance: request.url,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
      return;
    }
  };
}

// =============================================================================
// Exported Rate Limiters
// =============================================================================

/**
 * AUDIT FIX: SEC-R7 - Rate limiter for upload routes
 */
export const uploadRateLimiter = createRateLimiter(RATE_LIMITS.upload);

/**
 * AUDIT FIX: SEC-R9 - Rate limiter for processing routes
 */
export const processingRateLimiter = createRateLimiter(RATE_LIMITS.processing);

/**
 * Rate limiter for download routes
 */
export const downloadRateLimiter = createRateLimiter(RATE_LIMITS.download);

/**
 * Global rate limiter for all routes
 */
export const globalRateLimiter = createRateLimiter(RATE_LIMITS.global);

/**
 * Combined rate limiter - checks both specific and global limits
 */
export function combinedRateLimiter(specificLimiter: typeof uploadRateLimiter) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // First check global limit
    await globalRateLimiter(request, reply);
    if (reply.sent) return;
    
    // Then check specific limit
    await specificLimiter(request, reply);
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get rate limit status for a key (for monitoring)
 */
export async function getRateLimitStatus(
  key: string,
  limitType: keyof typeof RATE_LIMITS
): Promise<{ count: number; limit: number; remaining: number } | null> {
  const config = RATE_LIMITS[limitType];
  const redis = getRedisClient();
  
  if (redis) {
    try {
      const now = Date.now();
      const windowKey = `${config.keyPrefix}${key}:${Math.floor(now / config.windowMs)}`;
      const count = parseInt(await redis.get(windowKey) || '0');
      
      return {
        count,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count)
      };
    } catch {
      return null;
    }
  }
  
  const entry = inMemoryStore.get(`${config.keyPrefix}${key}`);
  if (!entry) {
    return { count: 0, limit: config.maxRequests, remaining: config.maxRequests };
  }
  
  return {
    count: entry.count,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count)
  };
}

/**
 * Reset rate limit for a key (admin function)
 */
export async function resetRateLimit(
  key: string,
  limitType: keyof typeof RATE_LIMITS
): Promise<boolean> {
  const config = RATE_LIMITS[limitType];
  const fullKey = `${config.keyPrefix}${key}`;
  
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(fullKey);
      return true;
    } catch {
      return false;
    }
  }
  
  inMemoryStore.delete(fullKey);
  return true;
}
