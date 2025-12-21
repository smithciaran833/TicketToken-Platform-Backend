import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { intentsController } from '../controllers/intentsController';
import { authenticate } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';

export default async function intentsRoutes(fastify: FastifyInstance) {
  const idempotency = idempotencyMiddleware({
    ttlMs: 30 * 60 * 1000 // 30 minutes
  });

  // Create payment intent
  fastify.post(
    '/create',
    {
      preHandler: [authenticate, idempotency]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return intentsController.createIntent(request, reply);
    }
  );
}
