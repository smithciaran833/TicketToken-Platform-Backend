import { FastifyInstance } from 'fastify';
import paymentRoutes from './payment.routes';
import marketplaceRoutes from './marketplace.routes';
import groupPaymentRoutes from './group-payment.routes';
import venueRoutes from './venue.routes';
import complianceRoutes from './compliance.routes';
import webhookRoutes from './webhook.routes';
import internalRoutes from './internal.routes';

export default async function routes(fastify: FastifyInstance) {
  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      service: 'payment-service',
      timestamp: new Date().toISOString()
    };
  });

  // Mount routes
  await fastify.register(paymentRoutes, { prefix: '/payments' });
  await fastify.register(marketplaceRoutes, { prefix: '/marketplace' });
  await fastify.register(groupPaymentRoutes, { prefix: '/group-payments' });
  await fastify.register(venueRoutes, { prefix: '/venues' });
  await fastify.register(complianceRoutes, { prefix: '/compliance' });
  await fastify.register(webhookRoutes, { prefix: '/webhooks' });
  await fastify.register(internalRoutes); // Internal routes at root level
}
