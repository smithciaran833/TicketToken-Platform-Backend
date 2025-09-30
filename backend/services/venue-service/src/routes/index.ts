import { FastifyInstance } from 'fastify';
import internalValidationRoutes from './internal-validation.routes';
import venuesRoutes from './venues.routes';

// ISSUE #27 FIX: Remove phantom Express routes and use Fastify properly
export async function setupRoutes(fastify: FastifyInstance) {
  // Register actual Fastify routes
  await fastify.register(venuesRoutes, { prefix: '/api/v1' });
  await fastify.register(internalValidationRoutes, { prefix: '/' });
  
  // Cache management endpoints - Fastify style
  fastify.get('/api/v1/cache/stats', async (request, reply) => {
    const { cache } = require('../services/cache-integration');
    const stats = cache.getStats();
    return stats;
  });

  fastify.delete('/api/v1/cache/flush', async (request, reply) => {
    const { cache } = require('../services/cache-integration');
    await cache.flush();
    return { success: true, message: 'Cache flushed' };
  });
}

export default setupRoutes;
