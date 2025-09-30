import crypto from 'crypto';
import { DatabaseService } from './databaseService';
import { PaymentService } from './paymentService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookProcessor' });

class WebhookProcessorClass {
  async processStripeWebhook(webhookId: string) {
    const db = DatabaseService.getPool();
    
    // Get webhook from inbox
    const result = await db.query(
      `SELECT * FROM webhook_inbox WHERE webhook_id = $1`,
      [webhookId]
    );
    
    if (result.rows.length === 0) {
      log.error('Webhook not found', { webhookId });
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
          log.info('Unhandled webhook type', { type: payload.type });
      }
      
      // Mark as processed
      await db.query(
        `UPDATE webhook_inbox 
         SET processed_at = NOW() 
         WHERE webhook_id = $1`,
        [webhookId]
      );
      
    } catch (error) {
      log.error('Failed to process webhook', { webhookId, error });
      
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
    log.info('Processing payment success', { id: paymentIntent.id });
    await PaymentService.confirmPayment(paymentIntent.id);
  }
  
  private async handlePaymentFailed(paymentIntent: any) {
    log.info('Processing payment failure', { id: paymentIntent.id });
    // Handle failure - trigger refund flow
  }
  
  verifyStripeSignature(payload: string, signature: string): boolean {
    // When you have a real Stripe key, this will use Stripe's verification
    // For now, return true for mock
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return true; // Mock mode
    }
    
    // Real Stripe verification would go here
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
