import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { createCache } from '@tickettoken/shared';

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
  condition?: (req: FastifyRequest) => boolean;
}

const routeCacheConfig: Map<string, CacheConfig> = new Map([
  ['/api/events', { ttl: 600 }], // 10 minutes
  ['/api/venues', { ttl: 1800 }], // 30 minutes
  ['/api/tickets/availability', { ttl: 30 }], // 30 seconds
  ['/api/search', { ttl: 300, varyBy: ['q', 'category'] }], // 5 minutes
]);

export function responseCachePlugin(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip non-GET requests
    if (request.method !== 'GET') {
      return;
    }

    // Check if route should be cached
    const path = request.url.split('?')[0];
    const config = routeCacheConfig.get(path);
    if (!config) {
      return;
    }

    // Check condition
    if (config.condition && !config.condition(request)) {
      return;
    }

    // Generate cache key
    let cacheKey = `response:${path}`;
    if (config.varyBy) {
      const query = request.query as any;
      const varies = config.varyBy.map(param => `${param}:${query[param] || ''}`).join(':');
      cacheKey += `:${varies}`;
    }

    // Try to get from cache
    const cached = await cache.service.get(cacheKey);
    if (cached) {
      reply.header('X-Cache', 'HIT');
      reply.header('X-Cache-TTL', String(config.ttl || '300'));
      return reply.send(cached);
    }

    // Cache miss - set header
    reply.header('X-Cache', 'MISS');

    // Store config for onSend hook
    (request as any).cacheConfig = { cacheKey, ttl: config.ttl || 300 };
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    const cacheConfig = (request as any).cacheConfig;
    
    if (cacheConfig && reply.statusCode === 200 && payload) {
      try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        await cache.service.set(cacheConfig.cacheKey, data, {
          ttl: cacheConfig.ttl,
          level: 'BOTH'
        });
      } catch (err) {
        console.error('Cache set error:', err);
      }
    }
    
    return payload;
  });
}

export function responseCache() {
  return responseCachePlugin;
}

// Cache invalidation endpoint
export function cacheInvalidationRoutes(app: FastifyInstance) {
  app.post('/admin/cache/invalidate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { patterns } = request.body as any;
    
    if (patterns && Array.isArray(patterns)) {
      for (const pattern of patterns) {
        await cache.service.delete(pattern);
      }
      return reply.send({ success: true, invalidated: patterns.length });
    } else {
      return reply.code(400).send({ error: 'patterns array required' });
    }
  });

  app.get('/admin/cache/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = cache.service.getStats();
    return reply.send(stats);
  });
}
