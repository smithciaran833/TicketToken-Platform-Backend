/**
 * Payment Service Client
 *
 * HMAC-authenticated client for communication with payment-service.
 */

import {
  BaseServiceClient,
  ServiceClientConfig,
  RequestContext,
} from '@tickettoken/shared';

interface PaymentRequest {
  userId: string;
  venueId: string;
  eventId: string;
  amount: number;
  currency?: string;
  paymentMethod: string;
  idempotencyKey: string;
}

interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  status: string;
  amount: number;
  currency: string;
}

export class PaymentServiceClient extends BaseServiceClient {
  constructor(config?: Partial<ServiceClientConfig>) {
    super({
      baseURL: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
      serviceName: 'payment-service',
      timeout: 30000, // 30 seconds for payments
      ...config,
    });
  }

  /**
   * Process a payment
   */
  async processPayment(data: PaymentRequest, ctx: RequestContext): Promise<PaymentResponse> {
    // Include idempotency key in headers
    const extendedCtx = {
      ...ctx,
      additionalHeaders: {
        'X-Idempotency-Key': data.idempotencyKey,
      },
    };

    const response = await this.post<PaymentResponse>(
      '/api/v1/payments/process',
      data,
      extendedCtx
    );
    return response.data;
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string, ctx: RequestContext): Promise<PaymentResponse | null> {
    try {
      const response = await this.get<PaymentResponse>(
        `/api/v1/payments/${paymentId}/status`,
        ctx
      );
      return response.data;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}

// Singleton instance
let paymentServiceClient: PaymentServiceClient | null = null;

export function getPaymentServiceClient(): PaymentServiceClient {
  if (!paymentServiceClient) {
    paymentServiceClient = new PaymentServiceClient();
  }
  return paymentServiceClient;
}

export default PaymentServiceClient;
