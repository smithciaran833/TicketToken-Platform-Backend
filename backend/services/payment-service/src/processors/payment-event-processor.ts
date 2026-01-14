import { Pool } from 'pg';
import Bull from 'bull';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'PaymentEventProcessor' });

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
    // Log event to payment_state_transitions table
    await this.db.query(
      `INSERT INTO payment_state_transitions (payment_id, order_id, from_state, to_state, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.paymentId, event.orderId, null, event.type, JSON.stringify(event), event.timestamp]
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
        log.info({ eventType: event.type }, 'Processing event type');
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
    // Query payment_attempts for retry count
    const attempts = await this.db.query(
      'SELECT attempt_number FROM payment_attempts WHERE order_id = $1 ORDER BY attempt_number DESC LIMIT 1',
      [event.orderId]
    );

    const currentAttempt = attempts.rows[0]?.attempt_number || 0;

    if (currentAttempt < 3) {
      await this.queue.add('payment.retry', {
        paymentId: event.paymentId,
        orderId: event.orderId,
        attemptNumber: currentAttempt + 1
      }, {
        delay: 3600000 // Retry in 1 hour
      });
    }
  }
}
