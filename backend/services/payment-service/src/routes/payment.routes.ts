import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PaymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { idempotencyMiddleware } from '../middleware/idempotency';

export default async function paymentRoutes(fastify: FastifyInstance) {
  const controller = new PaymentController();

  // Configure idempotency with 30 minute TTL
  const idempotency = idempotencyMiddleware({
    ttlMs: 30 * 60 * 1000  // 30 minutes
  });

  // Process payment
  fastify.post(
    '/process',
    {
      preHandler: [
        authenticate,
        idempotency,
        validateRequest('processPayment')
      ],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.processPayment(request, reply);
    }
  );

  // Calculate fees (idempotent but less critical)
  fastify.post(
    '/calculate-fees',
    {
      preHandler: [
        authenticate,
        idempotency,
        validateRequest('calculateFees')
      ]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.calculateFees(request, reply);
    }
  );

  // Get transaction status (GET - no idempotency needed)
  fastify.get(
    '/transaction/:transactionId',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getTransactionStatus(request, reply);
    }
  );

  // Refund transaction (CRITICAL - needs idempotency)
  fastify.post(
    '/transaction/:transactionId/refund',
    {
      preHandler: [
        authenticate,
        idempotency,
        validateRequest('refundTransaction')
      ],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.refundTransaction(request, reply);
    }
  );
}
