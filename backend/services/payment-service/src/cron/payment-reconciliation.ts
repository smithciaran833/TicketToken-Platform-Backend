import { Pool } from 'pg';
import Stripe from 'stripe';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'PaymentReconciliation' });

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export class PaymentReconciliation {
  private db: Pool;
  private stripe: Stripe;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripe = stripe;
  }

  async run(): Promise<void> {
    log.info('Starting payment reconciliation');

    const stuckPayments = await this.db.query(
      `SELECT * FROM payment_transactions
       WHERE status = $1
       AND updated_at < NOW() - INTERVAL '10 minutes'`,
      ['processing']
    );

    for (const payment of stuckPayments.rows) {
      await this.reconcilePayment(payment);
    }

    await this.checkMissingWebhooks();
  }

  private async reconcilePayment(payment: any): Promise<void> {
    try {
      if (payment.stripe_payment_intent_id) {
        const intent = await this.stripe.paymentIntents.retrieve(
          payment.stripe_payment_intent_id
        );

        const newStatus = this.mapStripeStatus(intent.status);
        if (newStatus !== payment.status) {
          await this.db.query(
            'UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE id = $2',
            [newStatus, payment.id]
          );
          log.info({ paymentId: payment.id, oldStatus: payment.status, newStatus }, 'Reconciled payment');
        }
      }
    } catch (error) {
      log.error({ paymentId: payment.id, error }, 'Failed to reconcile payment');
    }
  }

  private mapStripeStatus(status: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'pending',
      'processing': 'processing',
      'succeeded': 'completed',
      'canceled': 'cancelled',
      'requires_capture': 'processing'
    };
    return statusMap[status] || 'failed';
  }

  private async checkMissingWebhooks(): Promise<void> {
    const events = await this.stripe.events.list({
      created: { gte: Math.floor(Date.now() / 1000) - 3600 },
      limit: 100
    });

    for (const event of events.data) {
      const exists = await this.db.query(
        'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
        [event.id]
      );

      if (exists.rows.length === 0) {
        log.warn({ eventId: event.id, eventType: event.type }, 'Missing webhook event detected');
        await this.db.query(
          `INSERT INTO webhook_inbox (webhook_id, event_id, provider, event_type, payload, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           ON CONFLICT (webhook_id) DO NOTHING`,
          [event.id, event.id, 'stripe', event.type, JSON.stringify(event)]
        );
      }
    }
  }
}
