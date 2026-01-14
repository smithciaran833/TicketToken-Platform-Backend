import crypto from 'crypto';
import Stripe from 'stripe';
import { DatabaseService } from './databaseService';
import { PaymentProcessorService } from './core/payment-processor.service';
import { config } from '../config';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookProcessor' });

class WebhookProcessorClass {
  private stripe: Stripe;
  private paymentProcessor: PaymentProcessorService;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16'
    });
    const db = DatabaseService.getPool();
    this.paymentProcessor = new PaymentProcessorService(this.stripe, db);
  }

  async processStripeWebhook(webhookId: string) {
    const db = DatabaseService.getPool();

    // Get webhook from inbox
    const result = await db.query(
      `SELECT * FROM webhook_inbox WHERE webhook_id = $1`,
      [webhookId]
    );

    if (result.rows.length === 0) {
      log.error({ webhookId }, 'Webhook not found');
      return;
    }

    const webhook = result.rows[0];
    const payload = webhook.payload;

    try {
      // Process based on event type
      switch (payload.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(payload.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(payload.data.object);
          break;
        default:
          log.info({ type: payload.type }, 'Unhandled webhook type');
      }

      // Mark as processed
      await db.query(
        `UPDATE webhook_inbox
         SET processed_at = NOW()
         WHERE webhook_id = $1`,
        [webhookId]
      );

    } catch (error) {
      log.error({ webhookId, error }, 'Failed to process webhook');

      // Update attempts
      await db.query(
        `UPDATE webhook_inbox
         SET attempts = attempts + 1, error = $2
         WHERE webhook_id = $1`,
        [webhookId, (error as Error).message || String(error)]
      );
    }
  }

  private async handlePaymentSucceeded(paymentIntent: any) {
    log.info({ id: paymentIntent.id }, 'Processing payment success');

    // Extract user ID from payment intent metadata
    const userId = paymentIntent.metadata?.userId || paymentIntent.metadata?.user_id;

    if (!userId) {
      log.warn({
        paymentIntentId: paymentIntent.id,
        metadata: paymentIntent.metadata
      }, 'Payment intent missing userId in metadata');
    }

    await this.paymentProcessor.confirmPayment(paymentIntent.id, userId);
  }

  private async handlePaymentFailed(paymentIntent: any) {
    log.info({ id: paymentIntent.id }, 'Processing payment failure');
    // Handle failure - trigger refund flow
  }

  verifyStripeSignature(payload: string, signature: string): boolean {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return true; // Mock mode
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    try {
      stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
      return true;
    } catch (err) {
      return false;
    }
  }
}

export const WebhookProcessor = new WebhookProcessorClass();
