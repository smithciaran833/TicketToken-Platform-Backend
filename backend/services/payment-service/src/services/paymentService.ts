import { DatabaseService } from './databaseService';
import { QUEUES } from "@tickettoken/shared";
import { QueueService } from './queueService';
import { logger } from '../utils/logger';
import { StripeMock } from './providers/stripeMock';

const log = logger.child({ component: 'PaymentService' });

let stripe: any;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  const Stripe = require('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
  log.info('Using real Stripe API');
} else {
  stripe = new StripeMock();
  log.info('Using mock Stripe (no valid key found)');
}

interface CreateIntentParams {
  orderId: string;
  amount: number;        // INTEGER CENTS
  platformFee: number;   // INTEGER CENTS
  venueId?: string;
  metadata?: any;
}

class PaymentServiceClass {
  async createPaymentIntent(params: CreateIntentParams) {
    const db = DatabaseService.getPool();

    // Stripe expects amount in cents (params already in cents)
    const stripeIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: 'usd',
      application_fee_amount: params.platformFee,
      metadata: {
        orderId: params.orderId,
        venueId: params.venueId || '',
        ...params.metadata
      }
    });

    // Store in database (amounts in cents)
    const result = await db.query(
      `INSERT INTO payment_intents
       (order_id, stripe_intent_id, amount, platform_fee, venue_id, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.orderId,
        stripeIntent.id,
        params.amount,
        params.platformFee,
        params.venueId,
        JSON.stringify(params.metadata || {}),
        stripeIntent.status
      ]
    );

    const intent = result.rows[0];

    await db.query(
      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        intent.id,
        'payment_intent',
        'payments.intent_created',
        JSON.stringify({
          orderId: params.orderId,
          intentId: intent.id,
          stripeIntentId: stripeIntent.id,
          amount: params.amount
        })
      ]
    );

    log.info('Payment intent created', {
      intentId: intent.id,
      stripeId: stripeIntent.id,
      amount: params.amount
    });

    return {
      id: intent.id,
      stripeIntentId: stripeIntent.id,
      clientSecret: stripeIntent.client_secret,
      amount: params.amount,
      platformFee: params.platformFee
    };
  }

  async confirmPayment(stripeIntentId: string) {
    const intent = await stripe.paymentIntents.retrieve(stripeIntentId);

    const db = DatabaseService.getPool();
    const result = await db.query(
      `UPDATE payment_intents
       SET status = $2, updated_at = NOW()
       WHERE stripe_intent_id = $1
       RETURNING *`,
      [stripeIntentId, intent.status]
    );

    if (result.rows.length > 0) {
      const payment = result.rows[0];

      await db.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          payment.id,
          'payment',
          'payment.confirmed',
          JSON.stringify({
            orderId: payment.order_id,
            paymentId: payment.id,
            amount: payment.amount
          })
        ]
      );
    }

    return result.rows[0];
  }
}

export const PaymentService = new PaymentServiceClass();
