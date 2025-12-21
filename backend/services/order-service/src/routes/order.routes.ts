import { FastifyInstance } from 'fastify';
import { OrderController } from '../controllers';
import { idempotencyMiddleware } from '../middleware';
import { validate } from '../middleware/validation.middleware';

// Stub authenticate middleware (not implemented)
const authenticate = async (request: any, reply: any) => {
  // TODO: Implement authentication
};
import {
  createOrderSchema,
  reserveOrderSchema,
  cancelOrderSchema,
  refundOrderSchema,
  getOrdersQuerySchema,
} from '../validators/order.schemas';
import { partialRefundSchema, refundIdSchema } from '../validators/refund.schemas';
import { modificationRequestSchema, upgradeRequestSchema } from '../validators/modification.schemas';

export async function orderRoutes(fastify: FastifyInstance) {
  const controller = new OrderController();

  // Configure idempotency with 30 minute TTL for processing window
  const idempotency = idempotencyMiddleware({
    ttlMs: 30 * 60 * 1000, // 30 minutes
  });

  // Create order (CRITICAL - needs idempotency)
  fastify.post(
    '/',
    {
      preHandler: [
        idempotency, // Idempotency BEFORE auth
        authenticate,
        validate({ body: createOrderSchema }),
      ],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => controller.createOrder(request, reply)
  );

  // Get order by ID (no idempotency needed - read operation)
  fastify.get(
    '/:orderId',
    {
      preHandler: [
        authenticate,
      ],
    },
    async (request, reply) => controller.getOrder(request, reply)
  );

  // List user's orders (no idempotency needed - read operation)
  fastify.get(
    '/',
    {
      preHandler: [
        authenticate,
        validate({ query: getOrdersQuerySchema }),
      ],
    },
    async (request, reply) => controller.listOrders(request, reply)
  );

  // Reserve order (CRITICAL - needs idempotency)
  fastify.post(
    '/:orderId/reserve',
    {
      preHandler: [
        idempotency,
        authenticate,
        validate({ body: reserveOrderSchema }),
      ],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => controller.reserveOrder(request, reply)
  );

  // Cancel order (CRITICAL - needs idempotency)
  fastify.post(
    '/:orderId/cancel',
    {
      preHandler: [
        idempotency,
        authenticate,
        validate({ body: cancelOrderSchema }),
      ],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => controller.cancelOrder(request, reply)
  );

  // Refund order (CRITICAL - needs idempotency)
  fastify.post(
    '/:orderId/refund',
    {
      preHandler: [
        idempotency,
        authenticate,
        validate({ body: refundOrderSchema }),
      ],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => controller.refundOrder(request, reply)
  );

  // Partial refund order (CRITICAL - needs idempotency)
  fastify.post(
    '/:orderId/refund/partial',
    {
      preHandler: [
        idempotency,
        authenticate,
        validate({ body: partialRefundSchema }),
      ],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => controller.partialRefundOrder(request, reply)
  );

  // Get refund history for order
  fastify.get(
    '/:orderId/refunds',
    {
      preHandler: [
        authenticate,
      ],
    },
    async (request, reply) => controller.getRefundHistory(request, reply)
  );

  // Get specific refund details
  fastify.get(
    '/:orderId/refunds/:refundId',
    {
      preHandler: [
        authenticate,
        validate({ params: refundIdSchema }),
      ],
    },
    async (request, reply) => controller.getRefund(request, reply)
  );

  // Get order events (no idempotency needed - read operation)
  fastify.get(
    '/:orderId/events',
    {
      preHandler: [
        authenticate,
      ],
    },
    async (request, reply) => controller.getOrderEvents(request, reply)
  );

  // Request order modification (CRITICAL - needs idempotency)
  fastify.post(
    '/:orderId/modifications',
    {
      preHandler: [
        idempotency,
        authenticate,
        validate({ body: modificationRequestSchema }),
      ],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => controller.requestModification(request, reply)
  );

  // Upgrade order item (CRITICAL - needs idempotency)
  fastify.post(
    '/:orderId/upgrade',
    {
      preHandler: [
        idempotency,
        authenticate,
        validate({ body: upgradeRequestSchema }),
      ],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => controller.upgradeOrderItem(request, reply)
  );

  // Get order modifications
  fastify.get(
    '/:orderId/modifications',
    {
      preHandler: [
        authenticate,
      ],
    },
    async (request, reply) => controller.getOrderModifications(request, reply)
  );

  // Get specific modification
  fastify.get(
    '/:orderId/modifications/:modificationId',
    {
      preHandler: [
        authenticate,
      ],
    },
    async (request, reply) => controller.getModification(request, reply)
  );
}
