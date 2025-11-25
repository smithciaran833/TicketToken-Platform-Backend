import { FastifyInstance } from 'fastify';
import { InternalController } from '../controllers';
import { authenticateInternal } from '../middleware';

export default async function internalRoutes(fastify: FastifyInstance) {
  const controller = new InternalController();

  // Confirm order after payment (called by payment-service)
  fastify.post(
    '/internal/v1/orders/:orderId/confirm',
    {
      preHandler: [
        authenticateInternal,
      ],
    },
    async (request, reply) => controller.confirmOrder(request, reply)
  );

  // Expire order (called by scheduler)
  fastify.post(
    '/internal/v1/orders/:orderId/expire',
    {
      preHandler: [
        authenticateInternal,
      ],
    },
    async (request, reply) => controller.expireOrder(request, reply)
  );

  // Get expiring orders (called by expiration job)
  fastify.get(
    '/internal/v1/orders/expiring',
    {
      preHandler: [
        authenticateInternal,
      ],
    },
    async (request, reply) => controller.getExpiringOrders(request, reply)
  );

  // Bulk cancel orders (event cancelled)
  fastify.post(
    '/internal/v1/orders/bulk/cancel',
    {
      preHandler: [
        authenticateInternal,
      ],
    },
    async (request, reply) => controller.bulkCancelOrders(request, reply)
  );
}
