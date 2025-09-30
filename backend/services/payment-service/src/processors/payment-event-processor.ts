import { Pool } from 'pg';
import Bull from 'bull';

export interface PaymentEvent {
  id: string;
  type: 'payment.created' | 'payment.updated' | 'payment.completed' | 'payment.failed';
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  provider: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class PaymentEventProcessor {
  private db: Pool;
  private queue: Bull.Queue;

  constructor(db: Pool, queue: Bull.Queue) {
    this.db = db;
    this.queue = queue;
  }

  async processPaymentEvent(event: PaymentEvent): Promise<void> {
    // Log event
    await this.db.query(
      `INSERT INTO payment_events (event_id, event_type, payment_id, order_id, provider, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, event.type, event.paymentId, event.orderId, event.provider, JSON.stringify(event), event.timestamp]
    );

    // Handle different event types
    switch (event.type) {
      case 'payment.completed':
        await this.handlePaymentCompleted(event);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;
      default:
        console.log(`Processing event type: ${event.type}`);
    }
  }

  private async handlePaymentCompleted(event: PaymentEvent): Promise<void> {
    // Queue order fulfillment
    await this.queue.add('order.fulfill', {
      orderId: event.orderId,
      paymentId: event.paymentId
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });

    // Queue email notification
    await this.queue.add('email.payment_success', {
      orderId: event.orderId,
      amount: event.amount,
      currency: event.currency
    });
  }

  private async handlePaymentFailed(event: PaymentEvent): Promise<void> {
    // Queue retry if applicable
    const payment = await this.db.query(
      'SELECT retry_count FROM payments WHERE id = $1',
      [event.paymentId]
    );

    if (payment.rows[0]?.retry_count < 3) {
      await this.queue.add('payment.retry', {
        paymentId: event.paymentId,
        attemptNumber: payment.rows[0].retry_count + 1
      }, {
        delay: 3600000 // Retry in 1 hour
      });
    }
  }
}
