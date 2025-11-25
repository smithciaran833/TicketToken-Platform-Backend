/**
 * Rate Limiting Middleware for Fastify
 * Protects endpoints from abuse and DDoS attacks
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../config/redis';
import { SafeLogger } from '../utils/pci-log-scrubber.util';

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

  // Generate key
  const forwarded = request.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])
    : request.ip;
  const userId = (request as any).user?.id;
  const key = `${options.keyPrefix}${userId || ip || 'unknown'}`;

  try {
    // Get current count
    const current = await redis.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= options.max) {
      // Rate limit exceeded
      logger.warn('Rate limit exceeded', {
        key,
        ip,
        userId,
        path: request.url,
        method: request.method,
      });

      reply.code(429).send({
        error: 'Too many requests',
        message: options.message || 'You have exceeded the rate limit. Please try again later.',
        retryAfter: options.retryAfter || Math.ceil(options.windowMs / 1000),
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
    logger.error('Rate limiter error', { error: error.message, key });
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
