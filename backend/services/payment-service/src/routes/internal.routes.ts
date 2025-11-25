import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { internalAuth } from '../middleware/internal-auth';
import { db } from '../config/database';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalRoutes' });

export default async function internalRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/internal/payment-complete',
    {
      preHandler: [internalAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId, paymentId } = request.body as any;

      try {
        // Update payment_transactions table which actually exists
        const result = await db('payment_transactions')
          .where('id', paymentId)
          .update({
            status: 'completed',
            updated_at: new Date()
          })
          .returning('*');

        log.info('Payment completed', { orderId, paymentId });

        return reply.send({
          success: true,
          orderId,
          paymentId,
          transaction: result[0]
        });
      } catch (error) {
        log.error('Payment completion error', { error, orderId, paymentId });
        return reply.status(500).send({ error: 'Failed to complete payment' });
      }
    }
  );
}
