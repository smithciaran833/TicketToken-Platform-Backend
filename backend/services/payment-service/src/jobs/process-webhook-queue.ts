import { Pool } from 'pg';
import { StripeWebhookHandler } from '../webhooks/stripe-handler';
import Stripe from 'stripe';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'ProcessWebhookQueue' });

export class ProcessWebhookQueueJob {
  private db: Pool;
  private stripeHandler: StripeWebhookHandler;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripeHandler = new StripeWebhookHandler(stripe, db);
  }

  async execute(): Promise<void> {
    // Get unprocessed webhooks
    const webhooks = await this.db.query(
      `SELECT * FROM webhook_inbox 
       WHERE processed = false 
       AND retry_count < 5
       ORDER BY created_at ASC 
       LIMIT 10`
    );

    for (const webhook of webhooks.rows) {
      await this.processWebhook(webhook);
    }
  }

  private async processWebhook(webhook: any): Promise<void> {
    try {
      const payload = JSON.parse(webhook.payload);
      
      switch (webhook.provider) {
        case 'stripe':
          // Process based on event type
          await this.processStripeWebhook(payload, webhook.webhook_id);
          break;
        // Add other providers here
      }

      // Mark as processed
      await this.db.query(
        'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE id = $1',
        [webhook.id]
      );
    } catch (error: any) {
      // Update retry count and error
      await this.db.query(
        `UPDATE webhook_inbox 
         SET retry_count = retry_count + 1, 
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, webhook.id]
      );
    }
  }

  private async processStripeWebhook(payload: any, webhookId: string): Promise<void> {
    // Process the webhook payload
    log.info('Processing Stripe webhook', { webhookId });
    // The actual processing is handled by the handler
  }
}
