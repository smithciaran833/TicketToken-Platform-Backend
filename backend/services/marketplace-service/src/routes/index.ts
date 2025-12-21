import { FastifyInstance } from 'fastify';
import listingsRoutes from './listings.routes';
import transfersRoutes from './transfers.routes';
import venueRoutes from './venue.routes';
import searchRoutes from './search.routes';
import adminRoutes from './admin.routes';
import disputesRoutes from './disputes.routes';
import taxRoutes from './tax.routes';
import healthRoutes from './health.routes';
import webhookRoutes from './webhook.routes';
import { sellerOnboardingRoutes } from './seller-onboarding.routes';
import { authMiddleware } from '../middleware/auth.middleware';

export default async function routes(fastify: FastifyInstance) {
  // Health check routes
  await fastify.register(healthRoutes);

  // Route groups
  await fastify.register(listingsRoutes, { prefix: '/listings' });
  await fastify.register(transfersRoutes, { prefix: '/transfers' });
  await fastify.register(venueRoutes, { prefix: '/venues' });
  await fastify.register(searchRoutes, { prefix: '/search' });
  await fastify.register(adminRoutes, { prefix: '/admin' });
  await fastify.register(disputesRoutes, { prefix: '/disputes' });
  await fastify.register(taxRoutes, { prefix: '/tax' });
  await fastify.register(sellerOnboardingRoutes, { prefix: '/seller' });
  await fastify.register(webhookRoutes, { prefix: '/webhooks' });

  // Marketplace statistics (authenticated)
  fastify.get('/stats', {
    preHandler: [authMiddleware]
  }, async (request, reply) => {
    try {
      // Get marketplace statistics
      reply.send({
        totalListings: 0,
        totalSales: 0,
        volume24h: 0,
        averagePrice: 0
      });
    } catch (error: any) {
      reply.status(500).send({ error: error.message });
    }
  });

  // Cache management endpoints
  fastify.get('/cache/stats', async (request, reply) => {
    const { cache } = require('../services/cache-integration');
    const stats = await cache.getStats();
    reply.send(stats);
  });

  fastify.delete('/cache/flush', async (request, reply) => {
    const { cache } = require('../services/cache-integration');
    await cache.flush();
    reply.send({ success: true, message: 'Cache flushed' });
  });
}
