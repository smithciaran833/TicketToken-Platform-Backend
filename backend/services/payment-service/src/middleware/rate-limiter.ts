import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { config } from '../config';
import { AuthRequest } from './auth';

const redis = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port
  }
});

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export function createRateLimiter(options: RateLimitConfig) {
  const {
    windowMs = 60000,
    max = 100,
    message = 'Too many requests',
    keyGenerator = (req: Request) => req.ip,
    skip = () => false
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip(req)) {
      return next();
    }

    try {
      const key = `rate-limit:${keyGenerator(req)}`;
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > max) {
        return res.status(429).json({ error: message });
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

// Connect Redis
redis.connect().catch(console.error);

// Export for backwards compatibility
export const rateLimiter = (name: string, max: number, windowSeconds: number) => {
  return createRateLimiter({
    windowMs: windowSeconds * 1000,
    max: max,
    message: `Too many ${name} requests`
  });
};
