import { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { RedisService } from '../services/redisService';
import { logger } from '../utils/logger';

export async function registerRateLimiting(app: FastifyInstance) {
  const enabled = process.env.ENABLE_RATE_LIMITING !== 'false';
  
  if (!enabled) {
    logger.warn('Rate limiting is DISABLED - not recommended for production');
    return;
  }

  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

  try {
    await app.register(rateLimit, {
      global: true,
      max: maxRequests,
      timeWindow: windowMs,
      cache: 10000,
      allowList: ['127.0.0.1', '::1'], // Allow localhost
      redis: RedisService.getClient(),
      nameSpace: 'event-service-rate-limit:',
      continueExceeding: true,
      skipOnError: true, // Fail open - keep service available if Redis fails
      keyGenerator: (request: FastifyRequest) => {
        // Use IP address as key, with fallback to a default
        return request.ip || request.headers['x-forwarded-for'] as string || 'unknown';
      },
      errorResponseBuilder: (_request: FastifyRequest, _context: any) => {
        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil(windowMs / 1000)
        };
      },
      onExceeding: (request: FastifyRequest) => {
        logger.warn({
          ip: request.ip,
          method: request.method,
          url: request.url
        }, 'Rate limit approaching');
      },
      onExceeded: (request: FastifyRequest) => {
        logger.error({
          ip: request.ip,
          method: request.method,
          url: request.url
        }, 'Rate limit exceeded');
      }
    });

    logger.info({
      maxRequests,
      windowMs,
      windowSeconds: windowMs / 1000
    }, 'Rate limiting enabled');
  } catch (error) {
    logger.error({ error }, 'Failed to register rate limiting - service will continue without rate limiting');
  }
}
