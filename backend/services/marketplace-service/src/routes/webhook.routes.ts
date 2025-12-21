import { FastifyInstance } from 'fastify';
import { webhookController } from '../controllers/webhook.controller';

export default async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * Official Stripe webhook endpoint
   * Handles payment_intent.succeeded and other Stripe events
   * Webhook signature is verified in the controller
   * Note: Request body must be raw for signature verification
   */
  fastify.post('/stripe', webhookController.handleStripeWebhook.bind(webhookController));

  /**
   * Legacy custom payment completion webhook
   * Protected by internal service header
   */
  fastify.post('/payment-completed', {
    preHandler: async (request, reply) => {
      const internalService = request.headers['x-internal-service'];
      if (internalService !== 'payment-service') {
        reply.status(403).send({ error: 'Forbidden - internal service only' });
        return;
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['paymentIntentId', 'listingId'],
        properties: {
          paymentIntentId: { type: 'string' },
          listingId: { type: 'string' },
          buyerId: { type: 'string' },
          sellerId: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          transferDestination: { type: 'string' }
        }
      }
    }
  }, webhookController.handlePaymentCompleted.bind(webhookController));
}
