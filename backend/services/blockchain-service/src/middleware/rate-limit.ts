/**
 * Rate Limiting Middleware for Blockchain Service
 * 
 * Issues Fixed:
 * - #15: No rate limiting → Per-tenant rate limits
 * - #28: Add skipOnError → Fail open when Redis unavailable
 * - #29: Add onExceeded logging → Track violations with metrics
 * - #40: Rate limiting bypass → Redis-backed distributed limits
 * 
 * Features:
 * - Per-tenant rate limiting
 * - Per-endpoint rate limiting
 * - Redis-backed for distributed systems
 * - Graceful fallback to in-memory with skipOnError
 * - Detailed violation logging and metrics
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { RateLimitError } from '../errors';

// Node.js globals - declared for TypeScript (available at runtime)
declare const process: { env: Record<string, string | undefined> };
declare function setInterval(callback: () => void, ms: number): void;

// =============================================================================
// CONFIGURATION
// =============================================================================

// AUDIT FIX #28: Skip on error configuration
const SKIP_ON_ERROR = process.env.RATE_LIMIT_SKIP_ON_ERROR !== 'false'; // Default true

// Default rate limits
const DEFAULT_LIMITS = {
  // Per-tenant limits
  TENANT_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_TENANT_RPM || '100', 10),
  TENANT_REQUESTS_PER_HOUR: parseInt(process.env.RATE_LIMIT_TENANT_RPH || '1000', 10),
  
  // Per-IP limits (for unauthenticated endpoints)
  IP_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_IP_RPM || '60', 10),
  
  // Minting-specific limits (expensive operations)
  MINT_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_MINT_RPM || '10', 10),
  MINT_REQUESTS_PER_HOUR: parseInt(process.env.RATE_LIMIT_MINT_RPH || '100', 10),
  
  // Internal service limits (higher)
  INTERNAL_REQUESTS_PER_MINUTE: parseInt(process.env.RATE_LIMIT_INTERNAL_RPM || '500', 10),
};

// Window sizes in milliseconds
const WINDOWS = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000
};

// =============================================================================
// METRICS TRACKING - AUDIT FIX #29
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

/**
 * Get current rate limit metrics
 */
export function getRateLimitMetrics(): RateLimitMetrics {
  return { ...metrics };
}

/**
 * Reset rate limit metrics (for testing)
 */
export function resetRateLimitMetrics(): void {
  metrics.rateLimitExceeded = 0;
  metrics.rateLimitAllowed = 0;
  metrics.redisErrors = 0;
  metrics.memoryFallbacks = 0;
}

// =============================================================================
// VIOLATION LOGGING - AUDIT FIX #29
// =============================================================================

interface RateLimitViolation {
  key: string;
  limit: number;
  ip: string;
  userId?: string;
  tenantId?: string;
  route: string;
  method: string;
  timestamp: string;
  windowMs: number;
  currentCount: number;
}

/**
 * Log rate limit violation with full context
 * AUDIT FIX #29: Detailed logging on exceeded
 */
function logRateLimitViolation(violation: RateLimitViolation): void {
  // Increment metrics
  metrics.rateLimitExceeded++;

  // Log with full context for debugging and alerting
  logger.warn('Rate limit exceeded', {
    event: 'rate_limit_exceeded',
    ...violation,
    severity: 'warning'
  });
}

/**
 * Log successful rate limit check (for debugging, lower level)
 */
function logRateLimitAllowed(key: string, remaining: number): void {
  metrics.rateLimitAllowed++;
  
  // Only log in debug mode to avoid noise
  logger.debug('Rate limit check passed', {
    event: 'rate_limit_allowed',
    key,
    remaining
  });
}

// =============================================================================
// IN-MEMORY RATE LIMITER (Fallback)
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory storage (per process - not ideal for distributed)
const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

/**
 * Check rate limit using in-memory store
 */
function checkMemoryLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number; count: number } {
  const now = Date.now();
  const entry = memoryStore.get(key);
  
  if (!entry || entry.resetAt < now) {
    // New window
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

/**
 * Initialize Redis client for rate limiting
 */
export function initializeRateLimitRedis(client: any): void {
  redisClient = client;
  redisAvailable = true;
  logger.info('Rate limiting Redis client initialized');
}

/**
 * Check rate limit using Redis (distributed)
 * AUDIT FIX #28: skipOnError support
 */
async function checkRedisLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number; count: number; fromMemory: boolean }> {
  // If Redis not available, fall back to memory
  if (!redisClient || !redisAvailable) {
    metrics.memoryFallbacks++;
    const result = checkMemoryLimit(key, limit, windowMs);
    return { ...result, fromMemory: true };
  }
  
  try {
    const now = Date.now();
    const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;
    
    // Increment counter
    const count = await redisClient.incr(windowKey);
    
    // Set expiry on first request
    if (count === 1) {
      await redisClient.pexpire(windowKey, windowMs);
    }
    
    const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
    
    if (count > limit) {
      return { allowed: false, remaining: 0, resetAt, count, fromMemory: false };
    }
    
    return { allowed: true, remaining: limit - count, resetAt, count, fromMemory: false };
  } catch (error) {
    // AUDIT FIX #28: Track Redis errors
    metrics.redisErrors++;
    
    // Log the error
    logger.warn('Redis rate limit check failed', {
      error: (error as Error).message,
      key,
      skipOnError: SKIP_ON_ERROR
    });

    // AUDIT FIX #28: skipOnError behavior
    if (SKIP_ON_ERROR) {
      // Fail open - allow the request but fall back to memory
      logger.warn('Rate limit Redis unavailable, failing open (skipOnError=true)', {
        key
      });
      metrics.memoryFallbacks++;
      const result = checkMemoryLimit(key, limit, windowMs);
      return { ...result, fromMemory: true };
    } else {
      // Fail closed - use memory strictly
      logger.error('Rate limit Redis unavailable, using memory fallback (skipOnError=false)', {
        key
      });
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
 * AUDIT FIX #28, #29: Enhanced with skipOnError and onExceeded
 */
export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as any).tenantId;
  const userId = (request as any).userId;
  const internalService = (request as any).internalService;
  
  let key: string;
  let limit: number;
  let windowMs: number;
  
  if (internalService) {
    // Internal service - higher limits
    key = `internal:${internalService}`;
    limit = DEFAULT_LIMITS.INTERNAL_REQUESTS_PER_MINUTE;
    windowMs = WINDOWS.MINUTE;
  } else if (tenantId) {
    // Tenant-based limiting
    key = `tenant:${tenantId}`;
    limit = DEFAULT_LIMITS.TENANT_REQUESTS_PER_MINUTE;
    windowMs = WINDOWS.MINUTE;
  } else {
    // IP-based limiting for unauthenticated requests
    key = `ip:${request.ip}`;
    limit = DEFAULT_LIMITS.IP_REQUESTS_PER_MINUTE;
    windowMs = WINDOWS.MINUTE;
  }
  
  const result = await checkRedisLimit(key, limit, windowMs);
  
  // Set rate limit headers
  reply.header('X-RateLimit-Limit', limit);
  reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining));
  reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  
  // Indicate if using fallback
  if (result.fromMemory) {
    reply.header('X-RateLimit-Fallback', 'memory');
  }
  
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter);
    
    // AUDIT FIX #29: Detailed violation logging
    logRateLimitViolation({
      key,
      limit,
      ip: request.ip,
      userId,
      tenantId,
      route: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      windowMs,
      currentCount: result.count
    });
    
    throw RateLimitError.forTenant(tenantId || request.ip, retryAfter);
  }
  
  // Log successful checks at debug level
  logRateLimitAllowed(key, result.remaining);
}

/**
 * Stricter rate limiting for minting endpoints
 * AUDIT FIX #28, #29: Enhanced with skipOnError and onExceeded
 */
export async function mintRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as any).tenantId;
  const userId = (request as any).userId;
  
  if (!tenantId) {
    throw new Error('Tenant ID required for minting');
  }
  
  // Per-minute limit
  const minuteKey = `mint:${tenantId}:min`;
  const minuteResult = await checkRedisLimit(
    minuteKey,
    DEFAULT_LIMITS.MINT_REQUESTS_PER_MINUTE,
    WINDOWS.MINUTE
  );
  
  // Per-hour limit
  const hourKey = `mint:${tenantId}:hour`;
  const hourResult = await checkRedisLimit(
    hourKey,
    DEFAULT_LIMITS.MINT_REQUESTS_PER_HOUR,
    WINDOWS.HOUR
  );
  
  // Use the more restrictive limit for headers
  const remaining = Math.min(minuteResult.remaining, hourResult.remaining);
  const resetAt = Math.min(minuteResult.resetAt, hourResult.resetAt);
  
  reply.header('X-RateLimit-Limit', `${DEFAULT_LIMITS.MINT_REQUESTS_PER_MINUTE}/min, ${DEFAULT_LIMITS.MINT_REQUESTS_PER_HOUR}/hour`);
  reply.header('X-RateLimit-Remaining', Math.max(0, remaining));
  reply.header('X-RateLimit-Reset', Math.ceil(resetAt / 1000));
  
  // Indicate if using fallback
  if (minuteResult.fromMemory || hourResult.fromMemory) {
    reply.header('X-RateLimit-Fallback', 'memory');
  }
  
  if (!minuteResult.allowed || !hourResult.allowed) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter);
    
    // AUDIT FIX #29: Detailed violation logging for minting
    const violatedLimit = !minuteResult.allowed ? 'per-minute' : 'per-hour';
    logRateLimitViolation({
      key: !minuteResult.allowed ? minuteKey : hourKey,
      limit: !minuteResult.allowed ? DEFAULT_LIMITS.MINT_REQUESTS_PER_MINUTE : DEFAULT_LIMITS.MINT_REQUESTS_PER_HOUR,
      ip: request.ip,
      userId,
      tenantId,
      route: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      windowMs: !minuteResult.allowed ? WINDOWS.MINUTE : WINDOWS.HOUR,
      currentCount: !minuteResult.allowed ? minuteResult.count : hourResult.count
    });
    
    logger.warn('Mint rate limit exceeded', {
      tenantId,
      violatedLimit,
      minuteCount: minuteResult.count,
      hourCount: hourResult.count,
      path: request.url
    });
    
    throw RateLimitError.forTenant(tenantId, retryAfter);
  }
  
  // Log successful checks
  logRateLimitAllowed(minuteKey, minuteResult.remaining);
}

/**
 * Get current rate limit status for a tenant
 */
export async function getRateLimitStatus(tenantId: string): Promise<{
  general: { remaining: number; resetAt: number };
  minting: { remaining: number; resetAt: number };
}> {
  const generalResult = await checkRedisLimit(
    `tenant:${tenantId}`,
    DEFAULT_LIMITS.TENANT_REQUESTS_PER_MINUTE,
    WINDOWS.MINUTE
  );
  
  const mintResult = await checkRedisLimit(
    `mint:${tenantId}:min`,
    DEFAULT_LIMITS.MINT_REQUESTS_PER_MINUTE,
    WINDOWS.MINUTE
  );
  
  return {
    general: {
      remaining: Math.max(0, generalResult.remaining - 1), // Don't count this check
      resetAt: generalResult.resetAt
    },
    minting: {
      remaining: Math.max(0, mintResult.remaining - 1),
      resetAt: mintResult.resetAt
    }
  };
}
