import { Pool } from 'pg';
import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { withSystemContextPool } from '../workers/system-job-utils';

const log = logger.child({ component: 'RetryFailedPayments' });

export class RetryFailedPaymentsJob {
  private db: Pool;
  private stripe: Stripe;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripe = stripe;
  }

  async execute(): Promise<void> {
    await withSystemContextPool(this.db, async (client) => {
      const failedPayments = await client.query(
        `SELECT pt.*, COALESCE(pr.retry_count, 0) as retry_count
         FROM payment_transactions pt
         LEFT JOIN (SELECT payment_id, COUNT(*) as retry_count FROM payment_retries GROUP BY payment_id) pr ON pt.id = pr.payment_id
         WHERE pt.status = 'failed' AND COALESCE(pr.retry_count, 0) < 3 AND pt.updated_at < NOW() - INTERVAL '1 hour'
         LIMIT 10`
      );

      for (const payment of failedPayments.rows) {
        await this.retryPayment(client, payment);
      }
    });
  }

  private async retryPayment(client: any, payment: any): Promise<void> {
    try {
      await client.query(
        `INSERT INTO payment_retries (payment_id, attempt_number, status) VALUES ($1, $2, 'pending')`,
        [payment.id, (payment.retry_count || 0) + 1]
      );

      if (payment.stripe_payment_intent_id) {
        const paymentIntent = await this.stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);

        if (paymentIntent.status === 'requires_payment_method') {
          log.info({ paymentId: payment.id }, 'Payment requires new payment method');
          await client.query(
            `UPDATE payment_retries SET status = 'requires_action', error_message = 'Requires new payment method'
             WHERE payment_id = $1 AND attempt_number = $2`,
            [payment.id, (payment.retry_count || 0) + 1]
          );
        } else if (paymentIntent.status === 'requires_confirmation') {
          await this.stripe.paymentIntents.confirm(payment.stripe_payment_intent_id);
          await client.query(
            `UPDATE payment_retries SET status = 'success' WHERE payment_id = $1 AND attempt_number = $2`,
            [payment.id, (payment.retry_count || 0) + 1]
          );
        }
      }
    } catch (error: any) {
      log.error({ paymentId: payment.id, error: error.message }, 'Failed to retry payment');
      await client.query(
        `UPDATE payment_retries SET status = 'failed', error_message = $1 WHERE payment_id = $2 AND attempt_number = $3`,
        [error.message, payment.id, (payment.retry_count || 0) + 1]
      );
    }
  }
}
