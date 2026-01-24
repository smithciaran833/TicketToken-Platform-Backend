/**
 * Payment Service Client
 *
 * Client for communicating with payment-service internal APIs.
 * Extends BaseServiceClient for circuit breaker, retry, and tracing support.
 *
 * Used by: marketplace-service, order-service
 */

import { BaseServiceClient, RequestContext, ServiceClientError } from '../http-client/base-service-client';
import { BulkRefundResponse } from './types';

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Payment intent status values
 */
export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'succeeded'
  | 'canceled'
  | 'failed';

/**
 * Request to create a payment intent
 */
export interface CreatePaymentIntentRequest {
  /** Amount in smallest currency unit (e.g., cents for USD) */
  amount: number;
  /** Three-letter ISO currency code (lowercase) */
  currency: string;
  /** Order ID this payment is for */
  orderId: string;
  /** Customer's user ID */
  userId: string;
  /** Optional Stripe customer ID */
  stripeCustomerId?: string;
  /** Optional payment method ID to attach */
  paymentMethodId?: string;
  /** Metadata for the payment */
  metadata?: Record<string, string>;
  /** Description shown on statement */
  statementDescriptor?: string;
  /** Whether to capture automatically or manually */
  captureMethod?: 'automatic' | 'manual';
  /** Application fee amount for platform revenue */
  applicationFeeAmount?: number;
  /** Connected account for direct charges */
  stripeAccountId?: string;
}

/**
 * Response from creating a payment intent
 */
export interface CreatePaymentIntentResponse {
  /** Payment intent ID */
  paymentIntentId: string;
  /** Client secret for frontend confirmation */
  clientSecret: string;
  /** Current status */
  status: PaymentIntentStatus;
  /** Amount */
  amount: number;
  /** Currency */
  currency: string;
}

/**
 * Request to confirm a payment intent
 */
export interface ConfirmPaymentIntentRequest {
  /** Payment method ID to use */
  paymentMethodId?: string;
  /** Return URL for redirect-based payments */
  returnUrl?: string;
}

/**
 * Response from confirming a payment intent
 */
export interface ConfirmPaymentIntentResponse {
  /** Payment intent ID */
  paymentIntentId: string;
  /** New status after confirmation */
  status: PaymentIntentStatus;
  /** Whether payment succeeded */
  success: boolean;
  /** Next action required (if any) */
  nextAction?: {
    type: string;
    redirectUrl?: string;
  };
  /** Error message if failed */
  error?: string;
}

/**
 * Response from canceling a payment intent
 */
export interface CancelPaymentIntentResponse {
  /** Payment intent ID */
  paymentIntentId: string;
  /** Status after cancellation */
  status: 'canceled';
  /** Whether cancellation succeeded */
  success: boolean;
}

/**
 * Response from payment status check
 */
export interface PaymentStatusResponse {
  /** Payment intent ID */
  paymentIntentId: string;
  /** Current status */
  status: PaymentIntentStatus;
  /** Amount */
  amount: number;
  /** Currency */
  currency: string;
  /** Associated order ID */
  orderId: string;
  /** Charge ID if captured */
  chargeId?: string;
  /** Receipt URL */
  receiptUrl?: string;
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  capturedAt?: string;
}

/**
 * Request to process a refund
 */
export interface ProcessRefundRequest {
  /** Payment intent ID to refund */
  paymentIntentId: string;
  /** Amount to refund (in smallest currency unit) */
  amount: number;
  /** Reason for refund */
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'event_cancelled';
  /** Order ID associated with payment */
  orderId: string;
  /** User ID requesting refund */
  userId: string;
  /** Additional notes */
  notes?: string;
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Response from processing a refund
 */
export interface ProcessRefundResponse {
  /** Refund ID */
  refundId: string;
  /** Payment intent ID refunded */
  paymentIntentId: string;
  /** Amount refunded */
  amount: number;
  /** Currency */
  currency: string;
  /** Refund status */
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  /** Whether refund succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Royalty information for an order
 */
export interface RoyaltyInfo {
  /** Royalty ID */
  royaltyId: string;
  /** Order ID */
  orderId: string;
  /** Original seller (venue/artist) account */
  sellerAccountId: string;
  /** Royalty amount */
  amount: number;
  /** Currency */
  currency: string;
  /** Royalty percentage */
  percentage: number;
  /** Status */
  status: 'pending' | 'paid' | 'reversed';
  /** When royalty was paid */
  paidAt?: string;
}

/**
 * Response from getting order royalties
 */
export interface GetRoyaltiesResponse {
  /** Order ID */
  orderId: string;
  /** List of royalties */
  royalties: RoyaltyInfo[];
  /** Total royalty amount */
  totalAmount: number;
}

/**
 * Request to reverse royalties
 */
export interface ReverseRoyaltiesRequest {
  /** Order ID to reverse royalties for */
  orderId: string;
  /** Reason for reversal */
  reason: string;
  /** Refund ID triggering the reversal */
  refundId?: string;
}

/**
 * Response from reversing royalties
 */
export interface ReverseRoyaltiesResponse {
  /** Whether reversal succeeded */
  success: boolean;
  /** Number of royalties reversed */
  reversedCount: number;
  /** Total amount reversed */
  totalReversed: number;
  /** Any errors during reversal */
  errors?: Array<{
    royaltyId: string;
    error: string;
  }>;
}

// =============================================================================
// Client Class
// =============================================================================

/**
 * Client for payment-service internal APIs
 *
 * @example
 * ```typescript
 * const client = new PaymentServiceClient();
 *
 * // Create a payment intent
 * const intent = await client.createPaymentIntent({
 *   amount: 5000,
 *   currency: 'usd',
 *   orderId: 'order-123',
 *   userId: 'user-456'
 * }, ctx);
 *
 * // Check payment status
 * const status = await client.getPaymentStatus(intent.paymentIntentId, ctx);
 * ```
 */
export class PaymentServiceClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
      serviceName: 'payment-service',
      timeout: 30000, // Longer timeout for payment operations
    });
  }

  /**
   * Create a new payment intent
   *
   * @param request - Payment intent details
   * @param ctx - Request context with tenant/user IDs
   * @returns Created payment intent with client secret
   */
  async createPaymentIntent(
    request: CreatePaymentIntentRequest,
    ctx: RequestContext
  ): Promise<CreatePaymentIntentResponse> {
    const response = await this.post<CreatePaymentIntentResponse>(
      '/internal/payment-intents',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Confirm a payment intent
   *
   * @param paymentIntentId - The payment intent ID
   * @param request - Confirmation details
   * @param ctx - Request context with tenant/user IDs
   * @returns Confirmation result
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    request: ConfirmPaymentIntentRequest,
    ctx: RequestContext
  ): Promise<ConfirmPaymentIntentResponse> {
    const response = await this.post<ConfirmPaymentIntentResponse>(
      `/internal/payment-intents/${paymentIntentId}/confirm`,
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Cancel a payment intent
   *
   * @param paymentIntentId - The payment intent ID
   * @param ctx - Request context with tenant/user IDs
   * @param reason - Optional cancellation reason
   * @returns Cancellation result
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
    ctx: RequestContext,
    reason?: string
  ): Promise<CancelPaymentIntentResponse> {
    const response = await this.post<CancelPaymentIntentResponse>(
      `/internal/payment-intents/${paymentIntentId}/cancel`,
      ctx,
      { reason }
    );
    return response.data;
  }

  /**
   * Get current status of a payment intent
   *
   * @param paymentIntentId - The payment intent ID
   * @param ctx - Request context with tenant/user IDs
   * @returns Payment status details
   */
  async getPaymentStatus(
    paymentIntentId: string,
    ctx: RequestContext
  ): Promise<PaymentStatusResponse> {
    const response = await this.get<PaymentStatusResponse>(
      `/internal/payment-intents/${paymentIntentId}/status`,
      ctx
    );
    return response.data;
  }

  /**
   * Process a refund for a payment
   *
   * @param request - Refund request details
   * @param ctx - Request context with tenant/user IDs
   * @returns Refund result
   */
  async processRefund(
    request: ProcessRefundRequest,
    ctx: RequestContext
  ): Promise<ProcessRefundResponse> {
    const response = await this.post<ProcessRefundResponse>(
      '/internal/refunds',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Get royalties for an order
   *
   * @param orderId - The order ID
   * @param ctx - Request context with tenant/user IDs
   * @returns Royalty information for the order
   */
  async getRoyalties(
    orderId: string,
    ctx: RequestContext
  ): Promise<GetRoyaltiesResponse> {
    const response = await this.get<GetRoyaltiesResponse>(
      `/internal/royalties/order/${orderId}`,
      ctx
    );
    return response.data;
  }

  /**
   * Reverse royalties for an order (e.g., due to refund)
   *
   * @param request - Reversal request details
   * @param ctx - Request context with tenant/user IDs
   * @returns Reversal result
   */
  async reverseRoyalties(
    request: ReverseRoyaltiesRequest,
    ctx: RequestContext
  ): Promise<ReverseRoyaltiesResponse> {
    const response = await this.post<ReverseRoyaltiesResponse>(
      '/internal/royalties/reverse',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Check if a payment has succeeded (helper method)
   *
   * @param paymentIntentId - The payment intent ID
   * @param ctx - Request context with tenant/user IDs
   * @returns true if payment succeeded
   */
  async isPaymentSuccessful(
    paymentIntentId: string,
    ctx: RequestContext
  ): Promise<boolean> {
    try {
      const status = await this.getPaymentStatus(paymentIntentId, ctx);
      return status.status === 'succeeded';
    } catch (error) {
      if (error instanceof ServiceClientError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  // ==========================================================================
  // PHASE 5d NEW METHODS - Event Cancellation Workflow Support
  // ==========================================================================

  /**
   * Process bulk refunds for event cancellation
   *
   * Creates a batch job to refund all orders for a cancelled event.
   * Refunds are processed asynchronously via a job queue.
   *
   * @param request - Bulk refund request details
   * @param ctx - Request context with tenant/user IDs
   * @returns Batch job tracking info
   */
  async processBulkRefunds(
    request: {
      eventId: string;
      tenantId: string;
      refundPolicy: 'full' | 'partial';
      reason: string;
    },
    ctx: RequestContext
  ): Promise<BulkRefundResponse> {
    const response = await this.post<BulkRefundResponse>(
      '/internal/refunds/batch',
      ctx,
      request
    );
    return response.data;
  }

  /**
   * Process full refunds for event cancellation (helper method)
   *
   * @param eventId - The event ID
   * @param tenantId - The tenant ID
   * @param reason - Reason for refund
   * @param ctx - Request context with tenant/user IDs
   * @returns Batch job tracking info
   */
  async processFullRefundsForEvent(
    eventId: string,
    tenantId: string,
    reason: string,
    ctx: RequestContext
  ): Promise<BulkRefundResponse> {
    return this.processBulkRefunds({
      eventId,
      tenantId,
      refundPolicy: 'full',
      reason,
    }, ctx);
  }
}

/** Singleton instance of PaymentServiceClient */
export const paymentServiceClient = new PaymentServiceClient();
