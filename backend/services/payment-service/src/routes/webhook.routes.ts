import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WebhookController } from '../controllers/webhook.controller';

export default async function webhookRoutes(fastify: FastifyInstance) {
  const controller = new WebhookController();

  // Stripe webhooks need raw body
  fastify.post(
    '/stripe',
    {
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.handleStripeWebhook(request, reply);
    }
  );
}
