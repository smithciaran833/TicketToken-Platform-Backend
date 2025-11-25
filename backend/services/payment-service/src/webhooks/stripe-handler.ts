import Stripe from 'stripe';
import { Pool } from 'pg';
import { StateTransitionService } from '../services/state-machine/transitions';
import { PaymentState } from '../services/state-machine/payment-state-machine';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'StripeWebhookHandler' });

export class StripeWebhookHandler {
  private stripe: Stripe;
  private db: Pool;
  private stateService: StateTransitionService;

  constructor(stripe: Stripe, db: Pool) {
    this.stripe = stripe;
    this.db = db;
    this.stateService = new StateTransitionService(db);
  }

  async handleWebhook(payload: string, signature: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err}`);
    }

    // Store in webhook inbox for idempotency
    const existingWebhook = await this.db.query(
      'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
      [event.id]
    );

    if (existingWebhook.rows.length > 0) {
      log.info('Webhook already processed, skipping', { webhookId: event.id });
      return;
    }

    await this.db.query(
      `INSERT INTO webhook_inbox (webhook_id, provider, event_type, payload, processed)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.id, 'stripe', event.type, JSON.stringify(event), false]
    );

    // Process based on event type
    await this.processEvent(event);

    // Mark as processed
    await this.db.query(
      'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE webhook_id = $1',
      [event.id]
    );
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    const eventMap: Record<string, string> = {
      'payment_intent.succeeded': 'complete',
      'payment_intent.payment_failed': 'fail',
      'payment_intent.processing': 'process',
      'payment_intent.canceled': 'cancel',
      'charge.refunded': 'refund'
    };

    const stateEvent = eventMap[event.type];
    if (!stateEvent) {
      log.info('Unhandled event type', { eventType: event.type });
      return;
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    // Get current payment state from database
    const payment = await this.db.query(
      'SELECT id, state, order_id FROM payments WHERE provider_payment_id = $1',
      [paymentIntent.id]
    );

    if (payment.rows.length === 0) {
      log.error('Payment not found for intent', { intentId: paymentIntent.id });
      return;
    }

    const currentState = payment.rows[0].state as PaymentState;
    
    await this.stateService.handlePaymentEvent(stateEvent, currentState, {
      paymentId: payment.rows[0].id,
      orderId: payment.rows[0].order_id,
      provider: 'stripe',
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata
    });
  }
}
