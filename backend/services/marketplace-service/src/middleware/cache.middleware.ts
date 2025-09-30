import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { cache } from '../services/cache-integration';

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

export const cacheMiddleware = (options: CacheOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ttl = options.ttl || 300; // Default 5 minutes
      const cacheKey = options.key || `cache:${req.method}:${req.originalUrl}`;
      
      // Skip cache for non-GET requests
      if (req.method !== 'GET') {
        return next();
      }
      
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug(`Cache hit: ${cacheKey}`);
        return res.json(JSON.parse(cached as string));
      }
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to cache response
      res.json = function(data: any) {
        cache.set(cacheKey, JSON.stringify(data), { ttl })
          .catch((err: Error) => logger.error('Cache set error:', err));
        return originalJson(data);
      };
      
      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
};

export const clearCache = async (pattern: string): Promise<void> => {
  try {
    await cache.delete(pattern);
    logger.info(`Cache cleared for pattern: ${pattern}`);
  } catch (error) {
    logger.error('Error clearing cache:', error);
  }
};
