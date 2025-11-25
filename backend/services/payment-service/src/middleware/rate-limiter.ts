import { FastifyRequest, FastifyReply } from 'fastify';
import { RedisService } from '../services/redisService';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RateLimiter' });

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (request: FastifyRequest) => string;
  skip?: (request: FastifyRequest) => boolean;
}

export function createRateLimiter(options: RateLimitConfig) {
  const {
    windowMs = 60000,
    max = 100,
    message = 'Too many requests',
    keyGenerator = (request: FastifyRequest) => request.ip,
    skip = () => false
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (skip(request)) {
      return;
    }

    try {
      const redis = RedisService.getClient();
      const key = `rate-limit:${keyGenerator(request)}`;
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > max) {
        return reply.code(429).send({ error: message });
      }
    } catch (error) {
      log.error('Rate limiter error', { error });
      // Allow request to proceed on rate limiter error
    }
  };
}

// Export for backwards compatibility
export const rateLimiter = (name: string, max: number, windowSeconds: number) => {
  return createRateLimiter({
    windowMs: windowSeconds * 1000,
    max: max,
    message: `Too many ${name} requests`
  });
};
