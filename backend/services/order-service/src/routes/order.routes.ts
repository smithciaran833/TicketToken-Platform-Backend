import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OrderController } from '../controllers';
import { idempotencyMiddleware } from '../middleware';
import { validate } from '../middleware/validation.middleware';
import {
  createOrderSchema,
  reserveOrderSchema,
  cancelOrderSchema,
  refundOrderSchema,
  getOrdersQuerySchema,
} from '../validators/order.schemas';
import { partialRefundSchema, refundIdSchema } from '../validators/refund.schemas';
import { modificationRequestSchema, upgradeRequestSchema } from '../validators/modification.schemas';

/**
 * HIGH: Response schemas to prevent data leakage (RD5)
 * These define the exact shape of API responses
 */
const orderResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    orderNumber: { type: 'string' },
    status: { type: 'string' },
    userId: { type: 'string', format: 'uuid' },
    eventId: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    subtotalCents: { type: 'integer' },
    platformFeeCents: { type: 'integer' },
    processingFeeCents: { type: 'integer' },
    taxCents: { type: 'integer' },
    discountCents: { type: 'integer' },
    totalCents: { type: 'integer' },
    currency: { type: 'string' },
    ticketQuantity: { type: 'integer' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    confirmedAt: { type: 'string', format: 'date-time', nullable: true },
    cancelledAt: { type: 'string', format: 'date-time', nullable: true },
    refundedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          ticketTypeId: { type: 'string', format: 'uuid' },
          quantity: { type: 'integer' },
          unitPriceCents: { type: 'integer' },
          totalPriceCents: { type: 'integer' },
        },
      },
    },
  },
};

const ordersListResponseSchema = {
  type: 'object',
  properties: {
    orders: { type: 'array', items: orderResponseSchema },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    hasMore: { type: 'boolean' },
  },
};

const refundResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    orderId: { type: 'string', format: 'uuid' },
    refundAmountCents: { type: 'integer' },
    refundReason: { type: 'string' },
    refundStatus: { type: 'string' },
    refundType: { type: 'string' },
    stripeRefundId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const refundsListResponseSchema = {
  type: 'object',
  properties: {
    refunds: { type: 'array', items: refundResponseSchema },
    total: { type: 'integer' },
  },
};

const orderEventResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    orderId: { type: 'string', format: 'uuid' },
    eventType: { type: 'string' },
    metadata: { type: 'object' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const orderEventsListResponseSchema = {
  type: 'object',
  properties: {
    events: { type: 'array', items: orderEventResponseSchema },
    total: { type: 'integer' },
  },
};

const modificationResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    orderId: { type: 'string', format: 'uuid' },
    modificationType: { type: 'string' },
    status: { type: 'string' },
    priceDifferenceCents: { type: 'integer' },
    totalAdjustmentCents: { type: 'integer' },
    reason: { type: 'string', nullable: true },
    requestedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const modificationsListResponseSchema = {
  type: 'object',
  properties: {
    modifications: { type: 'array', items: modificationResponseSchema },
    total: { type: 'integer' },
  },
};

const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    statusCode: { type: 'integer' },
    code: { type: 'string' },
  },
};

export async function orderRoutes(fastify: FastifyInstance) {
  const controller = new OrderController();

  // SEC-R1: Use the registered authenticate decorator from JWT plugin
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
  };

  // Configure idempotency with 30 minute TTL for processing window
  const idempotency = idempotencyMiddleware({
    ttlMs: 30 * 60 * 1000, // 30 minutes
  });

  // Create order (CRITICAL - needs idempotency)
  fastify.post(
    '/',
    {
      schema: {
        response: {
          201: orderResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: orderResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: ordersListResponseSchema,
          401: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: orderResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: orderResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: refundResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: refundResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: refundsListResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: refundResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: orderEventsListResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          201: modificationResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: modificationResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: modificationsListResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
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
      schema: {
        response: {
          200: modificationResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      preHandler: [
        authenticate,
      ],
    },
    async (request, reply) => controller.getModification(request, reply)
  );
}
