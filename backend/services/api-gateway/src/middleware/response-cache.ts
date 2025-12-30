/**
 * Response Cache Middleware - Updated to use @tickettoken/shared Redis cache
 */
import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { getCacheManager } from '@tickettoken/shared';

const cacheManager = getCacheManager();

interface CacheConfig {
  ttl?: number;
  varyBy?: string[];
  condition?: (req: FastifyRequest) => boolean;
  private?: boolean;  // If true, cache key includes user ID
}

const routeCacheConfig: Map<string, CacheConfig> = new Map([
  ['/api/events', { ttl: 600 }], // 10 minutes
  ['/api/venues', { ttl: 1800 }], // 30 minutes
  ['/api/tickets/availability', { ttl: 30 }], // 30 seconds
  ['/api/search', { ttl: 300, varyBy: ['q', 'category'] }], // 5 minutes
]);

export function responseCachePlugin(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    // Only cache GET and HEAD requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
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

    // Generate cache key with method for safety
    // Format: gateway:response:{method}:{path}[:varies][:userId]
    let cacheKey = `gateway:response:${request.method}:${path}`;

    // Add query param variations
    if (config.varyBy) {
      const query = request.query as any;
      const varies = config.varyBy.map(param => `${param}:${query[param] || ''}`).join(':');
      cacheKey += `:${varies}`;
    }

    // Add user ID for private/personalized responses
    if (config.private) {
      const user = (request as any).user;
      if (user?.id) {
        cacheKey += `:user:${user.id}`;
      } else {
        // Don't cache private responses for unauthenticated users
        return;
      }
    }

    // Add venue context if present (multi-tenant isolation)
    const venueContext = (request as any).venueContext;
    if (venueContext?.venueId) {
      cacheKey += `:venue:${venueContext.venueId}`;
    }

    // Try to get from cache using new cache manager
    const cached = await cacheManager.get(cacheKey);

    if (cached) {
      reply.header('X-Cache', 'HIT');
      reply.header('X-Cache-Key', cacheKey.substring(0, 50) + '...'); // Truncated for debugging
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
        // Use new cache manager
        await cacheManager.set(cacheConfig.cacheKey, data, cacheConfig.ttl);
      } catch (err) {
        // Log but don't fail request
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
        // Use cache manager's safe invalidate (uses SCAN not KEYS)
        await cacheManager.invalidate(pattern);
      }
      return reply.send({ success: true, invalidated: patterns.length });
    } else {
      return reply.code(400).send({ error: 'patterns array required' });
    }
  });

  app.get('/admin/cache/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    // Basic stats - can be enhanced
    return reply.send({
      message: 'Cache stats available via Redis monitoring',
      backend: 'Redis via @tickettoken/shared'
    });
  });
}
