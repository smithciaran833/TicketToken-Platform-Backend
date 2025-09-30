import { Pool } from 'pg';
import Stripe from 'stripe';
import { PaymentState } from '../services/state-machine/payment-state-machine';

export class PaymentReconciliation {
  private db: Pool;
  private stripe: Stripe;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripe = stripe;
  }

  async run(): Promise<void> {
    console.log('Starting payment reconciliation...');
    
    // Get payments in processing state for more than 10 minutes
    const stuckPayments = await this.db.query(
      `SELECT * FROM payments 
       WHERE state = $1 
       AND updated_at < NOW() - INTERVAL '10 minutes'`,
      [PaymentState.PROCESSING]
    );

    for (const payment of stuckPayments.rows) {
      await this.reconcilePayment(payment);
    }

    // Check for missing webhooks
    await this.checkMissingWebhooks();
  }

  private async reconcilePayment(payment: any): Promise<void> {
    try {
      if (payment.provider === 'stripe') {
        const intent = await this.stripe.paymentIntents.retrieve(
          payment.provider_payment_id
        );

        // Update local state based on Stripe's truth
        const newState = this.mapStripeStatus(intent.status);
        if (newState !== payment.state) {
          await this.db.query(
            'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
            [newState, payment.id]
          );
          console.log(`Reconciled payment ${payment.id}: ${payment.state} -> ${newState}`);
        }
      }
    } catch (error) {
      console.error(`Failed to reconcile payment ${payment.id}:`, error);
    }
  }

  private mapStripeStatus(status: string): PaymentState {
    const statusMap: Record<string, PaymentState> = {
      'requires_payment_method': PaymentState.PENDING,
      'processing': PaymentState.PROCESSING,
      'succeeded': PaymentState.COMPLETED,
      'canceled': PaymentState.CANCELLED
    };
    return statusMap[status] || PaymentState.FAILED;
  }

  private async checkMissingWebhooks(): Promise<void> {
    // Query Stripe for recent events and check if we have them
    const events = await this.stripe.events.list({
      created: { gte: Math.floor(Date.now() / 1000) - 3600 }, // Last hour
      limit: 100
    });

    for (const event of events.data) {
      const exists = await this.db.query(
        'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
        [event.id]
      );

      if (exists.rows.length === 0) {
        console.log(`Missing webhook event: ${event.id}`);
        // Queue it for processing
        await this.db.query(
          `INSERT INTO webhook_inbox (webhook_id, provider, event_type, payload, processed)
           VALUES ($1, $2, $3, $4, false)
           ON CONFLICT (webhook_id) DO NOTHING`,
          [event.id, 'stripe', event.type, JSON.stringify(event)]
        );
      }
    }
  }
}
