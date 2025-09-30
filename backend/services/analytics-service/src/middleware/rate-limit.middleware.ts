import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis';
import { UnauthorizedError } from './error-handler';

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/ws-health') {
      return next();
    }

    const redis = getRedis();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rate_limit:${ip}:${req.path}`;
    
    const count = await redis.incr(key);
    
    if (count === 1) {
      await redis.expire(key, 60); // 1 minute window
    }
    
    const limit = 100; // 100 requests per minute
    
    if (count > limit) {
      return next(new UnauthorizedError('Rate limit exceeded'));
    }
    
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', (limit - count).toString());
    
    next();
  } catch (error) {
    // If Redis is down, allow the request
    console.error('Rate limit error:', error);
    next();
  }
}
