import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { refundController } from '../controllers/refundController';
import { authenticate } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';

export default async function refundRoutes(fastify: FastifyInstance) {
  const idempotency = idempotencyMiddleware({
    ttlMs: 30 * 60 * 1000 // 30 minutes
  });

  // Create refund
  fastify.post(
    '/create',
    {
      preHandler: [authenticate, idempotency],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute'
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return refundController.createRefund(request, reply);
    }
  );
}
