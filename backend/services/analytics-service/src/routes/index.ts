import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import analyticsRoutes from './analytics.routes';

export default async function routes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  // Mount analytics routes
  await fastify.register(analyticsRoutes, { prefix: '/' });

  // Cache management endpoints
  fastify.get('/cache/stats', async (req, reply) => {
    const { serviceCache } = require('../services/cache-integration');
    const stats = serviceCache.getStats();
    return reply.send(stats);
  });

  fastify.delete('/cache/flush', async (req, reply) => {
    const { serviceCache } = require('../services/cache-integration');
    await serviceCache.flush();
    return reply.send({ success: true, message: 'Cache flushed' });
  });
}

// Export as named export to match what app.ts expects
export { routes as router };
