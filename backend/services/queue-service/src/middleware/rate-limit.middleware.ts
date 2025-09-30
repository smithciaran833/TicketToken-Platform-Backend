import { Request, Response, NextFunction } from 'express';
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
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if rate limited
      const isLimited = await rateLimiter.isRateLimited(service);
      
      if (isLimited) {
        const waitTime = rateLimiter.getWaitTime(service);
        res.setHeader('X-RateLimit-Limit', '1');
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + waitTime).toISOString());
        res.setHeader('Retry-After', Math.ceil(waitTime / 1000).toString());
        
        logger.warn(`Rate limit exceeded for ${service}`, {
          ip: req.ip,
          path: req.path
        });
        
        res.status(429).json({
          error: 'Rate limit exceeded',
          message,
          retryAfter: Math.ceil(waitTime / 1000)
        });
        return;
      }
      
      // Try to acquire rate limit
      await rateLimiter.acquire(service);
      
      // Release on response finish
      res.on('finish', () => {
        rateLimiter.release(service);
      });
      
      next();
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      // Allow request on error
      next();
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
