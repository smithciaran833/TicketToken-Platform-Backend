/**
 * Rate Limiting Middleware
 * 
 * AUDIT FIX: RL-1 - Return 429 Too Many Requests instead of 401
 * AUDIT FIX: RL-2 - Add Retry-After header
 */

import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

// AUDIT FIX: RL-1 - Custom error class for rate limiting with proper 429 status
export class RateLimitExceededError extends Error {
  statusCode = 429;
  retryAfter: number;
  
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
  }
}

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
    
    // Window in seconds
    const windowSeconds = 60;
    
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    
    const limit = 100; // 100 requests per minute
    const remaining = Math.max(0, limit - count);
    
    // Get TTL for Retry-After header
    const ttl = await redis.ttl(key);
    const retryAfter = ttl > 0 ? ttl : windowSeconds;
    
    // AUDIT FIX: RL-3 - Add standard rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + retryAfter).toString());
    
    if (count > limit) {
      // AUDIT FIX: RL-2 - Add Retry-After header
      res.setHeader('Retry-After', retryAfter.toString());
      
      // AUDIT FIX: RL-1 - Return 429 status code (not 401)
      return res.status(429).json({
        type: 'https://httpstatuses.io/429',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        instance: req.path,
        retryAfter: retryAfter
      });
    }
    
    next();
  } catch (error) {
    // If Redis is down, allow the request but log the error
    logger.error('Rate limit error:', error);
    next();
  }
}

// Configurable rate limiter factory
export function createRateLimiter(options: {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    max = 100,
    keyPrefix = 'rate_limit:',
    keyGenerator = (req) => req.ip || req.socket.remoteAddress || 'unknown'
  } = options;
  
  const windowSeconds = Math.floor(windowMs / 1000);
  
  return async function(req: Request, res: Response, next: NextFunction) {
    try {
      // Skip rate limiting for health checks
      if (req.path === '/health' || req.path === '/ws-health') {
        return next();
      }

      const redis = getRedis();
      const clientId = keyGenerator(req);
      const key = `${keyPrefix}${clientId}:${req.path}`;
      
      const count = await redis.incr(key);
      
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      
      const remaining = Math.max(0, max - count);
      const ttl = await redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;
      
      res.setHeader('X-RateLimit-Limit', max.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + retryAfter).toString());
      
      if (count > max) {
        res.setHeader('Retry-After', retryAfter.toString());
        
        return res.status(429).json({
          type: 'https://httpstatuses.io/429',
          title: 'Too Many Requests',
          status: 429,
          detail: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          instance: req.path,
          retryAfter: retryAfter
        });
      }
      
      next();
    } catch (error) {
      logger.error('Rate limit error:', error);
      next();
    }
  };
}
