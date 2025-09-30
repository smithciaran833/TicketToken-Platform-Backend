import { Request, Response, NextFunction } from 'express';
import { createCache } from '@tickettoken/shared/cache/dist';

const cache = createCache({
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'gateway:',
  }
});

interface CacheConfig {
  ttl?: number;
  varyBy?: string[];
  condition?: (req: Request) => boolean;
}

const routeCacheConfig: Map<string, CacheConfig> = new Map([
  ['/api/events', { ttl: 600 }], // 10 minutes
  ['/api/venues', { ttl: 1800 }], // 30 minutes
  ['/api/tickets/availability', { ttl: 30 }], // 30 seconds
  ['/api/search', { ttl: 300, varyBy: ['q', 'category'] }], // 5 minutes
]);

export function responseCache() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if route should be cached
    const config = routeCacheConfig.get(req.path);
    if (!config) {
      return next();
    }

    // Check condition
    if (config.condition && !config.condition(req)) {
      return next();
    }

    // Generate cache key
    let cacheKey = `response:${req.path}`;
    if (config.varyBy) {
      const varies = config.varyBy.map(param => `${param}:${req.query[param] || ''}`).join(':');
      cacheKey += `:${varies}`;
    }

    // Try to get from cache
    const cached = await cache.service.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-TTL', config.ttl || '300');
      return res.json(cached);
    }

    // Cache miss - capture response
    const originalJson = res.json;
    res.json = function(data: any) {
      res.setHeader('X-Cache', 'MISS');
      
      // Store in cache if successful
      if (res.statusCode === 200) {
        cache.service.set(cacheKey, data, { 
          ttl: config.ttl || 300,
          level: 'BOTH'
        }).catch(err => console.error('Cache set error:', err));
      }
      
      return originalJson.call(this, data);
    };

    next();
  };
}

// Cache invalidation endpoint
export function cacheInvalidationRoutes(app: any) {
  app.post('/admin/cache/invalidate', async (req: Request, res: Response) => {
    const { patterns } = req.body;
    
    if (patterns && Array.isArray(patterns)) {
      for (const pattern of patterns) {
        await cache.service.delete(pattern);
      }
      res.json({ success: true, invalidated: patterns.length });
    } else {
      res.status(400).json({ error: 'patterns array required' });
    }
  });

  app.get('/admin/cache/stats', async (_req: Request, res: Response) => {
    const stats = cache.service.getStats();
    res.json(stats);
  });
}
