import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { queueService } from '../services/queueService';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const log = logger.child({ component: 'WebhookController' });

export class WebhookController {
  async handleStripeWebhook(req: Request, res: Response) {
    const signature = req.headers['stripe-signature'] as string;
    const webhookId = req.headers['stripe-webhook-id'] as string || crypto.randomUUID();
    
    try {
      // Store in inbox immediately
      const db = DatabaseService.getPool();
      await db.query(
        `INSERT INTO webhook_inbox (webhook_id, source, event_type, payload, signature)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (webhook_id) DO NOTHING`,
        [webhookId, 'stripe', req.body.type || 'unknown', req.body, signature]
      );
      
      // Return 200 immediately (process async)
      res.status(200).json({ received: true });
      
      // Process async via queue
      await queueService.publish(QUEUES.PAYMENT_WEBHOOK, {
        webhookId,
        source: 'stripe'
      });
      
      log.info('Webhook stored for processing', { webhookId });
      
    } catch (error) {
      log.error('Failed to store webhook', error);
      // Still return 200 to prevent retries
      res.status(200).json({ received: true, error: 'stored_with_error' });
    }
  }
}

export const webhookController = new WebhookController();
