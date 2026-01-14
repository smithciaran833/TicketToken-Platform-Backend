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

export class PaymentProcessorService {
  private stripe: any;
  private db: any;
  
  constructor(stripe: any, db: any) {
    this.stripe = stripe;
    this.db = db;
  }

  /**
   * Execute Stripe operation with circuit breaker protection
   * MEDIUM FIX: Use circuit breaker for all Stripe API calls
   */
  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      // Use the pre-configured Stripe circuit breaker
      return await stripeCircuitBreaker.execute(async () => {
        const result = await operation();
        return result;
      });
    } catch (error: any) {
      // If it's a circuit breaker error, wrap it appropriately
      if (error.name === 'CircuitBreakerError') {
        log.warn({ operation: operationName }, 'Circuit breaker is open - rejecting Stripe call');
        throw new StripePaymentError({
          type: 'StripeAPIError',
          message: 'Payment service temporarily unavailable. Please try again later.',
        });
      }
      
      // Wrap and rethrow Stripe errors
      throw new StripePaymentError(error);
    }
  }

  async processPayment(data: {
    userId: string;
    orderId: string;
    amountCents: number;
    currency: string;
    idempotencyKey?: string;
    tenantId?: string;
  }): Promise<any> {
    // MEDIUM FIX: Use circuit breaker for Stripe calls
    const paymentIntent: any = await this.executeWithCircuitBreaker(
        () => this.stripe.paymentIntents.create({
          amount: data.amountCents,
          currency: data.currency,
          metadata: {
            orderId: data.orderId,
            userId: data.userId,
            tenantId: data.tenantId || 'default'
          }
        }, {
          idempotencyKey: data.idempotencyKey
      }),
      'paymentIntents.create'
    );

    const [transaction] = await this.db('payment_transactions')
      .insert({
        id: uuidv4(),
        order_id: data.orderId,
        user_id: data.userId,
        amount: data.amountCents,
        currency: data.currency,
        stripe_payment_intent_id: paymentIntent.id,
        status: paymentIntent.status,
        idempotency_key: data.idempotencyKey,
        tenant_id: data.tenantId || 'default',
        created_at: new Date()
      })
      .returning('*');

    log.info({
      userId: data.userId,
      orderId: data.orderId,
      paymentIntentId: paymentIntent.id,
    }, 'Payment processed');
    
    return {
      transactionId: transaction.id,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      clientSecret: paymentIntent.client_secret
    };
  }

  async confirmPayment(paymentIntentId: string, userId: string): Promise<any> {
    // MEDIUM FIX: Use circuit breaker for Stripe calls
    const paymentIntent: any = await this.executeWithCircuitBreaker(
      () => this.stripe.paymentIntents.confirm(paymentIntentId),
      'paymentIntents.confirm'
    );
    
    await this.db('payment_transactions')
      .where({ stripe_payment_intent_id: paymentIntentId })
      .update({
        status: paymentIntent.status,
        confirmed_at: new Date()
      });
    
    log.info({
      paymentIntentId,
      status: paymentIntent.status,
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
