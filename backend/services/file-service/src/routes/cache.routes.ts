import { FastifyInstance } from 'fastify';

export async function cacheRoutes(fastify: FastifyInstance) {
  fastify.get('/cache/stats', async (request, reply) => {
    const { serviceCache } = require('../services/cache-integration');
    const stats = serviceCache.getStats();
    return reply.send(stats);
  });

  fastify.delete('/cache/flush', async (request, reply) => {
    const { serviceCache } = require('../services/cache-integration');
    await serviceCache.flush();
    return reply.send({ success: true, message: 'Cache flushed' });
  });
}
