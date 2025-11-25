import { FastifyInstance } from 'fastify';
import { webhookController } from '../controllers/webhook.controller';
import { authenticate, verifyWebhookSignature } from '../middleware/auth.middleware';

export async function webhookRoutes(fastify: FastifyInstance) {
  // Webhook endpoints use signature verification
  fastify.post('/square', {
    onRequest: verifyWebhookSignature('square')
  }, webhookController.handleSquareWebhook);
  
  fastify.post('/stripe', {
    onRequest: verifyWebhookSignature('stripe')
  }, webhookController.handleStripeWebhook);
  
  fastify.post('/mailchimp', {
    onRequest: verifyWebhookSignature('mailchimp')
  }, webhookController.handleMailchimpWebhook);
  
  fastify.post('/quickbooks', {
    onRequest: verifyWebhookSignature('quickbooks')
  }, webhookController.handleQuickBooksWebhook);

  // These routes need JWT auth
  fastify.get('/:provider/events', {
    onRequest: authenticate
  }, webhookController.getWebhookEvents);
  
  fastify.post('/retry', {
    onRequest: authenticate
  }, webhookController.retryWebhook);
}
