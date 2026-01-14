/**
 * Enhanced Rate Limit Middleware for Transfer Service
 * 
 * AUDIT FIXES:
 * - RL-1: Transfers not rate limited properly → Endpoint-specific limits
 * - RL-2: Global rate limit insufficient → Granular per-operation limits
 * - RL-H1: No per-user rate limiting → User-based rate limits
 * - RL-H2: No tenant rate limiting → Tenant-based limits
 * 
 * Features:
 * - Redis-backed rate limiting with memory fallback
 * - Endpoint-specific limits (transfers, batch, blockchain)
 * - Per-user and per-tenant limits
 * - Sliding window algorithm
 * - Rate limit headers in response
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * AUDIT FIX RL-1, RL-2: Endpoint-specific rate limits
 * These are conservative limits to prevent abuse while allowing normal usage
 */
const RATE_LIMITS = {
  // Transfer initiation - high-value operation
  'POST:/api/v1/transfers': {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 10,      // 10 transfers per minute per user
    name: 'transfer_initiate'
  },
  'POST:/api/v1/transfers/gift': {
    windowMs: 60 * 1000,
    maxRequests: 5,       // 5 gift transfers per minute
    name: 'gift_transfer'
  },
  
  // Transfer acceptance - one-time operation
  'POST:/api/v1/transfers/:id/accept': {
    windowMs: 60 * 1000,
    maxRequests: 30,      // Allow more since users might retry
    name: 'transfer_accept'
  },
  
  // Batch transfers - expensive operation
  'POST:/api/v1/transfers/batch': {
    windowMs: 60 * 1000,
    maxRequests: 2,       // Only 2 batch operations per minute
    name: 'batch_transfer'
  },
  
  // Blockchain operations - expensive and rate-limited by RPC
  'POST:/api/v1/transfers/:id/blockchain': {
    windowMs: 60 * 1000,
    maxRequests: 5,       // Limited blockchain transfers
    name: 'blockchain_transfer'
  },
  
  // Read operations - higher limits
  'GET:/api/v1/transfers': {
    windowMs: 60 * 1000,
    maxRequests: 100,
    name: 'list_transfers'
  },
  'GET:/api/v1/transfers/:id': {
    windowMs: 60 * 1000,
    maxRequests: 200,
    name: 'get_transfer'
  },
  
  // Default for unmatched routes
  default: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    name: 'default'
  }
};

// Per-tenant limits (higher tier tenants can have more)
const TENANT_LIMITS = {
  windowMs: 60 * 1000,
  maxRequests: 1000,  // 1000 requests per minute per tenant
  name: 'tenant'
};

// =============================================================================
// IN-MEMORY RATE LIMITER (Fallback)
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug('Cleaned expired rate limit entries', { cleaned });
  }
}, 60 * 1000);

// =============================================================================
// RATE LIMIT HELPERS
// =============================================================================

function getRouteKey(method: string, path: string): string {
  // Normalize path - replace UUIDs with :id
  const normalizedPath = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\?.*$/, '');  // Remove query string
  
  return `${method}:${normalizedPath}`;
}

function getRateLimitConfig(routeKey: string): typeof RATE_LIMITS.default {
  return RATE_LIMITS[routeKey as keyof typeof RATE_LIMITS] || RATE_LIMITS.default;
}

async function checkRateLimit(
  key: string,
  config: { windowMs: number; maxRequests: number },
  redis?: any
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}> {
  const now = Date.now();
  const resetAt = now + config.windowMs;

  // Try Redis first
  if (redis) {
    try {
      const multi = redis.multi();
      multi.incr(key);
      multi.pttl(key);
      const results = await multi.exec();
      
      const count = results[0][1] as number;
      const ttl = results[1][1] as number;
      
      // Set expiry on first request
      if (ttl === -1) {
        await redis.pexpire(key, config.windowMs);
      }
      
      return {
        allowed: count <= config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count),
        resetAt: ttl > 0 ? now + ttl : resetAt,
        total: config.maxRequests
      };
    } catch (error) {
      logger.warn('Redis rate limit error, using memory', {
        error: (error as Error).message
      });
    }
  }

  // Fallback to memory
  const entry = memoryStore.get(key);
  
  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
      total: config.maxRequests
    };
  }

  entry.count++;
  return {
    allowed: entry.count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.resetAt,
    total: config.maxRequests
  };
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * AUDIT FIX RL-1, RL-2: Rate limit middleware with per-endpoint limits
 */
export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip rate limiting for health checks
  if (request.url.startsWith('/health')) {
    return;
  }

  const redis = (request.server as any).redis;
  const routeKey = getRouteKey(request.method, request.url);
  const config = getRateLimitConfig(routeKey);
  
  // Get user and tenant identifiers
  const userId = (request as any).user?.id || request.ip;
  const tenantId = request.tenantId || 'anonymous';
  
  // Build rate limit keys
  const userKey = `ratelimit:${config.name}:user:${userId}`;
  const tenantKey = `ratelimit:tenant:${tenantId}`;

  // Check user rate limit
  const userResult = await checkRateLimit(userKey, config, redis);
  
  // Set rate limit headers
  reply.header('X-RateLimit-Limit', config.maxRequests);
  reply.header('X-RateLimit-Remaining', userResult.remaining);
  reply.header('X-RateLimit-Reset', Math.ceil(userResult.resetAt / 1000));

  if (!userResult.allowed) {
    logger.warn('Rate limit exceeded', {
      userId,
      tenantId,
      route: routeKey,
      limit: config.name,
      requestId: request.id
    });

    reply.header('Retry-After', Math.ceil((userResult.resetAt - Date.now()) / 1000));
    
    return reply.status(429).send({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please wait before retrying.`,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((userResult.resetAt - Date.now()) / 1000)
    });
  }

  // Also check tenant rate limit (prevents one tenant from affecting others)
  const tenantResult = await checkRateLimit(tenantKey, TENANT_LIMITS, redis);
  
  if (!tenantResult.allowed) {
    logger.warn('Tenant rate limit exceeded', {
      tenantId,
      route: routeKey,
      requestId: request.id
    });

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Tenant rate limit exceeded. Please contact support if this persists.',
      code: 'TENANT_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((tenantResult.resetAt - Date.now()) / 1000)
    });
  }
}

/**
 * Transfer-specific rate limiter (stricter limits)
 */
export async function transferRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const redis = (request.server as any).redis;
  const userId = (request as any).user?.id;
  
  if (!userId) {
    // No user ID = no user-specific rate limiting, fall back to IP
    return rateLimitMiddleware(request, reply);
  }

  const key = `ratelimit:transfers:user:${userId}`;
  const config = {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 50            // 50 transfers per hour per user
  };

  const result = await checkRateLimit(key, config, redis);
  
  reply.header('X-RateLimit-Transfer-Limit', config.maxRequests);
  reply.header('X-RateLimit-Transfer-Remaining', result.remaining);

  if (!result.allowed) {
    logger.warn('Transfer rate limit exceeded', {
      userId,
      requestId: request.id
    });

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: 'You have exceeded the maximum number of transfers per hour.',
      code: 'TRANSFER_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
    });
  }
}

/**
 * Blockchain operation rate limiter (very strict due to RPC costs)
 */
export async function blockchainRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const redis = (request.server as any).redis;
  const userId = (request as any).user?.id || request.ip;
  
  const key = `ratelimit:blockchain:user:${userId}`;
  const config = {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 3        // Only 3 blockchain ops per minute
  };

  const result = await checkRateLimit(key, config, redis);
  
  reply.header('X-RateLimit-Blockchain-Limit', config.maxRequests);
  reply.header('X-RateLimit-Blockchain-Remaining', result.remaining);

  if (!result.allowed) {
    logger.warn('Blockchain rate limit exceeded', {
      userId,
      requestId: request.id
    });

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Blockchain operation rate limit exceeded. Please wait before retrying.',
      code: 'BLOCKCHAIN_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  rateLimitMiddleware,
  transferRateLimitMiddleware,
  blockchainRateLimitMiddleware,
  RATE_LIMITS,
  TENANT_LIMITS
};
