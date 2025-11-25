import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { cache } from '../services/cache-integration';

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

export const cacheMiddleware = (options: CacheOptions = {}) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ttl = options.ttl || 300; // Default 5 minutes
      const cacheKey = options.key || `cache:${request.method}:${request.url}`;

      // Skip cache for non-GET requests
      if (request.method !== 'GET') {
        return;
      }

      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.debug(`Cache hit: ${cacheKey}`);
        return reply.send(JSON.parse(cached as string));
      }

      // Store original send method
      const originalSend = reply.send.bind(reply);

      // Override send method to cache response
      reply.send = function(data: any) {
        cache.set(cacheKey, JSON.stringify(data), { ttl })
          .catch((err: Error) => logger.error('Cache set error:', err));
        return originalSend(data);
      };
    } catch (error) {
      logger.error('Cache middleware error:', error);
      // Continue without cache on error
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
