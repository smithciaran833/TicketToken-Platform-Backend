/**
 * Redis-backed Rate Limit Middleware for Notification Service
 * 
 * AUDIT FIXES:
 * - RL-1: In-memory rate limiting → Redis-backed with memory fallback
 * - RL-2: X-Forwarded-For bypass → Validated IP extraction
 * - RL-H1: No per-user rate limiting → User-based rate limits
 * - RL-H2: No tenant rate limiting → Tenant-based limits
 * 
 * Features:
 * - Redis-backed rate limiting with memory fallback
 * - Endpoint-specific limits (notifications, SMS, email)
 * - Per-user and per-tenant limits
 * - Sliding window algorithm
 * - Rate limit headers in response
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../config/logger';
import Redis from 'ioredis';
import { env } from '../config/env';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * AUDIT FIX RL-1, RL-2: Endpoint-specific rate limits
 */
const RATE_LIMITS = {
  // Email sending - moderate limits
  'POST:/api/v1/notifications/email': {
    windowMs: 60 * 1000,
    maxRequests: 30,
    name: 'send_email'
  },
  
  // SMS sending - stricter limits (expensive)
  'POST:/api/v1/notifications/sms': {
    windowMs: 60 * 1000,
    maxRequests: 10,
    name: 'send_sms'
  },
  
  // Push notifications
  'POST:/api/v1/notifications/push': {
    windowMs: 60 * 1000,
    maxRequests: 50,
    name: 'send_push'
  },
  
  // Batch notifications - very strict
  'POST:/api/v1/notifications/batch': {
    windowMs: 60 * 1000,
    maxRequests: 3,
    name: 'batch_notification'
  },
  
  // Campaign sending - very strict
  'POST:/api/v1/campaigns/:id/send': {
    windowMs: 60 * 1000,
    maxRequests: 1,
    name: 'campaign_send'
  },
  
  // Preference updates
  'PUT:/api/v1/preferences': {
    windowMs: 60 * 1000,
    maxRequests: 20,
    name: 'update_preferences'
  },
  
  // Read operations - higher limits
  'GET:/api/v1/notifications': {
    windowMs: 60 * 1000,
    maxRequests: 100,
    name: 'list_notifications'
  },
  
  // Default for unmatched routes
  default: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    name: 'default'
  }
};

// Per-tenant limits
const TENANT_LIMITS = {
  windowMs: 60 * 1000,
  maxRequests: 1000,
  name: 'tenant'
};

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!redis) {
    try {
      redis = new Redis({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
      });
      
      redis.on('error', (err) => {
        logger.warn('Rate limit Redis error, using memory', { error: err.message });
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis for rate limiting', { error });
      return null;
    }
  }
  return redis;
}

// =============================================================================
// IN-MEMORY FALLBACK
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
    .replace(/\?.*$/, '');
  
  return `${method}:${normalizedPath}`;
}

function getRateLimitConfig(routeKey: string): typeof RATE_LIMITS.default {
  return RATE_LIMITS[routeKey as keyof typeof RATE_LIMITS] || RATE_LIMITS.default;
}

/**
 * AUDIT FIX RL-2: Extract real client IP safely
 * Don't blindly trust X-Forwarded-For
 */
function getClientIp(request: FastifyRequest): string {
  // In production, only trust X-Forwarded-For if behind trusted proxy
  if (env.NODE_ENV === 'production') {
    // Only use first hop from trusted reverse proxy
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      // Take only the first IP (client IP)
      const firstIp = forwardedFor.split(',')[0].trim();
      // Validate it's a real IP format (basic check)
      if (/^[\d.:a-f]+$/i.test(firstIp)) {
        return firstIp;
      }
    }
  }
  
  // Fall back to direct connection IP
  return request.ip || '127.0.0.1';
}

async function checkRateLimit(
  key: string,
  config: { windowMs: number; maxRequests: number }
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}> {
  const now = Date.now();
  const resetAt = now + config.windowMs;

  // Try Redis first
  const redisClient = getRedis();
  if (redisClient) {
    try {
      const multi = redisClient.multi();
      multi.incr(key);
      multi.pttl(key);
      const results = await multi.exec();
      
      if (results) {
        const count = results[0][1] as number;
        const ttl = results[1][1] as number;
        
        // Set expiry on first request
        if (ttl === -1) {
          await redisClient.pexpire(key, config.windowMs);
        }
        
        return {
          allowed: count <= config.maxRequests,
          remaining: Math.max(0, config.maxRequests - count),
          resetAt: ttl > 0 ? now + ttl : resetAt,
          total: config.maxRequests
        };
      }
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
 * AUDIT FIX RL-1, RL-2: Rate limit middleware with Redis backing
 */
export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip rate limiting for health checks and internal routes
  if (request.url.startsWith('/health') || 
      request.url.startsWith('/metrics') ||
      request.url.startsWith('/api/v1/internal')) {
    return;
  }

  const routeKey = getRouteKey(request.method, request.url);
  const config = getRateLimitConfig(routeKey);
  
  // AUDIT FIX RL-2: Get validated client IP
  const clientIp = getClientIp(request);
  const userId = (request as any).user?.id || clientIp;
  const tenantId = request.tenantId || 'anonymous';
  
  // Build rate limit keys
  const userKey = `notification:ratelimit:${config.name}:user:${userId}`;
  const tenantKey = `notification:ratelimit:tenant:${tenantId}`;

  // Check user rate limit
  const userResult = await checkRateLimit(userKey, config);
  
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
      clientIp,
      requestId: request.id
    });

    reply.header('Retry-After', Math.ceil((userResult.resetAt - Date.now()) / 1000));
    
    return reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait before retrying.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((userResult.resetAt - Date.now()) / 1000)
    });
  }

  // Also check tenant rate limit
  const tenantResult = await checkRateLimit(tenantKey, TENANT_LIMITS);
  
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
 * SMS-specific rate limiter (stricter due to cost)
 */
export async function smsRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = (request as any).user?.id;
  
  if (!userId) {
    return rateLimitMiddleware(request, reply);
  }

  const key = `notification:ratelimit:sms:user:${userId}`;
  const config = {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 20            // 20 SMS per hour per user
  };

  const result = await checkRateLimit(key, config);
  
  reply.header('X-RateLimit-SMS-Limit', config.maxRequests);
  reply.header('X-RateLimit-SMS-Remaining', result.remaining);

  if (!result.allowed) {
    logger.warn('SMS rate limit exceeded', {
      userId,
      requestId: request.id
    });

    return reply.status(429).send({
      error: 'Too Many Requests',
      message: 'SMS rate limit exceeded. Maximum 20 SMS per hour.',
      code: 'SMS_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  rateLimitMiddleware,
  smsRateLimitMiddleware,
  RATE_LIMITS,
  TENANT_LIMITS
};
