import { FastifyInstance, FastifyRequest, RouteOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { verifyServiceToken, verifyApiKey } from '../config/service-auth';

/**
 * Rate Limiting Configuration
 * 
 * CRITICAL FIX: Stricter limits for write operations (POST/PUT/DELETE)
 * and lower limits for search/intensive operations.
 * 
 * AUDIT FIXES:
 * - KG4: Uses user ID and tenant ID (not just IP) for rate limiting
 * - KG5: Tenant-aware rate limiting with tenant ID in key
 * - ES7: Internal service exemption for S2S calls
 */

// Rate limit configurations
const RATE_LIMITS = {
  // Read operations - higher limit
  read: {
    max: parseInt(process.env.RATE_LIMIT_READ_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
  // Write operations - stricter limit
  write: {
    max: parseInt(process.env.RATE_LIMIT_WRITE_MAX || '30', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
  // Search operations - lower limit (intensive)
  search: {
    max: parseInt(process.env.RATE_LIMIT_SEARCH_MAX || '20', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
  // Bulk operations - very strict
  bulk: {
    max: parseInt(process.env.RATE_LIMIT_BULK_MAX || '10', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  },
};

/**
 * AUDIT FIX (BA4): Configurable IP allowlist via environment variable
 * Format: RATE_LIMIT_ALLOWLIST=127.0.0.1,::1,10.0.0.0/8
 */
function getConfigurableAllowlist(): string[] {
  const defaultAllowlist = ['127.0.0.1', '::1'];
  const envAllowlist = process.env.RATE_LIMIT_ALLOWLIST;
  
  if (!envAllowlist) {
    return defaultAllowlist;
  }
  
  // Parse comma-separated list and merge with defaults
  const customAllowlist = envAllowlist.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
  return [...new Set([...defaultAllowlist, ...customAllowlist])];
}

/**
 * AUDIT FIX (BA2): Health check endpoints excluded from rate limiting
 * These paths are critical for orchestration and should never be rate limited
 */
const RATE_LIMIT_EXCLUDED_PATHS = [
  '/health',
  '/health/live',
  '/health/ready',
  '/health/startup',
  '/health/pressure',
  '/health/full',
  '/metrics',
];

/**
 * Check if a path should be excluded from rate limiting
 * AUDIT FIX (BA2): Health checks explicitly excluded
 */
function isExcludedPath(url: string): boolean {
  const pathname = url.split('?')[0]; // Remove query string
  return RATE_LIMIT_EXCLUDED_PATHS.some(excluded => 
    pathname === excluded || pathname.startsWith(excluded + '/')
  );
}

/**
 * AUDIT FIX (IA7): Per-service rate limits
 * Different services can have different rate limits based on their service name
 */
const SERVICE_RATE_LIMITS: Record<string, { multiplier: number }> = {
  'venue-service': { multiplier: 2.0 },     // Higher limits for venue service
  'ticket-service': { multiplier: 1.5 },    // Medium-high for ticket service
  'order-service': { multiplier: 1.5 },     // Medium-high for order service
  'payment-service': { multiplier: 1.0 },   // Standard limits
  'notification-service': { multiplier: 3.0 }, // High limits for notifications
  default: { multiplier: 1.0 },
};

/**
 * Get rate limit multiplier for a specific service
 */
function getServiceRateLimitMultiplier(serviceName: string | undefined): number {
  if (!serviceName) return 1.0;
  return SERVICE_RATE_LIMITS[serviceName]?.multiplier || SERVICE_RATE_LIMITS.default.multiplier;
}

/**
 * AUDIT FIX (ES7): Check if request is from an authenticated internal service
 * 
 * Services are identified by:
 * 1. X-Service-Token header (S2S token)
 * 2. X-API-Key header (API key authentication)
 * 
 * Authenticated services are exempt from rate limiting to allow
 * inter-service communication to proceed without constraints.
 */
async function isAuthenticatedService(request: FastifyRequest): Promise<boolean> {
  const serviceToken = request.headers['x-service-token'] as string | undefined;
  const apiKey = request.headers['x-api-key'] as string | undefined;

  // Check service token
  if (serviceToken) {
    const result = await verifyServiceToken(serviceToken);
    if (result.valid) {
      return true;
    }
  }

  // Check API key
  if (apiKey) {
    const result = await verifyApiKey(apiKey);
    if (result.valid) {
      return true;
    }
  }

  return false;
}

/**
 * Get rate limit configuration based on HTTP method and URL
 */
function getRateLimitForRequest(request: FastifyRequest): { max: number; timeWindow: number } {
  const method = request.method.toUpperCase();
  const url = request.url.toLowerCase();

  // Bulk operations
  if (url.includes('/bulk') || url.includes('/batch')) {
    return RATE_LIMITS.bulk;
  }

  // Search operations
  if (url.includes('/search') || url.includes('/query')) {
    return RATE_LIMITS.search;
  }

  // Write operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return RATE_LIMITS.write;
  }

  // Default to read limits
  return RATE_LIMITS.read;
}

export async function registerRateLimiting(app: FastifyInstance) {
  const enabled = process.env.ENABLE_RATE_LIMITING !== 'false';
  
  if (!enabled) {
    logger.warn('Rate limiting is DISABLED - not recommended for production');
    return;
  }

  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

  try {
    // AUDIT FIX (BA4): Use configurable allowlist
    const allowList = getConfigurableAllowlist();
    
    // Register global rate limiter with dynamic limits
    await app.register(rateLimit, {
      global: true,
      max: async (request: FastifyRequest, _key: string) => {
        // AUDIT FIX (BA2): Skip rate limiting for health check endpoints
        if (isExcludedPath(request.url)) {
          return 1000000; // Effectively unlimited for health/metrics
        }
        
        // AUDIT FIX (ES7): Exempt authenticated internal services from rate limiting
        // Return very high limit effectively disabling rate limiting for S2S calls
        if (await isAuthenticatedService(request)) {
          return 1000000; // Effectively unlimited for services
        }
        const config = getRateLimitForRequest(request);
        return config.max;
      },
      timeWindow: windowMs,
      cache: 10000,
      allowList, // AUDIT FIX (BA4): Configurable via RATE_LIMIT_ALLOWLIST env var
      redis: getRedis(),
      nameSpace: 'event-service-rate-limit:',
      continueExceeding: true,
      skipOnError: true, // Fail open - keep service available if Redis fails
      /**
       * AUDIT FIX (KG4, KG5): Rate limit key uses tenant ID + user ID
       * Format: {tenantId}:{userId|ip}:{limitType}
       * 
       * - KG4: Uses user ID (not just IP) when authenticated
       * - KG5: Includes tenant ID for tenant-aware rate limiting
       */
      keyGenerator: (request: FastifyRequest) => {
        const ip = request.ip || request.headers['x-forwarded-for'] as string || 'unknown';
        const limitType = getLimitType(request);
        
        // Get tenant and user from request context (set by auth middleware)
        const user = (request as any).user;
        const tenantId = user?.tenant_id || (request as any).tenantId || 'anon';
        const userId = user?.id || user?.sub;
        
        // Use user ID if authenticated, otherwise fall back to IP
        const identity = userId || ip;
        
        // Format: tenantId:identity:limitType
        // This ensures:
        // - Different tenants have separate rate limit buckets (KG5)
        // - Different users within a tenant have separate limits (KG4)
        // - Unauthenticated requests fall back to IP-based limiting
        return `${tenantId}:${identity}:${limitType}`;
      },
      errorResponseBuilder: (request: FastifyRequest, context: any) => {
        const config = getRateLimitForRequest(request);
        return {
          type: 'https://api.tickettoken.com/errors/rate-limited',
          title: 'Rate Limit Exceeded',
          status: 429,
          detail: `Too many ${request.method} requests. Please wait before making another request.`,
          code: 'RATE_LIMITED',
          limit: config.max,
          remaining: 0,
          retryAfter: Math.ceil(windowMs / 1000),
        };
      },
      onExceeding: (request: FastifyRequest, key: string) => {
        const config = getRateLimitForRequest(request);
        logger.warn({
          ip: request.ip,
          method: request.method,
          url: request.url,
          limit: config.max,
          key,
        }, 'Rate limit approaching');
      },
      onExceeded: (request: FastifyRequest, key: string) => {
        const config = getRateLimitForRequest(request);
        logger.error({
          ip: request.ip,
          method: request.method,
          url: request.url,
          limit: config.max,
          key,
        }, 'Rate limit exceeded');
      },
    });

    logger.info({
      limits: RATE_LIMITS,
      windowMs,
      windowSeconds: windowMs / 1000,
    }, 'Rate limiting enabled with method-specific limits');
  } catch (error) {
    logger.error({ error }, 'Failed to register rate limiting - service will continue without rate limiting');
  }
}

/**
 * Get the limit type for key generation
 */
function getLimitType(request: FastifyRequest): string {
  const method = request.method.toUpperCase();
  const url = request.url.toLowerCase();

  if (url.includes('/bulk') || url.includes('/batch')) {
    return 'bulk';
  }
  if (url.includes('/search') || url.includes('/query')) {
    return 'search';
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return 'write';
  }
  return 'read';
}

/**
 * Export rate limit configs for route-specific overrides
 */
export { RATE_LIMITS };
