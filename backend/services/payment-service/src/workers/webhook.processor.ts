import { pool, db } from '../config/database';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import Stripe from 'stripe';
import { config } from '../config';
import { EventOrderingService } from '../services/event-ordering.service';

export class WebhookProcessor extends EventEmitter {
  private stripe: Stripe;
  private processingInterval: NodeJS.Timer | null = null;
  private isProcessing = false;
  private log = logger.child({ component: 'WebhookProcessor' });
  private eventOrderingService: EventOrderingService;

  constructor() {
    super();
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16'
    });
    this.eventOrderingService = new EventOrderingService(pool);
  }

  async start() {
    this.log.info('Starting webhook processor...');
    this.processingInterval = setInterval(() => {
      this.processWebhooks();
    }, 5000);
    this.processWebhooks();
  }

  async stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval as any);
      this.processingInterval = null;
    }
    this.log.info('Webhook processor stopped');
  }

  private async processWebhooks() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const webhooks = await db('webhook_inbox')
        .whereNull('processed_at')
        .orderBy('created_at', 'asc')
        .limit(10);

      for (const webhook of webhooks) {
        await this.processWebhook(webhook);
      }

      if (webhooks.length > 0) {
        this.log.info(`Processed ${webhooks.length} webhooks`);
      }
    } catch (error: any) {
      this.log.error('Error querying webhooks:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processWebhook(webhook: any) {
    const trx = await db.transaction();

    try {
      this.log.info(`Processing ${webhook.event_type} from ${webhook.source}`);

      const payload = webhook.payload;
      const stripeEventId = payload?.id;
      const eventTimestamp = payload?.created ? new Date(payload.created * 1000) : new Date();

      const paymentId = payload?.data?.object?.id || payload?.id;
      const orderId = payload?.data?.object?.metadata?.orderId || payload?.metadata?.orderId;

      if (!paymentId) {
        this.log.warn('No payment ID in webhook, skipping');
        await this.markWebhookProcessed(trx, webhook.id);
        await trx.commit();
        return;
      }

      const event = {
        paymentId,
        orderId,
        eventType: webhook.event_type,
        eventTimestamp,
        stripeEventId,
        payload: payload?.data?.object || payload
      };

      const result = await this.eventOrderingService.processPaymentEvent(event);

      this.log.info({
        webhookId: webhook.id,
        paymentId,
        sequenceNumber: result.sequenceNumber,
        processed: result.processed
      }, 'Event processed');

      await this.markWebhookProcessed(trx, webhook.id);
      await trx.commit();

      if (result.processed) {
        if (webhook.event_type.includes('succeeded')) {
          this.emit('payment.completed', payload);
        } else if (webhook.event_type.includes('failed')) {
          this.emit('payment.failed', payload);
        }
      }

    } catch (error: any) {
      await trx.rollback();
      this.log.error(`Error processing webhook ${webhook.id}:`, error.message);

      await db('webhook_inbox')
        .where('id', webhook.id)
        .update({
          attempts: db.raw('attempts + 1'),
          error: error.message
        });
    }
  }

  private async markWebhookProcessed(trx: any, webhookId: string): Promise<void> {
    await trx('webhook_inbox')
      .where('id', webhookId)
      .update({
        processed_at: new Date()
      });
  }
}

export const webhookProcessor = new WebhookProcessor();
