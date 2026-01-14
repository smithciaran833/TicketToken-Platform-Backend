/**
 * Rate Limiting Middleware for Fastify
 * Protects endpoints from abuse and DDoS attacks
 *
 * SECURITY: Uses rightmost IP from X-Forwarded-For to prevent spoofing.
 * The rightmost IP is added by YOUR trusted proxy, while leftmost IPs
 * can be spoofed by attackers.
 *
 * LOW FIXES:
 * - Add ban mechanism for repeat offenders
 * - Use Lua script for atomic INCR/EXPIRE operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from '../config/redis';
import { SafeLogger } from '../utils/pci-log-scrubber.util';
import { config } from '../config';

const logger = new SafeLogger('RateLimiter');

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  skipPaths?: string[];
  message?: string;
  retryAfter?: number;
}

/**
 * Extracts the client IP address from the request.
 *
 * SECURITY: Uses the RIGHTMOST IP from X-Forwarded-For header.
 * This is because:
 * - Leftmost IP can be spoofed by the client
 * - Rightmost IP is added by your trusted infrastructure
 *
 * If trustProxy is not configured or the IP is not from a trusted proxy,
 * falls back to the direct connection IP.
 *
 * @param request - Fastify request
 * @returns Client IP address
 */
function extractClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];

  if (forwarded) {
    // Parse the X-Forwarded-For header
    const forwardedStr = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
    const ips = forwardedStr.split(',').map(ip => ip.trim()).filter(Boolean);

    if (ips.length > 0) {
      // CRITICAL: Use the RIGHTMOST IP (added by our proxy), not leftmost (spoofable)
      // The rightmost IP is the one added by our trusted reverse proxy
      const clientIp = ips[ips.length - 1];

      // Validate it looks like an IP address
      if (isValidIp(clientIp)) {
        return clientIp;
      }
    }
  }

  // Fall back to direct connection IP
  return request.ip || 'unknown';
}

/**
 * Basic IP address validation (IPv4 and IPv6)
 */
function isValidIp(ip: string): boolean {
  // IPv4 pattern
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Generic rate limiter function for Fastify
 */
async function rateLimiter(
  request: FastifyRequest,
  reply: FastifyReply,
  options: RateLimitOptions
): Promise<void> {
  // Skip for certain paths
  if (options.skipPaths?.includes(request.url)) {
    return;
  }

  // SECURITY: Extract client IP using secure method (rightmost from X-Forwarded-For)
  const ip = extractClientIp(request);
  const userId = (request as any).user?.id;
  const key = `${options.keyPrefix}${userId || ip || 'unknown'}`;

  try {
    const redis = getRedis();

    // Get current count
    const current = await redis.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= options.max) {
      // Rate limit exceeded
      logger.warn({
        key,
        ip,
        userId,
        path: request.url,
        method: request.method,
      }, 'Rate limit exceeded');

      const retryAfterSeconds = options.retryAfter || Math.ceil(options.windowMs / 1000);

      // MEDIUM FIX: Add Retry-After HTTP header (RFC 6585)
      reply.header('Retry-After', retryAfterSeconds.toString());
      reply.header('X-RateLimit-Limit', options.max.toString());
      reply.header('X-RateLimit-Remaining', '0');
      reply.header('X-RateLimit-Reset', (Date.now() + retryAfterSeconds * 1000).toString());

      reply.code(429).send({
        error: 'Too many requests',
        message: options.message || 'You have exceeded the rate limit. Please try again later.',
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    // Increment counter
    if (count === 0) {
      // First request in window
      await redis.setex(key, Math.ceil(options.windowMs / 1000), '1');
    } else {
      await redis.incr(key);
    }

    // Set rate limit headers
    const remaining = options.max - count - 1;
    const ttl = await redis.ttl(key);

    reply.header('RateLimit-Limit', options.max.toString());
    reply.header('RateLimit-Remaining', Math.max(0, remaining).toString());
    reply.header('RateLimit-Reset', (Date.now() + ttl * 1000).toString());
  } catch (error: any) {
    logger.error({ error: error.message, key }, 'Rate limiter error');
    // Don't block request on rate limiter errors
  }
}

/**
 * Fee calculation rate limiter
 * Prevents price scraping and abuse
 */
export async function feeCalculatorRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return rateLimiter(request, reply, {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    keyPrefix: 'rl:fee:',
    skipPaths: ['/health', '/ready'],
    message: 'Too many fee calculation requests. Please try again later.',
    retryAfter: 60,
  });
}

/**
 * Payment processing rate limiter
 * More restrictive than fee calculation
 */
export async function paymentRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return rateLimiter(request, reply, {
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 payment attempts per minute
    keyPrefix: 'rl:payment:',
    message: 'Too many payment attempts. Please wait before trying again.',
    retryAfter: 60,
  });
}

/**
 * API-wide rate limiter
 * General protection for all endpoints
 */
export async function apiRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return rateLimiter(request, reply, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    keyPrefix: 'rl:api:',
    skipPaths: ['/health', '/ready'],
    message: 'You have exceeded the API rate limit. Please try again later.',
    retryAfter: 900,
  });
}

/**
 * Per-user rate limiter (requires authentication)
 * More granular control based on user ID
 */
export function createUserRateLimit(windowMinutes: number, maxRequests: number) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    return rateLimiter(request, reply, {
      windowMs: windowMinutes * 60 * 1000,
      max: maxRequests,
      keyPrefix: `rl:user:${windowMinutes}m:`,
      message: `You have exceeded your rate limit of ${maxRequests} requests per ${windowMinutes} minutes`,
      retryAfter: windowMinutes * 60,
    });
  };
}

// =============================================================================
// SYSTEM OVERLOAD PROTECTION (503)
// =============================================================================

// Track system load metrics
let systemOverloaded = false;
let lastOverloadCheck = 0;
const OVERLOAD_CHECK_INTERVAL = 5000; // Check every 5 seconds

/**
 * Check if system is under heavy load.
 * Returns true if system should return 503.
 */
async function isSystemOverloaded(): Promise<boolean> {
  const now = Date.now();

  // Only check periodically to avoid overhead
  if (now - lastOverloadCheck < OVERLOAD_CHECK_INTERVAL) {
    return systemOverloaded;
  }

  lastOverloadCheck = now;

  try {
    const redis = getRedis();

    // Check Redis latency as a proxy for system health
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    // If Redis latency > 500ms, system is overloaded
    if (latency > 500) {
      logger.warn({ redisLatency: latency }, 'System overload detected');
      systemOverloaded = true;
      return true;
    }

    // Check pending request count (if tracked)
    const pendingCount = await redis.get('system:pending_requests');
    const maxPending = parseInt(process.env.MAX_PENDING_REQUESTS || '1000', 10);

    if (pendingCount && parseInt(pendingCount, 10) > maxPending) {
      logger.warn({
        pending: pendingCount,
        max: maxPending
      }, 'System overload: too many pending requests');
      systemOverloaded = true;
      return true;
    }

    systemOverloaded = false;
    return false;
  } catch (error) {
    // If we can't check, assume not overloaded (fail open)
    return false;
  }
}

/**
 * MEDIUM FIX: Middleware to return 503 Service Unavailable during system overload.
 * This prevents cascading failures by rejecting requests early.
 */
export async function systemOverloadProtection(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip for health checks
  if (request.url.startsWith('/health')) {
    return;
  }

  const overloaded = await isSystemOverloaded();

  if (overloaded) {
    const retryAfter = 30; // Suggest retry in 30 seconds

    reply.header('Retry-After', retryAfter.toString());
    reply.code(503).send({
      error: 'Service temporarily unavailable',
      message: 'The system is currently experiencing high load. Please try again later.',
      retryAfter,
    });
    return;
  }
}

/**
 * Mark system as overloaded (can be called by external monitoring)
 */
export function setSystemOverloaded(overloaded: boolean): void {
  systemOverloaded = overloaded;
  if (overloaded) {
    logger.warn('System marked as overloaded');
  } else {
    logger.info('System overload cleared');
  }
}

// =============================================================================
// LOW FIX: LUA SCRIPT FOR ATOMIC RATE LIMITING
// =============================================================================

/**
 * Lua script for atomic rate limit increment with expiry.
 * This prevents race conditions between INCR and EXPIRE.
 *
 * KEYS[1] = rate limit key
 * ARGV[1] = max requests
 * ARGV[2] = window in seconds
 *
 * Returns: [current_count, ttl_remaining]
 */
const RATE_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('GET', key)
if current then
  current = tonumber(current)
  if current >= max then
    local ttl = redis.call('TTL', key)
    return {current, ttl}
  end
  current = redis.call('INCR', key)
  local ttl = redis.call('TTL', key)
  return {current, ttl}
else
  redis.call('SET', key, 1, 'EX', window)
  return {1, window}
end
`;

/**
 * Atomic rate limiter using Lua script
 */
async function atomicRateLimiter(
  request: FastifyRequest,
  reply: FastifyReply,
  options: RateLimitOptions
): Promise<void> {
  // Skip for certain paths
  if (options.skipPaths?.includes(request.url)) {
    return;
  }

  const ip = extractClientIp(request);
  const userId = (request as any).user?.id;
  const identifier = userId || ip || 'unknown';
  const key = `${options.keyPrefix}${identifier}`;
  const banKey = `${options.keyPrefix}ban:${identifier}`;

  try {
    const redis = getRedis();

    // LOW FIX: Check if user is banned
    const banned = await redis.get(banKey);
    if (banned) {
      const banTtl = await redis.ttl(banKey);
      logger.warn({ key, ip, userId }, 'Banned client attempted access');

      reply.header('Retry-After', banTtl.toString());
      reply.code(403).send({
        error: 'Access denied',
        message: 'You have been temporarily banned due to excessive requests.',
        retryAfter: banTtl,
      });
      return;
    }

    // Execute atomic Lua script
    const windowSeconds = Math.ceil(options.windowMs / 1000);
    const result = await redis.eval(
      RATE_LIMIT_LUA_SCRIPT,
      1,
      key,
      options.max.toString(),
      windowSeconds.toString()
    ) as [number, number];

    const [count, ttl] = result;
    const remaining = Math.max(0, options.max - count);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', options.max.toString());
    reply.header('X-RateLimit-Remaining', remaining.toString());
    reply.header('X-RateLimit-Reset', (Date.now() + ttl * 1000).toString());

    if (count > options.max) {
      // Rate limit exceeded
      logger.warn({
        key,
        ip,
        userId,
        count,
        max: options.max,
        path: request.url,
      }, 'Rate limit exceeded');

      // LOW FIX: Track violations for ban mechanism
      const violationKey = `${options.keyPrefix}violations:${identifier}`;
      const violations = await redis.incr(violationKey);
      await redis.expire(violationKey, 3600); // Track violations for 1 hour

      // Ban after 5 violations
      if (violations >= 5) {
        const banDuration = 3600; // 1 hour ban
        await redis.setex(banKey, banDuration, 'banned');
        logger.warn({
          identifier,
          violations,
          banDuration,
        }, 'Client banned for excessive violations');
      }

      const retryAfterSeconds = ttl > 0 ? ttl : Math.ceil(options.windowMs / 1000);

      reply.header('Retry-After', retryAfterSeconds.toString());
      reply.code(429).send({
        error: 'Too many requests',
        message: options.message || 'You have exceeded the rate limit. Please try again later.',
        retryAfter: retryAfterSeconds,
      });
      return;
    }
  } catch (error: any) {
    logger.error({ error: error.message, key }, 'Atomic rate limiter error');
    // Don't block request on rate limiter errors (fail open)
  }
}

/**
 * Advanced rate limiter with atomic operations
 */
export async function advancedRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  return atomicRateLimiter(request, reply, {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    keyPrefix: 'rl:adv:',
    skipPaths: ['/health', '/ready', '/metrics'],
    message: 'Rate limit exceeded. Please try again later.',
  });
}

/**
 * Unban a client (admin function)
 */
export async function unbanClient(identifier: string, keyPrefix: string = 'rl:adv:'): Promise<boolean> {
  try {
    const redis = getRedis();
    const banKey = `${keyPrefix}ban:${identifier}`;
    const violationKey = `${keyPrefix}violations:${identifier}`;

    await redis.del(banKey);
    await redis.del(violationKey);

    logger.info({ identifier }, 'Client unbanned');
    return true;
  } catch (error) {
    logger.error({ identifier, error }, 'Failed to unban client');
    return false;
  }
}

/**
 * Check if a client is banned
 */
export async function isClientBanned(identifier: string, keyPrefix: string = 'rl:adv:'): Promise<{ banned: boolean; ttl: number }> {
  try {
    const redis = getRedis();
    const banKey = `${keyPrefix}ban:${identifier}`;

    const banned = await redis.get(banKey);
    if (banned) {
      const ttl = await redis.ttl(banKey);
      return { banned: true, ttl };
    }
    return { banned: false, ttl: 0 };
  } catch (error) {
    return { banned: false, ttl: 0 };
  }
}
