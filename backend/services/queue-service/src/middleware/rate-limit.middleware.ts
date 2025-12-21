import { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimiterService } from '../services/rate-limiter.service';
import { logger } from '../utils/logger';

const rateLimiter = RateLimiterService.getInstance();

export interface RateLimitOptions {
  service?: string;
  maxRequests?: number;
  windowMs?: number;
  message?: string;
}

/**
 * Rate limit middleware for API endpoints
 */
export function rateLimitMiddleware(options: RateLimitOptions = {}) {
  const {
    service = 'internal',
    message = 'Too many requests, please try again later.'
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // Check if rate limited
      const isLimited = await rateLimiter.isRateLimited(service);

      if (isLimited) {
        const waitTime = await rateLimiter.getWaitTime(service);
        reply.header('X-RateLimit-Limit', '1');
        reply.header('X-RateLimit-Remaining', '0');
        reply.header('X-RateLimit-Reset', new Date(Date.now() + waitTime).toISOString());
        reply.header('Retry-After', Math.ceil(waitTime / 1000).toString());

        logger.warn(`Rate limit exceeded for ${service}`, {
          ip: request.ip,
          path: request.url
        });

        return reply.code(429).send({
          error: 'Rate limit exceeded',
          message,
          retryAfter: Math.ceil(waitTime / 1000)
        });
      }

      // Try to acquire rate limit
      await rateLimiter.acquire(service);

      // Release on response finish
      reply.raw.on('finish', () => {
        rateLimiter.release(service);
      });
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      // Allow request on error - don't block
    }
  };
}

/**
 * Global rate limiter for all API endpoints
 */
export const globalRateLimit = rateLimitMiddleware({
  service: 'internal',
  message: 'API rate limit exceeded. Please slow down your requests.'
});
