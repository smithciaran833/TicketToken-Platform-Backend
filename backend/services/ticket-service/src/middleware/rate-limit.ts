import { FastifyRequest, FastifyReply } from 'fastify';
import { RedisService } from '../services/redisService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RateLimiter' });

/**
 * AUDIT FIXES:
 * - RL1: Rate limit headers returned (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After)
 * - RL2: Rate limit bypass for health checks (skip /health endpoints)
 * - RL3: Tenant-specific rate limits (include tenant ID in rate limit key)
 * - RL5: Gradual throttling (progressive delays before hard cutoff)
 */

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Redis key prefix
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;      // Don't count failed requests
  /** Enable gradual throttling before hard cutoff */
  enableGradualThrottling?: boolean;
  /** Threshold percentage (0-1) at which to start gradual throttling */
  throttleThreshold?: number;
  /** Maximum delay in ms to apply during throttling */
  maxThrottleDelayMs?: number;
}

// =============================================================================
// RL2: Health Check Paths to Bypass Rate Limiting
// =============================================================================
const HEALTH_CHECK_PATHS = [
  '/health',
  '/health/live',
  '/health/ready',
  '/health/startup',
  '/metrics',
  '/health/liveness',
  '/health/readiness',
];

/**
 * Check if request is a health check that should bypass rate limiting
 */
function isHealthCheckPath(path: string): boolean {
  return HEALTH_CHECK_PATHS.some(healthPath => 
    path === healthPath || path.startsWith(healthPath + '?')
  );
}

// =============================================================================
// RL3: Tenant-Specific Rate Limit Configuration
// =============================================================================
export interface TenantRateLimitConfig {
  [tenantId: string]: {
    maxRequests?: number;
    windowMs?: number;
    /** Tier: 'free' | 'standard' | 'premium' | 'enterprise' */
    tier?: string;
  };
}

// Default tenant tier multipliers
const TENANT_TIER_MULTIPLIERS: Record<string, number> = {
  free: 1.0,
  standard: 2.0,
  premium: 5.0,
  enterprise: 10.0,
};

/**
 * Get tenant-specific rate limit adjustment
 */
function getTenantMultiplier(tenantId: string | undefined, tier?: string): number {
  if (!tenantId) return 1.0;
  
  // Use tier if provided
  if (tier && TENANT_TIER_MULTIPLIERS[tier]) {
    return TENANT_TIER_MULTIPLIERS[tier];
  }
  
  // Default to standard tier
  return TENANT_TIER_MULTIPLIERS.standard;
}

/**
 * Rate limit tiers for different endpoint types
 */
export const RateLimitTiers = {
  // Global default rate limit
  GLOBAL: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:global'
  },
  
  // Read operations (GET requests)
  READ: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:read'
  },
  
  // Write operations (POST/PUT/DELETE)
  WRITE: {
    windowMs: 60000,      // 1 minute
    maxRequests: 10,
    keyPrefix: 'ratelimit:write'
  },
  
  // Purchase operations (critical path)
  PURCHASE: {
    windowMs: 60000,      // 1 minute
    maxRequests: 5,
    keyPrefix: 'ratelimit:purchase'
  },
  
  // Transfer operations
  TRANSFER: {
    windowMs: 60000,      // 1 minute
    maxRequests: 5,
    keyPrefix: 'ratelimit:transfer'
  },
  
  // Admin operations
  ADMIN: {
    windowMs: 60000,      // 1 minute
    maxRequests: 20,
    keyPrefix: 'ratelimit:admin'
  },
  
  // Webhook operations (per tenant)
  WEBHOOK: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,
    keyPrefix: 'ratelimit:webhook'
  },
  
  // QR validation (venue scanners)
  QR_SCAN: {
    windowMs: 60000,      // 1 minute
    maxRequests: 30,
    keyPrefix: 'ratelimit:qr-scan'
  }
};

/**
 * Creates a rate limiter middleware with the specified configuration
 * 
 * AUDIT FIXES IMPLEMENTED:
 * - RL1: Rate limit headers returned (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After)
 * - RL2: Rate limit bypass for health checks
 * - RL3: Tenant-specific rate limits
 * - RL5: Gradual throttling (progressive delays before hard cutoff)
 */
export function createRateLimiter(config: RateLimitConfig) {
  // Default gradual throttling settings
  const enableGradualThrottling = config.enableGradualThrottling ?? true;
  const throttleThreshold = config.throttleThreshold ?? 0.75; // Start throttling at 75% of limit
  const maxThrottleDelayMs = config.maxThrottleDelayMs ?? 2000; // Max 2 second delay

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip rate limiting if disabled
    if (process.env.ENABLE_RATE_LIMITING === 'false') {
      return;
    }

    // =======================================================================
    // RL2: Skip rate limiting for health checks
    // =======================================================================
    if (isHealthCheckPath(request.url)) {
      log.debug('Skipping rate limit for health check', { path: request.url });
      return;
    }

    try {
      // =======================================================================
      // RL3: Tenant-specific rate limits
      // Include tenant ID in rate limit key for tenant isolation
      // =======================================================================
      const tenantId = (request as any).tenantId || (request as any).user?.tenantId;
      const userId = (request as any).user?.id || (request as any).user?.sub;
      const identifier = userId || request.ip || 'anonymous';
      const tenantTier = (request as any).user?.tier;

      // Create rate limit key including tenant for isolation
      const key = tenantId 
        ? `${config.keyPrefix}:tenant:${tenantId}:${identifier}`
        : `${config.keyPrefix}:${identifier}`;

      // Apply tenant tier multiplier to rate limit
      const tenantMultiplier = getTenantMultiplier(tenantId, tenantTier);
      const effectiveMaxRequests = Math.floor(config.maxRequests * tenantMultiplier);

      // Get current count and TTL from Redis
      const redis = RedisService.getClient();
      const current = await redis.get(key);
      const currentCount = current ? parseInt(current, 10) : 0;

      // =======================================================================
      // RL5: Gradual throttling before hard cutoff
      // Start adding delays when approaching the limit
      // =======================================================================
      if (enableGradualThrottling) {
        const usageRatio = currentCount / effectiveMaxRequests;
        
        if (usageRatio >= throttleThreshold && usageRatio < 1.0) {
          // Calculate progressive delay based on how close to limit
          // As usageRatio goes from throttleThreshold (0.75) to 1.0, delay goes from 0 to maxThrottleDelayMs
          const throttleProgress = (usageRatio - throttleThreshold) / (1.0 - throttleThreshold);
          const delayMs = Math.floor(throttleProgress * maxThrottleDelayMs);
          
          if (delayMs > 0) {
            log.debug('Applying gradual throttle delay', {
              identifier,
              tenantId,
              currentCount,
              effectiveMaxRequests,
              usageRatio: usageRatio.toFixed(2),
              delayMs,
            });
            
            // Apply progressive delay
            await new Promise(resolve => setTimeout(resolve, delayMs));
            
            // Add header to inform client about throttling
            reply.header('X-RateLimit-Throttled', 'true');
            reply.header('X-RateLimit-Throttle-Delay', delayMs);
          }
        }
      }

      // Check if limit exceeded (hard cutoff)
      if (currentCount >= effectiveMaxRequests) {
        const ttl = await redis.ttl(key);
        const resetTime = Date.now() + (ttl * 1000);

        // MEDIUM Fix: Log rate limit as security event
        log.warn('Rate limit exceeded', {
          security: {
            event: 'rate_limit_exceeded',
            severity: 'medium',
            identifier,
            tenantId,
            keyPrefix: config.keyPrefix,
            currentCount,
            limit: effectiveMaxRequests,
            baseLimit: config.maxRequests,
            tenantMultiplier,
            resetTime,
            url: request.url,
            method: request.method,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            timestamp: new Date().toISOString(),
          }
        });

        // =======================================================================
        // RL1: Set complete rate limit headers
        // =======================================================================
        reply.header('X-RateLimit-Limit', effectiveMaxRequests);
        reply.header('X-RateLimit-Remaining', 0);
        reply.header('X-RateLimit-Reset', resetTime);
        reply.header('Retry-After', ttl);
        // Additional policy header for API documentation
        reply.header('X-RateLimit-Policy', `${effectiveMaxRequests};w=${Math.floor(config.windowMs / 1000)}`);

        return reply.status(429).send({
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Please try again in ${ttl} seconds.`,
          retryAfter: ttl,
          limit: effectiveMaxRequests,
          resetAt: new Date(resetTime).toISOString(),
        });
      }

      // Increment counter
      const newCount = await redis.incr(key);

      // Set expiry on first request
      if (newCount === 1) {
        await redis.pexpire(key, config.windowMs);
      }

      // =======================================================================
      // RL1: Set rate limit headers on all responses
      // =======================================================================
      const remaining = Math.max(0, effectiveMaxRequests - newCount);
      const ttl = await redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);

      reply.header('X-RateLimit-Limit', effectiveMaxRequests);
      reply.header('X-RateLimit-Remaining', remaining);
      reply.header('X-RateLimit-Reset', resetTime);
      // Policy header: format is "limit;w=window_in_seconds"
      reply.header('X-RateLimit-Policy', `${effectiveMaxRequests};w=${Math.floor(config.windowMs / 1000)}`);
      
      // Add tenant info to headers if applicable
      if (tenantId) {
        reply.header('X-RateLimit-Tenant', tenantId);
        reply.header('X-RateLimit-Tier', tenantTier || 'standard');
      }

    } catch (error) {
      // Log error but don't block request if rate limiting fails
      log.error('Rate limiting error', { error });
      // Allow request to proceed
    }
  };
}

/**
 * Pre-configured rate limiters for different endpoint types
 */
export const rateLimiters = {
  global: createRateLimiter(RateLimitTiers.GLOBAL),
  read: createRateLimiter(RateLimitTiers.READ),
  write: createRateLimiter(RateLimitTiers.WRITE),
  purchase: createRateLimiter(RateLimitTiers.PURCHASE),
  transfer: createRateLimiter(RateLimitTiers.TRANSFER),
  admin: createRateLimiter(RateLimitTiers.ADMIN),
  webhook: createRateLimiter(RateLimitTiers.WEBHOOK),
  qrScan: createRateLimiter(RateLimitTiers.QR_SCAN)
};

/**
 * Rate limiter that combines multiple tiers
 * Checks all tiers and fails if any limit is exceeded
 */
export function combinedRateLimiter(...limiters: Array<(req: FastifyRequest, reply: FastifyReply) => Promise<void>>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    for (const limiter of limiters) {
      await limiter(request, reply);
      // If response was sent (429), stop checking other limiters
      if (reply.sent) {
        return;
      }
    }
  };
}

// =============================================================================
// MEDIUM Fix: Concurrent Request Limiting
// Fixes: "No concurrent limiting - Rate only, not concurrent"
// =============================================================================

const activeRequests = new Map<string, number>();

export interface ConcurrentLimitConfig {
  maxConcurrent: number;
  keyPrefix: string;
}

/**
 * Concurrent request limiter - limits simultaneous in-flight requests
 */
export function createConcurrentLimiter(config: ConcurrentLimitConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const identifier = userId || request.ip || 'anonymous';
    const key = `${config.keyPrefix}:${identifier}`;

    const current = activeRequests.get(key) || 0;

    if (current >= config.maxConcurrent) {
      log.warn('Concurrent limit exceeded', {
        security: {
          event: 'concurrent_limit_exceeded',
          severity: 'medium',
          identifier,
          current,
          limit: config.maxConcurrent,
          url: request.url,
        }
      });

      return reply.status(429).send({
        error: 'Too Many Requests',
        code: 'CONCURRENT_LIMIT_EXCEEDED',
        message: `Maximum ${config.maxConcurrent} concurrent requests allowed`,
      });
    }

    // Increment active count
    activeRequests.set(key, current + 1);

    // Decrement on response finish
    reply.raw.on('finish', () => {
      const newCount = (activeRequests.get(key) || 1) - 1;
      if (newCount <= 0) {
        activeRequests.delete(key);
      } else {
        activeRequests.set(key, newCount);
      }
    });
  };
}

// =============================================================================
// MEDIUM Fix: Ban Mechanism
// Fixes: "No ban mechanism - Rate limit only"
// =============================================================================

const bannedIdentifiers = new Map<string, { until: number; reason: string }>();

export interface BanConfig {
  /** Number of rate limit violations before ban */
  violationsThreshold: number;
  /** Ban duration in milliseconds */
  banDurationMs: number;
  /** Time window for counting violations (ms) */
  violationWindowMs: number;
}

const violationCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if identifier is banned
 */
export function checkBan(identifier: string): { banned: boolean; until?: Date; reason?: string } {
  const ban = bannedIdentifiers.get(identifier);
  if (!ban) return { banned: false };

  if (Date.now() > ban.until) {
    bannedIdentifiers.delete(identifier);
    return { banned: false };
  }

  return {
    banned: true,
    until: new Date(ban.until),
    reason: ban.reason
  };
}

/**
 * Record a rate limit violation and potentially ban
 */
export function recordViolation(identifier: string, config: BanConfig): boolean {
  const now = Date.now();
  const existing = violationCounts.get(identifier);

  if (!existing || now > existing.resetAt) {
    violationCounts.set(identifier, { count: 1, resetAt: now + config.violationWindowMs });
    return false;
  }

  existing.count++;

  if (existing.count >= config.violationsThreshold) {
    // Ban the identifier
    bannedIdentifiers.set(identifier, {
      until: now + config.banDurationMs,
      reason: `Exceeded ${config.violationsThreshold} rate limit violations`
    });
    violationCounts.delete(identifier);

    log.warn('Identifier banned due to repeated violations', {
      security: {
        event: 'identifier_banned',
        severity: 'high',
        identifier,
        violations: existing.count,
        banDurationMs: config.banDurationMs,
      }
    });

    return true;
  }

  return false;
}

/**
 * Ban check middleware
 */
export function createBanCheckMiddleware() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).user?.id || (request as any).user?.sub;
    const identifier = userId || request.ip || 'anonymous';

    const banStatus = checkBan(identifier);
    if (banStatus.banned) {
      log.warn('Banned identifier attempted access', {
        security: {
          event: 'banned_access_attempt',
          severity: 'high',
          identifier,
          banUntil: banStatus.until,
          reason: banStatus.reason,
        }
      });

      return reply.status(403).send({
        error: 'Forbidden',
        code: 'IDENTIFIER_BANNED',
        message: banStatus.reason,
        banUntil: banStatus.until?.toISOString()
      });
    }
  };
}

// =============================================================================
// MEDIUM Fix: 503 Load Shedding
// Fixes: "No 503 load shedding - Returns 429, not 503 under load"
// =============================================================================

let currentLoad = 0;
const MAX_LOAD = parseInt(process.env.MAX_SERVICE_LOAD || '1000', 10);
const LOAD_CHECK_INTERVAL = 1000;

// Track system load
setInterval(() => {
  // Use event loop lag as a proxy for load
  const start = Date.now();
  setImmediate(() => {
    const lag = Date.now() - start;
    // Normalize lag to a load score (0-100)
    currentLoad = Math.min(100, (lag / 100) * 100);
  });
}, LOAD_CHECK_INTERVAL);

export interface LoadSheddingConfig {
  /** Load threshold (0-100) above which to start shedding */
  threshold: number;
  /** Probability of shedding (0-1) when above threshold */
  sheddingProbability: number;
}

/**
 * Load shedding middleware - returns 503 when system is overloaded
 */
export function createLoadSheddingMiddleware(config: LoadSheddingConfig = { threshold: 80, sheddingProbability: 0.5 }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (currentLoad > config.threshold) {
      // Probabilistic shedding - don't reject all requests
      if (Math.random() < config.sheddingProbability) {
        log.warn('Load shedding - rejecting request', {
          currentLoad,
          threshold: config.threshold,
          url: request.url,
        });

        return reply.status(503).send({
          error: 'Service Unavailable',
          code: 'SERVICE_OVERLOADED',
          message: 'Service is experiencing high load. Please retry later.',
          retryAfter: 5
        });
      }
    }
  };
}

/**
 * Get current load level (for health checks)
 */
export function getCurrentLoad(): number {
  return currentLoad;
}

// =============================================================================
// Export pre-configured middlewares
// =============================================================================

export const concurrentLimiters = {
  purchase: createConcurrentLimiter({ maxConcurrent: 3, keyPrefix: 'concurrent:purchase' }),
  transfer: createConcurrentLimiter({ maxConcurrent: 2, keyPrefix: 'concurrent:transfer' }),
  default: createConcurrentLimiter({ maxConcurrent: 10, keyPrefix: 'concurrent:default' }),
};

export const loadShedding = createLoadSheddingMiddleware({ threshold: 80, sheddingProbability: 0.3 });
export const banCheck = createBanCheckMiddleware();
