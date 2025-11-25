import { FastifyInstance } from 'fastify';
import { webhookAuth } from '../middleware/auth.middleware';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webhook-secret-change-in-production';

export async function webhookRoutes(fastify: FastifyInstance) {
  // Webhooks need signature verification, not JWT auth
  fastify.post('/webhooks/compliance/tax-update', {
    onRequest: webhookAuth(WEBHOOK_SECRET)
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      console.log('Tax update webhook received', { tenantId, body: request.body });
      return reply.send({ received: true });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/webhooks/compliance/kyc-update', {
    onRequest: webhookAuth(WEBHOOK_SECRET)
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      console.log('KYC update webhook received', { tenantId, body: request.body });
      return reply.send({ received: true });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/webhooks/compliance/risk-alert', {
    onRequest: webhookAuth(WEBHOOK_SECRET)
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      console.log('Risk alert webhook received', { tenantId, body: request.body });
      return reply.send({ received: true });
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
