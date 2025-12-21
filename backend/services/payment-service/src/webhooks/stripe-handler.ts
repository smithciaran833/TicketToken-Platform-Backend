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
    // Handle Connect account events
    if (event.type === 'account.updated') {
      await this.handleAccountUpdated(event);
      return;
    }

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

    // Handle marketplace payments
    if (event.type === 'payment_intent.succeeded' && paymentIntent.metadata?.listing_id) {
      await this.handleMarketplacePayment(paymentIntent);
    }

    // Get current payment state from database
    const payment = await this.db.query(
      'SELECT id, status, order_id FROM payment_transactions WHERE stripe_payment_intent_id = $1',
      [paymentIntent.id]
    );

    if (payment.rows.length === 0) {
      log.warn('Payment not found for intent (may be marketplace payment)', {
        intentId: paymentIntent.id,
        isMarketplace: !!paymentIntent.metadata?.listing_id
      });
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

  /**
   * Handle Stripe Connect account.updated webhook
   * Updates seller status when they complete onboarding
   */
  private async handleAccountUpdated(event: Stripe.Event): Promise<void> {
    const account = event.data.object as Stripe.Account;

    log.info('Processing Connect account update', {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted
    });

    // Determine status based on account state
    let status = 'pending';
    if (account.charges_enabled && account.payouts_enabled) {
      status = 'enabled';
    } else if (account.requirements?.disabled_reason) {
      status = 'disabled';
    } else if (account.requirements?.eventually_due?.length || account.requirements?.currently_due?.length) {
      status = 'restricted';
    }

    // Update user record in auth database
    try {
      const result = await this.db.query(
        `UPDATE users SET
          stripe_connect_status = $1,
          stripe_connect_charges_enabled = $2,
          stripe_connect_payouts_enabled = $3,
          stripe_connect_details_submitted = $4,
          stripe_connect_capabilities = $5,
          stripe_connect_country = $6,
          stripe_connect_onboarded_at = CASE
            WHEN $2 = true AND $3 = true AND stripe_connect_onboarded_at IS NULL
            THEN NOW()
            ELSE stripe_connect_onboarded_at
          END,
          updated_at = NOW()
        WHERE stripe_connect_account_id = $7`,
        [
          status,
          account.charges_enabled || false,
          account.payouts_enabled || false,
          account.details_submitted || false,
          JSON.stringify(account.capabilities || {}),
          account.country || null,
          account.id
        ]
      );

      if (result.rowCount === 0) {
        log.warn('No user found with this Stripe Connect account ID', {
          accountId: account.id
        });
      } else {
        log.info('Updated seller Connect status', {
          accountId: account.id,
          status
        });
      }
    } catch (error: any) {
      log.error('Failed to update seller Connect status', {
        accountId: account.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle marketplace payment completion
   * Notifies marketplace-service to complete the transfer
   */
  private async handleMarketplacePayment(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payload = {
      paymentIntentId: paymentIntent.id,
      listingId: paymentIntent.metadata?.listing_id,
      buyerId: paymentIntent.metadata?.buyer_id,
      sellerId: paymentIntent.metadata?.seller_id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      transferDestination: paymentIntent.transfer_data?.destination as string | undefined
    };

    log.info('Marketplace payment completed, notifying marketplace-service', payload);

    const marketplaceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:3004';
    
    try {
      const response = await fetch(`${marketplaceUrl}/webhooks/payment-completed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service': 'payment-service'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error('Marketplace-service returned error', {
          status: response.status,
          error: errorText,
          paymentIntentId: paymentIntent.id
        });
        throw new Error(`Marketplace notification failed: ${response.status} ${errorText}`);
      }

      const result = await response.json() as { transferId?: string };
      log.info('Marketplace-service notified successfully', {
        paymentIntentId: paymentIntent.id,
        transferId: result.transferId
      });
    } catch (error: any) {
      log.error('Failed to notify marketplace-service', {
        paymentIntentId: paymentIntent.id,
        error: error.message
      });
      // Don't throw - we don't want to fail the webhook processing
      // The marketplace can reconcile via polling if needed
    }
  }
}
