import { BullJobData } from '../../adapters/bull-job-adapter';
import { BaseWorker } from '../base.worker';
import { JobResult } from '../../types/job.types';
import { IdempotencyService } from '../../services/idempotency.service';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { logger } from '../../utils/logger';

// Stripe client setup
const Stripe = require('stripe');

// Initialize Stripe with API key from environment
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  typescript: true,
}) : null;

interface RefundJobData {
  transactionId: string;
  paymentIntentId?: string;
  chargeId?: string;
  amount: number;
  reason: string;
  userId: string;
  venueId: string;
  tenantId?: string;
  orderId?: string;
  metadata?: Record<string, any>;
}

interface StripeRefundResult {
  refundId: string;
  status: 'succeeded' | 'pending' | 'failed' | 'canceled';
  amount: number;
  currency: string;
  reason: string | null;
  receiptNumber: string | null;
}

export class RefundProcessor extends BaseWorker<RefundJobData, JobResult> {
  protected name = 'refund-processor';
  private idempotencyService: IdempotencyService;
  private rateLimiter: RateLimiterService;

  constructor() {
    super();
    this.idempotencyService = new IdempotencyService();
    this.rateLimiter = RateLimiterService.getInstance();
  }

  protected async execute(job: BullJobData<RefundJobData>): Promise<JobResult> {
    const { transactionId, amount, reason, paymentIntentId, chargeId } = job.data;

    // Generate idempotency key
    const idempotencyKey = this.idempotencyService.generateKey(
      'refund-process',
      job.data
    );

    // Check if already processed
    const existing = await this.idempotencyService.check(idempotencyKey);
    if (existing) {
      logger.warn(`Refund already processed (idempotent): ${idempotencyKey}`);
      return existing;
    }

    logger.info('Processing refund:', {
      transactionId,
      paymentIntentId,
      chargeId,
      amount,
      reason
    });

    try {
      // Acquire rate limit for Stripe
      await this.rateLimiter.acquire('stripe', (job.opts?.priority as number) || 5);

      try {
        // Process refund via Stripe
        const refundResult = await this.processStripeRefund(job.data, idempotencyKey);

        const result: JobResult = {
          success: refundResult.status === 'succeeded' || refundResult.status === 'pending',
          data: {
            refundId: refundResult.refundId,
            transactionId,
            amount: refundResult.amount,
            currency: refundResult.currency,
            status: refundResult.status,
            receiptNumber: refundResult.receiptNumber,
            processedAt: new Date().toISOString()
          }
        };

        // Store result for idempotency (90 days for refunds)
        await this.idempotencyService.store(
          idempotencyKey,
          job.queue?.name || 'money',
          job.name || 'refund-process',
          result,
          90 * 24 * 60 * 60
        );

        logger.info('Refund processed successfully', {
          transactionId,
          refundId: refundResult.refundId,
          status: refundResult.status
        });

        return result;
      } finally {
        this.rateLimiter.release('stripe');
      }
    } catch (error) {
      logger.error('Refund processing failed:', error);

      // Handle specific Stripe errors
      if (error instanceof Error) {
        const stripeError = error as any;
        
        // Rate limit - should retry
        if (stripeError.type === 'StripeRateLimitError') {
          throw new Error('Stripe rate limit exceeded - will retry with backoff');
        }

        // Card errors - typically shouldn't retry
        if (stripeError.type === 'StripeCardError') {
          return {
            success: false,
            error: `Card error: ${stripeError.message}`,
            data: {
              transactionId,
              declineCode: stripeError.decline_code,
              code: stripeError.code
            }
          };
        }

        // Invalid request - shouldn't retry
        if (stripeError.type === 'StripeInvalidRequestError') {
          return {
            success: false,
            error: `Invalid request: ${stripeError.message}`,
            data: { transactionId, code: stripeError.code }
          };
        }
      }

      throw error;
    }
  }

  /**
   * Process refund via Stripe
   */
  private async processStripeRefund(
    data: RefundJobData,
    idempotencyKey: string
  ): Promise<StripeRefundResult> {
    const { transactionId, paymentIntentId, chargeId, amount, reason, metadata, orderId, userId, venueId } = data;

    // Check if Stripe is configured
    if (!stripe) {
      logger.warn('Stripe not configured - using mock mode');
      return this.mockRefund(data);
    }

    // Build refund parameters
    const refundParams: any = {
      amount: Math.round(amount * 100), // Convert to cents
      reason: this.mapRefundReason(reason),
      metadata: {
        ...metadata,
        transactionId,
        orderId: orderId || '',
        userId,
        venueId,
        source: 'tickettoken-queue'
      }
    };

    // Determine what to refund - payment intent or charge
    if (paymentIntentId) {
      refundParams.payment_intent = paymentIntentId;
    } else if (chargeId) {
      refundParams.charge = chargeId;
    } else {
      // Try to find the payment intent from transaction ID
      const paymentIntent = await this.findPaymentIntent(transactionId);
      if (paymentIntent) {
        refundParams.payment_intent = paymentIntent;
      } else {
        throw new Error(`No payment intent or charge found for transaction: ${transactionId}`);
      }
    }

    try {
      // Create refund with idempotency key
      const refund = await stripe.refunds.create(refundParams, {
        idempotencyKey: idempotencyKey
      });

      return {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount / 100, // Convert back to dollars
        currency: refund.currency,
        reason: refund.reason,
        receiptNumber: refund.receipt_number
      };
    } catch (error: any) {
      // Handle charge already refunded
      if (error.code === 'charge_already_refunded') {
        logger.warn('Charge already refunded, treating as success', { transactionId });
        
        // Try to retrieve existing refund
        const existingRefund = await this.findExistingRefund(paymentIntentId || chargeId || '');
        if (existingRefund) {
          return existingRefund;
        }
        
        return {
          refundId: `already_refunded_${transactionId}`,
          status: 'succeeded',
          amount: amount,
          currency: 'usd',
          reason: 'already_refunded',
          receiptNumber: null
        };
      }

      throw error;
    }
  }

  /**
   * Map reason to Stripe refund reason
   */
  private mapRefundReason(reason: string): 'duplicate' | 'fraudulent' | 'requested_by_customer' {
    const lowerReason = reason.toLowerCase();
    
    if (lowerReason.includes('duplicate')) {
      return 'duplicate';
    }
    if (lowerReason.includes('fraud') || lowerReason.includes('suspicious')) {
      return 'fraudulent';
    }
    return 'requested_by_customer';
  }

  /**
   * Find payment intent from transaction ID
   */
  private async findPaymentIntent(transactionId: string): Promise<string | null> {
    if (!stripe) return null;

    try {
      // Search for payment intent by metadata
      const paymentIntents = await stripe.paymentIntents.search({
        query: `metadata['transactionId']:'${transactionId}'`,
        limit: 1
      });

      if (paymentIntents.data.length > 0) {
        return paymentIntents.data[0].id;
      }

      // If transaction ID looks like a payment intent ID
      if (transactionId.startsWith('pi_')) {
        return transactionId;
      }

      return null;
    } catch (error) {
      logger.error('Error finding payment intent:', error);
      return null;
    }
  }

  /**
   * Find existing refund for a payment
   */
  private async findExistingRefund(paymentId: string): Promise<StripeRefundResult | null> {
    if (!stripe || !paymentId) return null;

    try {
      const refunds = await stripe.refunds.list({
        payment_intent: paymentId.startsWith('pi_') ? paymentId : undefined,
        charge: paymentId.startsWith('ch_') ? paymentId : undefined,
        limit: 1
      });

      if (refunds.data.length > 0) {
        const refund = refunds.data[0];
        return {
          refundId: refund.id,
          status: refund.status,
          amount: refund.amount / 100,
          currency: refund.currency,
          reason: refund.reason,
          receiptNumber: refund.receipt_number
        };
      }

      return null;
    } catch (error) {
      logger.error('Error finding existing refund:', error);
      return null;
    }
  }

  /**
   * Mock refund for development/testing
   */
  private async mockRefund(data: RefundJobData): Promise<StripeRefundResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    logger.info('[MOCK] Refund would be processed:', {
      transactionId: data.transactionId,
      amount: data.amount,
      reason: data.reason
    });

    return {
      refundId: `mock_re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'succeeded',
      amount: data.amount,
      currency: 'usd',
      reason: this.mapRefundReason(data.reason),
      receiptNumber: `mock_${Date.now()}`
    };
  }
}
