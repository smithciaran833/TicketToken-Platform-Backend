import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { stripeCircuitBreaker, CircuitState } from '../../utils/circuit-breaker';

const log = logger.child({ component: 'PaymentProcessor' });

// =============================================================================
// STRIPE ERROR WRAPPER
// =============================================================================

/**
 * Wrapped Stripe error with classification for proper handling
 */
export class StripePaymentError extends Error {
  readonly code: string;
  readonly type: 'card_error' | 'api_error' | 'network_error' | 'rate_limit' | 'validation';
  readonly retryable: boolean;
  readonly declineCode?: string;
  readonly stripeError?: any;

  constructor(error: any) {
    super(StripePaymentError.getMessage(error));
    this.name = 'StripePaymentError';
    this.stripeError = error;

    // Classify error type and retryability
    if (error.type === 'StripeCardError') {
      this.type = 'card_error';
      this.code = error.code || 'card_declined';
      this.declineCode = error.decline_code;
      this.retryable = false;
    } else if (error.type === 'StripeRateLimitError') {
      this.type = 'rate_limit';
      this.code = 'rate_limit_exceeded';
      this.retryable = true;
    } else if (error.type === 'StripeInvalidRequestError') {
      this.type = 'validation';
      this.code = error.code || 'invalid_request';
      this.retryable = false;
    } else if (error.type === 'StripeAPIError') {
      this.type = 'api_error';
      this.code = 'stripe_api_error';
      this.retryable = true;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      this.type = 'network_error';
      this.code = error.code;
      this.retryable = true;
    } else {
      this.type = 'api_error';
      this.code = 'unknown_error';
      this.retryable = true;
    }
  }

  static getMessage(error: any): string {
    // User-friendly messages for card errors
    if (error.type === 'StripeCardError') {
      switch (error.decline_code) {
        case 'insufficient_funds':
          return 'Your card has insufficient funds. Please use a different payment method.';
        case 'lost_card':
        case 'stolen_card':
          return 'This card cannot be used. Please contact your bank or use a different card.';
        case 'expired_card':
          return 'Your card has expired. Please update your card details.';
        case 'incorrect_cvc':
          return 'The security code (CVV/CVC) is incorrect. Please check and try again.';
        default:
          return 'Your card was declined. Please try a different payment method.';
      }
    }
    return error.message || 'A payment error occurred';
  }
}

// =============================================================================
// PAYMENT PROCESSOR SERVICE
// =============================================================================

export interface ProcessPaymentData {
  userId: string;
  orderId: string;
  venueId: string;
  eventId: string;
  amountCents: number;
  currency: string;
  platformFeeCents?: number;
  venuePayoutCents?: number;
  idempotencyKey?: string;
  tenantId: string;
  type?: 'ticket_purchase' | 'refund' | 'transfer' | 'payout' | 'fee';
  metadata?: Record<string, any>;
}

export class PaymentProcessorService {
  private stripe: any;
  private db: any;

  constructor(stripe: any, db: any) {
    this.stripe = stripe;
    this.db = db;
  }

  /**
   * Execute Stripe operation with circuit breaker protection
   */
  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      return await stripeCircuitBreaker.execute(async () => {
        const result = await operation();
        return result;
      });
    } catch (error: any) {
      if (error.name === 'CircuitBreakerError') {
        log.warn({ operation: operationName }, 'Circuit breaker is open - rejecting Stripe call');
        throw new StripePaymentError({
          type: 'StripeAPIError',
          message: 'Payment service temporarily unavailable. Please try again later.',
        });
      }
      throw new StripePaymentError(error);
    }
  }

  async processPayment(data: ProcessPaymentData): Promise<any> {
    // Calculate fees if not provided
    const platformFeeCents = data.platformFeeCents ?? Math.round(data.amountCents * 0.05); // 5% default
    const venuePayoutCents = data.venuePayoutCents ?? (data.amountCents - platformFeeCents);

    // Create Stripe payment intent with circuit breaker
    const paymentIntent: any = await this.executeWithCircuitBreaker(
      () => this.stripe.paymentIntents.create({
        amount: data.amountCents,
        currency: data.currency,
        metadata: {
          orderId: data.orderId,
          userId: data.userId,
          venueId: data.venueId,
          eventId: data.eventId,
          tenantId: data.tenantId,
          ...data.metadata,
        }
      }, {
        idempotencyKey: data.idempotencyKey
      }),
      'paymentIntents.create'
    );

    // Insert transaction with all required fields
    const [transaction] = await this.db('payment_transactions')
      .insert({
        id: uuidv4(),
        tenant_id: data.tenantId,
        venue_id: data.venueId,
        user_id: data.userId,
        event_id: data.eventId,
        order_id: data.orderId,
        type: data.type || 'ticket_purchase',
        amount: data.amountCents,
        currency: data.currency,
        status: 'pending', // Always start as pending per schema constraint
        platform_fee: platformFeeCents,
        venue_payout: venuePayoutCents,
        stripe_payment_intent_id: paymentIntent.id,
        idempotency_key: data.idempotencyKey || null,
        metadata: data.metadata || {},
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    log.info({
      userId: data.userId,
      orderId: data.orderId,
      venueId: data.venueId,
      eventId: data.eventId,
      paymentIntentId: paymentIntent.id,
      amount: data.amountCents,
    }, 'Payment processed');

    return {
      transactionId: transaction.id,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      clientSecret: paymentIntent.client_secret
    };
  }

  async confirmPayment(paymentIntentId: string, userId: string): Promise<any> {
    const paymentIntent: any = await this.executeWithCircuitBreaker(
      () => this.stripe.paymentIntents.confirm(paymentIntentId),
      'paymentIntents.confirm'
    );

    // Map Stripe status to our valid statuses
    const statusMap: Record<string, string> = {
      'succeeded': 'completed',
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'processing',
      'processing': 'processing',
      'canceled': 'failed',
    };
    const dbStatus = statusMap[paymentIntent.status] || 'pending';

    await this.db('payment_transactions')
      .where({ stripe_payment_intent_id: paymentIntentId })
      .update({
        status: dbStatus,
        updated_at: new Date(),
      });

    log.info({
      paymentIntentId,
      status: paymentIntent.status,
      dbStatus,
    }, 'Payment confirmed');

    return {
      status: paymentIntent.status,
      confirmedAt: new Date()
    };
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): {
    state: string;
    failures: number;
    successes: number;
  } {
    const stats = stripeCircuitBreaker.getStats();
    return {
      state: stats.state,
      failures: stats.failures,
      successes: stats.successes,
    };
  }
}

export default PaymentProcessorService;
