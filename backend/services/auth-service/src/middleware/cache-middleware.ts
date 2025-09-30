import { Request, Response, NextFunction } from 'express';
import { cache } from '../services/cache-integration';

// Create a rate limit cache instance
const rateLimitCache = {
  limits: new Map<string, { count: number; resetTime: number }>(),
  
  async checkLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.limits.get(key);
    
    if (existing && existing.resetTime > now) {
      if (existing.count >= limit) {
        return false;
      }
      existing.count++;
    } else {
      this.limits.set(key, {
        count: 1,
        resetTime: now + (windowSeconds * 1000)
      });
    }
    return true;
  }
};

/**
 * Cache middleware for GET requests
 */
export const cacheMiddleware = (ttl: number = 60) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = `${req.originalUrl || req.url}`;
    
    try {
      const cached = await cache.get(key);
      if (cached) {
        res.json(cached);
        return;
      }
    } catch (error) {
      console.error('Cache error:', error);
    }

    // Store original send
    const originalJson = res.json.bind(res);
    
    // Override json method
    res.json = function(data: any) {
      cache.set(key, data, { ttl }).catch(console.error);
      return originalJson(data);
    };
    
    next();
  };
};

/**
 * Rate limiting middleware using cache
 */
export const rateLimitMiddleware = (limit: number = 10, window: number = 60) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${req.ip}:${req.path}`;
    const allowed = await rateLimitCache.checkLimit(key, limit, window);
    
    if (!allowed) {
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${window} seconds.`
      });
      return;
    }
    
    next();
  };
};
