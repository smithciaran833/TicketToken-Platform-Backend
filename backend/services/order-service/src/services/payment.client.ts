/**
 * Payment Service Client - order-service
 *
 * PHASE 5c REFACTORED:
 * Extends BaseServiceClient from @tickettoken/shared for standardized
 * HMAC auth, circuit breaker, retry, and tracing.
 *
 * Fallback for read operations (status checks); write operations must fail explicitly.
 */

import {
  BaseServiceClient,
  RequestContext,
  ServiceClientError,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';

// Default fallback for payment status - fail closed (not refundable)
const DEFAULT_PAYMENT_STATUS = {
  status: 'unknown',
  refundable: false, // Fail closed - don't allow refund if we can't verify
  hasDispute: false,
};

/**
 * Payment client for order-service
 *
 * Provides payment intent operations and refund processing.
 */
export class PaymentClient extends BaseServiceClient {
  constructor() {
    super({
      baseURL: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
      serviceName: 'payment-service',
      timeout: 15000, // Longer timeout for payment operations
    });
  }

  /**
   * Create a payment intent
   *
   * No fallback - write operation must fail explicitly
   */
  async createPaymentIntent(
    data: {
      orderId: string;
      amountCents: number;
      currency: string;
      userId: string;
    },
    ctx?: RequestContext
  ): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const context = ctx || { tenantId: 'system' };
    const response = await this.post<{ paymentIntentId: string; clientSecret: string }>(
      '/internal/payment-intents',
      context,
      {
        amount: data.amountCents,
        currency: data.currency,
        orderId: data.orderId,
        userId: data.userId,
      }
    );
    return response.data;
  }

  /**
   * Confirm a payment intent
   *
   * No fallback - write operation must fail explicitly
   */
  async confirmPayment(
    paymentIntentId: string,
    ctx?: RequestContext
  ): Promise<void> {
    const context = ctx || { tenantId: 'system' };
    await this.post<void>(
      `/internal/payment-intents/${paymentIntentId}/confirm`,
      context,
      {}
    );
  }

  /**
   * Cancel a payment intent
   *
   * No fallback - write operation must fail explicitly
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
    ctx?: RequestContext
  ): Promise<void> {
    const context = ctx || { tenantId: 'system' };
    await this.post<void>(
      `/internal/payment-intents/${paymentIntentId}/cancel`,
      context,
      {}
    );
  }

  /**
   * Initiate a refund
   *
   * No fallback - write operation must fail explicitly
   */
  async initiateRefund(
    data: {
      orderId: string;
      paymentIntentId: string;
      amountCents: number;
      reason: string;
      reverseTransfer?: boolean;
      refundApplicationFee?: boolean;
    },
    ctx?: RequestContext
  ): Promise<{ refundId: string }> {
    const context = ctx || { tenantId: 'system' };
    const response = await this.post<{ refundId: string }>(
      '/internal/refunds',
      context,
      {
        paymentIntentId: data.paymentIntentId,
        amount: data.amountCents,
        reason: data.reason as any,
        orderId: data.orderId,
        userId: context.userId || 'system',
        reverse_transfer: data.reverseTransfer ?? true,
        refund_application_fee: data.refundApplicationFee ?? false,
      }
    );
    return response.data;
  }

  /**
   * Get payment status
   *
   * Returns fail-closed default when service is unavailable
   */
  async getPaymentStatus(
    paymentIntentId: string,
    ctx?: RequestContext
  ): Promise<{ status: string; refundable: boolean; hasDispute: boolean }> {
    try {
      const context = ctx || { tenantId: 'system' };
      const response = await this.get<{
        status: string;
        refundable?: boolean;
        hasDispute?: boolean;
      }>(
        `/internal/payment-intents/${paymentIntentId}/status`,
        context
      );

      // Extract refundable/hasDispute from response or infer from status
      const status = response.data.status;
      const refundable = response.data.refundable ?? status === 'succeeded';
      const hasDispute = response.data.hasDispute ?? false;

      return { status, refundable, hasDispute };
    } catch (error) {
      if (error instanceof ServiceClientError) {
        logger.warn('Payment service unavailable - returning fail-closed default status', {
          paymentIntentId,
          statusCode: error.statusCode,
        });
      } else {
        logger.error('Error getting payment status', { error, paymentIntentId });
      }
      return DEFAULT_PAYMENT_STATUS;
    }
  }
}
