import { DatabaseService } from './databaseService';
import { QUEUES } from "@tickettoken/shared";
import { QueueService } from './queueService';
import { logger } from '../utils/logger';
import Stripe from 'stripe';

const log = logger.child({ component: 'PaymentService' });

// ============================================================================
// STRIPE INITIALIZATION WITH VALIDATION
// ============================================================================

function initializeStripe(): Stripe {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Validate Stripe key exists
  if (!stripeKey) {
    log.error('STRIPE_SECRET_KEY environment variable is required');
    throw new Error('STRIPE_SECRET_KEY must be set. Service cannot start without Stripe configuration.');
  }

  // Validate key format based on environment
  if (nodeEnv === 'production') {
    if (!stripeKey.startsWith('sk_live_')) {
      log.error('Production mode requires sk_live_* Stripe key', { 
        keyPrefix: stripeKey.substring(0, 7),
        environment: nodeEnv 
      });
      throw new Error('Production mode requires a live Stripe key (sk_live_*)');
    }
  } else {
    if (!stripeKey.startsWith('sk_test_')) {
      log.warn('Development/test mode should use sk_test_* Stripe key', { 
        keyPrefix: stripeKey.substring(0, 7),
        environment: nodeEnv 
      });
    }
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
    timeout: 20000, // 20 second timeout
    maxNetworkRetries: 0, // We'll handle retries manually for better control
  });

  log.info('Stripe SDK initialized', { 
    mode: stripeKey.startsWith('sk_live_') ? 'live' : 'test',
    environment: nodeEnv 
  });

  return stripe;
}

const stripe = initializeStripe();

// ============================================================================
// RETRY LOGIC HELPER
// ============================================================================

interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  operation: string;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, delayMs, operation } = options;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on 4xx client errors (invalid requests)
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        log.warn('Client error, not retrying', {
          operation,
          attempt,
          statusCode: error.statusCode,
          message: error.message
        });
        throw error;
      }

      // Retry on 5xx server errors or network errors
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        log.warn('Stripe API call failed, retrying', {
          operation,
          attempt,
          maxAttempts,
          delayMs: delay,
          error: error.message,
          statusCode: error.statusCode
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  log.error('Stripe API call failed after all retries', {
    operation,
    attempts: maxAttempts,
    error: lastError.message
  });
  throw lastError;
}

// ============================================================================
// PAYMENT SERVICE
// ============================================================================

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

    try {
      // Call Stripe with retry logic
      const stripeIntent = await retryWithBackoff(
        () => stripe.paymentIntents.create({
          amount: params.amount,
          currency: 'usd',
          application_fee_amount: params.platformFee,
          metadata: {
            orderId: params.orderId,
            venueId: params.venueId || '',
            ...params.metadata
          }
        }),
        {
          maxAttempts: 3,
          delayMs: 1000, // Start with 1 second
          operation: 'createPaymentIntent'
        }
      );

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
    } catch (error: any) {
      log.error('Failed to create payment intent', {
        error: error.message,
        orderId: params.orderId,
        amount: params.amount
      });
      throw new Error('Payment processing temporarily unavailable. Please try again.');
    }
  }

  async confirmPayment(stripeIntentId: string) {
    try {
      const intent = await retryWithBackoff(
        () => stripe.paymentIntents.retrieve(stripeIntentId),
        {
          maxAttempts: 3,
          delayMs: 1000,
          operation: 'confirmPayment'
        }
      );

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
    } catch (error: any) {
      log.error('Failed to confirm payment', {
        error: error.message,
        stripeIntentId
      });
      throw new Error('Payment confirmation failed. Please contact support.');
    }
  }
}

export const PaymentService = new PaymentServiceClass();
