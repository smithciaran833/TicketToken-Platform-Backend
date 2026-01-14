import { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';
import { createSecureServiceClient, executeWithRetry, getServiceUrl } from '../utils/http-client.util';

/**
 * SC1, SC2, OR1-OR4: Secure Payment Service Client
 * Uses HTTPS, authentication headers, and correlation ID propagation
 * HIGH: Includes fallback for read operations (status checks)
 * Note: Write operations (create, confirm, refund) must NOT have fallbacks - they must fail explicitly
 */

const PAYMENT_SERVICE_URL = getServiceUrl('payment-service', 'http://tickettoken-payment:3006');

interface RequestContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
}

// HIGH: Default fallback for payment status - fail closed (not refundable)
const DEFAULT_PAYMENT_STATUS = {
  status: 'unknown',
  refundable: false, // Fail closed - don't allow refund if we can't verify
  hasDispute: false,
};

export class PaymentClient {
  private client: AxiosInstance;
  private createPaymentIntentBreaker;
  private confirmPaymentBreaker;
  private cancelPaymentIntentBreaker;
  private initiateRefundBreaker;
  private getPaymentStatusBreaker;

  constructor() {
    // Create secure client with S2S authentication
    this.client = createSecureServiceClient({
      baseUrl: PAYMENT_SERVICE_URL,
      serviceName: 'payment-service',
      timeout: 10000,
    });

    // Note: No fallback for write operations - they must fail explicitly
    this.createPaymentIntentBreaker = createCircuitBreaker(
      this._createPaymentIntent.bind(this),
      { name: 'payment-service-create-intent', timeout: 5000 }
    );

    this.confirmPaymentBreaker = createCircuitBreaker(
      this._confirmPayment.bind(this),
      { name: 'payment-service-confirm', timeout: 5000 }
    );

    this.cancelPaymentIntentBreaker = createCircuitBreaker(
      this._cancelPaymentIntent.bind(this),
      { name: 'payment-service-cancel', timeout: 3000 }
    );

    this.initiateRefundBreaker = createCircuitBreaker(
      this._initiateRefund.bind(this),
      { name: 'payment-service-refund', timeout: 5000 }
    );

    // HIGH: Fallback for read operation - returns fail-closed default
    this.getPaymentStatusBreaker = createCircuitBreaker(
      this._getPaymentStatus.bind(this),
      {
        name: 'payment-service-get-status',
        timeout: 3000,
        fallback: (paymentIntentId: string) => {
          logger.warn('Payment service unavailable - returning fail-closed default status', { paymentIntentId });
          return DEFAULT_PAYMENT_STATUS;
        },
      }
    );
  }

  private async _createPaymentIntent(
    data: {
      orderId: string;
      amountCents: number;
      currency: string;
      userId: string;
    },
    context?: RequestContext
  ): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const response = await executeWithRetry(
      () => this.client.post('/internal/payment-intents', data, { context } as any),
      3,
      'payment-service'
    );
    return response.data;
  }

  async createPaymentIntent(
    data: {
      orderId: string;
      amountCents: number;
      currency: string;
      userId: string;
    },
    context?: RequestContext
  ): Promise<{ paymentIntentId: string; clientSecret: string }> {
    try {
      return await this.createPaymentIntentBreaker.fire(data, context);
    } catch (error) {
      logger.error('Error creating payment intent', { error, data });
      throw error;
    }
  }

  private async _confirmPayment(paymentIntentId: string, context?: RequestContext): Promise<void> {
    await executeWithRetry(
      () => this.client.post(`/internal/payment-intents/${paymentIntentId}/confirm`, {}, { context } as any),
      3,
      'payment-service'
    );
  }

  async confirmPayment(paymentIntentId: string, context?: RequestContext): Promise<void> {
    try {
      await this.confirmPaymentBreaker.fire(paymentIntentId, context);
    } catch (error) {
      logger.error('Error confirming payment', { error, paymentIntentId });
      throw error;
    }
  }

  private async _cancelPaymentIntent(paymentIntentId: string, context?: RequestContext): Promise<void> {
    await executeWithRetry(
      () => this.client.post(`/internal/payment-intents/${paymentIntentId}/cancel`, {}, { context } as any),
      2,
      'payment-service'
    );
  }

  async cancelPaymentIntent(paymentIntentId: string, context?: RequestContext): Promise<void> {
    try {
      await this.cancelPaymentIntentBreaker.fire(paymentIntentId, context);
    } catch (error) {
      logger.error('Error cancelling payment intent', { error, paymentIntentId });
      throw error;
    }
  }

  private async _initiateRefund(
    data: {
      orderId: string;
      paymentIntentId: string;
      amountCents: number;
      reason: string;
      reverseTransfer?: boolean;
      refundApplicationFee?: boolean;
    },
    context?: RequestContext
  ): Promise<{ refundId: string }> {
    // Critical refund fields for multi-party handling
    const refundData = {
      ...data,
      reverse_transfer: data.reverseTransfer ?? true, // Default: reverse transfer to seller
      refund_application_fee: data.refundApplicationFee ?? false,
    };

    const response = await executeWithRetry(
      () => this.client.post('/internal/refunds', refundData, { context } as any),
      3,
      'payment-service'
    );
    return response.data;
  }

  async initiateRefund(
    data: {
      orderId: string;
      paymentIntentId: string;
      amountCents: number;
      reason: string;
      reverseTransfer?: boolean;
      refundApplicationFee?: boolean;
    },
    context?: RequestContext
  ): Promise<{ refundId: string }> {
    try {
      return await this.initiateRefundBreaker.fire(data, context);
    } catch (error) {
      logger.error('Error initiating refund', { error, data });
      throw error;
    }
  }

  private async _getPaymentStatus(
    paymentIntentId: string,
    context?: RequestContext
  ): Promise<{ status: string; refundable: boolean; hasDispute: boolean }> {
    const response = await executeWithRetry(
      () => this.client.get(`/internal/payment-intents/${paymentIntentId}/status`, { context } as any),
      2,
      'payment-service'
    );
    return response.data;
  }

  /**
   * Check payment status - useful for refund eligibility validation
   * HIGH: Returns fail-closed default when service is unavailable
   */
  async getPaymentStatus(
    paymentIntentId: string,
    context?: RequestContext
  ): Promise<{ status: string; refundable: boolean; hasDispute: boolean }> {
    try {
      return await this.getPaymentStatusBreaker.fire(paymentIntentId, context);
    } catch (error) {
      logger.error('Error getting payment status', { error, paymentIntentId });
      // HIGH: Return fail-closed default
      return DEFAULT_PAYMENT_STATUS;
    }
  }
}
