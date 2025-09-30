import { Pool } from 'pg';
import Stripe from 'stripe';
import { PaymentState } from '../services/state-machine/payment-state-machine';

export class RetryFailedPaymentsJob {
  private db: Pool;
  private stripe: Stripe;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripe = stripe;
  }

  async execute(): Promise<void> {
    // Find failed payments eligible for retry
    const failedPayments = await this.db.query(
      `SELECT * FROM payments 
       WHERE state = $1 
       AND retry_count < $2 
       AND updated_at < NOW() - INTERVAL '1 hour'
       LIMIT 10`,
      [PaymentState.FAILED, 3]
    );

    for (const payment of failedPayments.rows) {
      await this.retryPayment(payment);
    }
  }

  private async retryPayment(payment: any): Promise<void> {
    try {
      // Update retry count
      await this.db.query(
        'UPDATE payments SET retry_count = retry_count + 1, updated_at = NOW() WHERE id = $1',
        [payment.id]
      );

      // Retry with provider
      if (payment.provider === 'stripe') {
        const paymentIntent = await this.stripe.paymentIntents.retrieve(
          payment.provider_payment_id
        );
        
        if (paymentIntent.status === 'requires_payment_method') {
          // Payment method failed, need customer action
          console.log(`Payment ${payment.id} requires new payment method`);
        } else {
          // Attempt to confirm again
          await this.stripe.paymentIntents.confirm(payment.provider_payment_id);
        }
      }
      // Add other providers here when you implement them
    } catch (error) {
      console.error(`Failed to retry payment ${payment.id}:`, error);
    }
  }
}
