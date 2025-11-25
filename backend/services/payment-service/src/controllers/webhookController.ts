import { QUEUES } from "@tickettoken/shared";
import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { DatabaseService } from '../services/databaseService';
import { queueService } from '../services/queueService';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const log = logger.child({ component: 'WebhookController' });

export class WebhookController {
  async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply) {
    const signature = request.headers['stripe-signature'] as string;
    const webhookId = request.headers['stripe-webhook-id'] as string || crypto.randomUUID();
    
    try {
      // Store in inbox immediately
      const db = DatabaseService.getPool();
      await db.query(
        `INSERT INTO webhook_inbox (webhook_id, source, event_type, payload, signature)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (webhook_id) DO NOTHING`,
        [webhookId, 'stripe', (request.body as any).type || 'unknown', request.body, signature]
      );
      
      // Return 200 immediately (process async)
      reply.code(200).send({ received: true });
      
      // Process async via queue
      await queueService.publish(QUEUES.PAYMENT_WEBHOOK, {
        webhookId,
        source: 'stripe'
      });
      
      log.info('Webhook stored for processing', { webhookId });
      
    } catch (error) {
      log.error('Failed to store webhook', error);
      // Still return 200 to prevent retries
      reply.code(200).send({ received: true, error: 'stored_with_error' });
    }
  }
}

export const webhookController = new WebhookController();
