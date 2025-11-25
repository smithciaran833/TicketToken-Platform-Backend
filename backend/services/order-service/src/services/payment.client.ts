import axios from 'axios';
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://tickettoken-payment:3006';

export class PaymentClient {
  private createPaymentIntentBreaker;
  private confirmPaymentBreaker;
  private cancelPaymentIntentBreaker;
  private initiateRefundBreaker;

  constructor() {
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
  }

  private async _createPaymentIntent(data: {
    orderId: string;
    amountCents: number;
    currency: string;
    userId: string;
  }): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const response = await axios.post(`${PAYMENT_SERVICE_URL}/internal/payment-intents`, data);
    return response.data;
  }

  async createPaymentIntent(data: {
    orderId: string;
    amountCents: number;
    currency: string;
    userId: string;
  }): Promise<{ paymentIntentId: string; clientSecret: string }> {
    try {
      return await this.createPaymentIntentBreaker.fire(data);
    } catch (error) {
      logger.error('Error creating payment intent', { error, data });
      throw error;
    }
  }

  private async _confirmPayment(paymentIntentId: string): Promise<void> {
    await axios.post(`${PAYMENT_SERVICE_URL}/internal/payment-intents/${paymentIntentId}/confirm`);
  }

  async confirmPayment(paymentIntentId: string): Promise<void> {
    try {
      await this.confirmPaymentBreaker.fire(paymentIntentId);
    } catch (error) {
      logger.error('Error confirming payment', { error, paymentIntentId });
      throw error;
    }
  }

  private async _cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    await axios.post(`${PAYMENT_SERVICE_URL}/internal/payment-intents/${paymentIntentId}/cancel`);
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    try {
      await this.cancelPaymentIntentBreaker.fire(paymentIntentId);
    } catch (error) {
      logger.error('Error cancelling payment intent', { error, paymentIntentId });
      throw error;
    }
  }

  private async _initiateRefund(data: {
    orderId: string;
    paymentIntentId: string;
    amountCents: number;
    reason: string;
  }): Promise<{ refundId: string }> {
    const response = await axios.post(`${PAYMENT_SERVICE_URL}/internal/refunds`, data);
    return response.data;
  }

  async initiateRefund(data: {
    orderId: string;
    paymentIntentId: string;
    amountCents: number;
    reason: string;
  }): Promise<{ refundId: string }> {
    try {
      return await this.initiateRefundBreaker.fire(data);
    } catch (error) {
      logger.error('Error initiating refund', { error, data });
      throw error;
    }
  }
}
