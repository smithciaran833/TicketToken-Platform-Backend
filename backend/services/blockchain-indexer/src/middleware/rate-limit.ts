/**
 * Redis-Backed Rate Limiting Middleware
 * 
 * AUDIT FIX: SEC-6, RL-1 - Redis-backed distributed rate limiting
 * AUDIT FIX: RL-2 - Add rate limit headers
 * AUDIT FIX: RL-3 - Add violation logging and metrics
 * 
 * Based on blockchain-service rate-limit.ts pattern
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';
import { RateLimitError } from '../errors';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Skip on error - fail open or fail closed when Redis unavailable
const SKIP_ON_ERROR = process.env.RATE_LIMIT_SKIP_ON_ERROR !== 'false';

// Default rate limits
const DEFAULT_LIMITS = {
  // Per-tenant limits
  TENANT_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_TENANT_RPM || '100', 10),
  TENANT_REQUESTS_PER_HOUR: parseInt(process.env.RATE_LIMIT_TENANT_RPH || '1000', 10),
  
  // Per-IP limits (for unauthenticated endpoints)
  IP_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_IP_RPM || '60', 10),
  
  // Query-specific limits (read operations)
  QUERY_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_QUERY_RPM || '50', 10),
  
  // Internal service limits (higher)
  INTERNAL_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_INTERNAL_RPM || '500', 10),
};

// Window sizes in milliseconds
const WINDOWS = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000
};

// =============================================================================
// METRICS TRACKING
// =============================================================================

interface RateLimitMetrics {
  rateLimitExceeded: number;
  rateLimitAllowed: number;
  redisErrors: number;
  memoryFallbacks: number;
}

const metrics: RateLimitMetrics = {
  rateLimitExceeded: 0,
  rateLimitAllowed: 0,
  redisErrors: 0,
  memoryFallbacks: 0
};

export function getRateLimitMetrics(): RateLimitMetrics {
  return { ...metrics };
}

export function resetRateLimitMetrics(): void {
  metrics.rateLimitExceeded = 0;
  metrics.rateLimitAllowed = 0;
  metrics.redisErrors = 0;
  metrics.memoryFallbacks = 0;
}

// =============================================================================
// VIOLATION LOGGING
// =============================================================================

interface RateLimitViolation {
  key: string;
  limit: number;
  ip: string;
  tenantId?: string;
  route: string;
  method: string;
  timestamp: string;
  windowMs: number;
  currentCount: number;
}

function logRateLimitViolation(violation: RateLimitViolation): void {
  metrics.rateLimitExceeded++;

  logger.warn({
    event: 'rate_limit_exceeded',
    ...violation,
    severity: 'warning'
  }, 'Rate limit exceeded');
}

function logRateLimitAllowed(key: string, remaining: number): void {
  metrics.rateLimitAllowed++;
  
  logger.debug({
    event: 'rate_limit_allowed',
    key,
    remaining
  }, 'Rate limit check passed');
}

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
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60 * 1000);

function checkMemoryLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number; count: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);
  
  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, count: 1 };
  }
  
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, count: entry.count };
  }
  
  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt, count: entry.count };
}

// =============================================================================
// REDIS RATE LIMITER
// =============================================================================

let redisClient: any = null;
let redisAvailable = true;

export function initializeRateLimitRedis(client: any): void {
  redisClient = client;
  redisAvailable = true;
  logger.info('Rate limiting Redis client initialized');
}

async function checkRedisLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number; count: number; fromMemory: boolean }> {
  if (!redisClient || !redisAvailable) {
    metrics.memoryFallbacks++;
    const result = checkMemoryLimit(key, limit, windowMs);
    return { ...result, fromMemory: true };
  }
  
  try {
    const now = Date.now();
    const windowKey = `ratelimit:indexer:${key}:${Math.floor(now / windowMs)}`;
    
    const count = await redisClient.incr(windowKey);
    
    if (count === 1) {
      await redisClient.pexpire(windowKey, windowMs);
    }
    
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
    
    if (count > limit) {
      return { allowed: false, remaining: 0, resetAt, count, fromMemory: false };
    }
    
    return { allowed: true, remaining: limit - count, resetAt, count, fromMemory: false };
  } catch (error) {
    metrics.redisErrors++;
    
    logger.warn({
      error: (error as Error).message,
      key,
      skipOnError: SKIP_ON_ERROR
    }, 'Redis rate limit check failed');

    if (SKIP_ON_ERROR) {
      logger.warn('Rate limit Redis unavailable, failing open (skipOnError=true)', { key });
      metrics.memoryFallbacks++;
      const result = checkMemoryLimit(key, limit, windowMs);
      return { ...result, fromMemory: true };
    } else {
      logger.error('Rate limit Redis unavailable, using memory fallback (skipOnError=false)', { key });
      const result = checkMemoryLimit(key, limit, windowMs);
      return { ...result, fromMemory: true };
    }
  }
}

// =============================================================================
// RATE LIMIT MIDDLEWARE
// =============================================================================

/**
 * General rate limiting middleware
 */
export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as any).tenantId;
  const internalService = (request as any).internalService;
  
  let key: string;
  let limit: number;
  let windowMs: number;
  
  if (internalService) {
    key = `internal:${internalService}`;
    limit = DEFAULT_LIMITS.INTERNAL_REQUESTS_PER_MINUTE;
    windowMs = WINDOWS.MINUTE;
  } else if (tenantId) {
    key = `tenant:${tenantId}`;
    limit = DEFAULT_LIMITS.TENANT_REQUESTS_PER_MINUTE;
    windowMs = WINDOWS.MINUTE;
  } else {
    key = `ip:${request.ip}`;
    limit = DEFAULT_LIMITS.IP_REQUESTS_PER_MINUTE;
    windowMs = WINDOWS.MINUTE;
  }
  
  const result = await checkRedisLimit(key, limit, windowMs);
  
  // Set rate limit headers
  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
  reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  
  if (result.fromMemory) {
    reply.header('X-RateLimit-Fallback', 'memory');
  }
  
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter);
    
    logRateLimitViolation({
      key,
      limit,
      ip: request.ip,
      tenantId,
      route: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      windowMs,
      currentCount: result.count
    });
    
    throw RateLimitError.forTenant(tenantId || request.ip, retryAfter);
  }
  
  logRateLimitAllowed(key, result.remaining);
}

/**
 * Query-specific rate limiting (for indexer query endpoints)
 */
export async function queryRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as any).tenantId;
  
  if (!tenantId) {
    // Fall back to general rate limiting
    return rateLimitMiddleware(request, reply);
  }
  
  const key = `query:${tenantId}`;
  const limit = DEFAULT_LIMITS.QUERY_REQUESTS_PER_MINUTE;
  const windowMs = WINDOWS.MINUTE;
  
  const result = await checkRedisLimit(key, limit, windowMs);
  
  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
  reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  
  if (result.fromMemory) {
    reply.header('X-RateLimit-Fallback', 'memory');
  }
  
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter);
    
    logRateLimitViolation({
      key,
      limit,
      ip: request.ip,
      tenantId,
      route: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      windowMs,
      currentCount: result.count
    });
    
    throw RateLimitError.forTenant(tenantId, retryAfter);
  }
  
  logRateLimitAllowed(key, result.remaining);
}

/**
 * Get current rate limit status for a tenant
 */
export async function getRateLimitStatus(tenantId: string): Promise<{
  general: { remaining: number; resetAt: number };
  query: { remaining: number; resetAt: number };
}> {
  const generalResult = await checkRedisLimit(
    `tenant:${tenantId}`,
    DEFAULT_LIMITS.TENANT_REQUESTS_PER_MINUTE,
    WINDOWS.MINUTE
  );
  
  const queryResult = await checkRedisLimit(
    `query:${tenantId}`,
    DEFAULT_LIMITS.QUERY_REQUESTS_PER_MINUTE,
    WINDOWS.MINUTE
  );
  
  return {
    general: {
      remaining: Math.max(0, generalResult.remaining - 1),
      resetAt: generalResult.resetAt
    },
    query: {
      remaining: Math.max(0, queryResult.remaining - 1),
      resetAt: queryResult.resetAt
    }
  };
}
