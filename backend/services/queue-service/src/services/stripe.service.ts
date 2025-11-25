import Stripe from 'stripe';
import { stripe, stripeConfig } from '../config/stripe.config';
import { logger } from '../utils/logger';

/**
 * Stripe Service
 * Handles all Stripe payment operations with error handling and logging
 */

export interface PaymentIntentData {
  amount: number; // Amount in cents
  currency: string;
  customerId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
  description?: string;
  receiptEmail?: string;
}

export interface RefundData {
  paymentIntentId: string;
  amount?: number; // Amount in cents, undefined for full refund
  reason?: Stripe.RefundCreateParams.Reason;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId: string;
  status: string;
  amount: number;
  currency: string;
  clientSecret?: string;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  status: string;
  amount: number;
  currency: string;
  error?: string;
}

export class StripeService {
  /**
   * Create a payment intent
   */
  async createPaymentIntent(data: PaymentIntentData): Promise<PaymentResult> {
    try {
      logger.info('Creating Stripe payment intent', {
        amount: data.amount,
        currency: data.currency,
        customerId: data.customerId,
      });

      const params: Stripe.PaymentIntentCreateParams = {
        amount: data.amount,
        currency: data.currency,
        automatic_payment_methods: { enabled: true },
        metadata: data.metadata || {},
      };

      if (data.description) {
        params.description = data.description;
      }

      if (data.receiptEmail) {
        params.receipt_email = data.receiptEmail;
      }

      if (data.customerId) {
        params.customer = data.customerId;
      }

      if (data.paymentMethodId) {
        params.payment_method = data.paymentMethodId;
        params.confirm = true;
      }

      const paymentIntent = await stripe.paymentIntents.create(params);

      logger.info('Payment intent created successfully', {
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        clientSecret: paymentIntent.client_secret || undefined,
      };
    } catch (error: any) {
      logger.error('Failed to create payment intent', {
        error: error.message,
        type: error.type,
        code: error.code,
      });

      return {
        success: false,
        paymentIntentId: '',
        status: 'failed',
        amount: data.amount,
        currency: data.currency,
        error: error.message,
      };
    }
  }

  /**
   * Retrieve a payment intent
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    try {
      logger.info('Retrieving payment intent', { paymentIntentId });
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error: any) {
      logger.error('Failed to retrieve payment intent', {
        paymentIntentId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Cancel a payment intent
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<boolean> {
    try {
      logger.info('Canceling payment intent', { paymentIntentId });
      await stripe.paymentIntents.cancel(paymentIntentId);
      logger.info('Payment intent canceled successfully', { paymentIntentId });
      return true;
    } catch (error: any) {
      logger.error('Failed to cancel payment intent', {
        paymentIntentId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Create a refund
   */
  async createRefund(data: RefundData): Promise<RefundResult> {
    try {
      logger.info('Creating Stripe refund', {
        paymentIntentId: data.paymentIntentId,
        amount: data.amount,
        reason: data.reason,
      });

      const params: Stripe.RefundCreateParams = {
        payment_intent: data.paymentIntentId,
        metadata: data.metadata || {},
      };

      if (data.amount) {
        params.amount = data.amount;
      }

      if (data.reason) {
        params.reason = data.reason;
      }

      const refund = await stripe.refunds.create(params);

      logger.info('Refund created successfully', {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
      });

      return {
        success: true,
        refundId: refund.id,
        status: refund.status || 'succeeded',
        amount: refund.amount || 0,
        currency: refund.currency || 'usd',
      };
    } catch (error: any) {
      logger.error('Failed to create refund', {
        paymentIntentId: data.paymentIntentId,
        error: error.message,
        type: error.type,
        code: error.code,
      });

      return {
        success: false,
        refundId: '',
        status: 'failed',
        amount: data.amount || 0,
        currency: 'usd',
        error: error.message,
      };
    }
  }

  /**
   * Retrieve a refund
   */
  async getRefund(refundId: string): Promise<Stripe.Refund | null> {
    try {
      logger.info('Retrieving refund', { refundId });
      const refund = await stripe.refunds.retrieve(refundId);
      return refund;
    } catch (error: any) {
      logger.error('Failed to retrieve refund', {
        refundId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(email: string, metadata?: Record<string, string>): Promise<string | null> {
    try {
      logger.info('Creating Stripe customer', { email });
      
      const customer = await stripe.customers.create({
        email,
        metadata: metadata || {},
      });

      logger.info('Customer created successfully', { customerId: customer.id });
      return customer.id;
    } catch (error: any) {
      logger.error('Failed to create customer', {
        email,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Attach payment method to customer
   */
  async attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<boolean> {
    try {
      logger.info('Attaching payment method to customer', {
        paymentMethodId,
        customerId,
      });

      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      logger.info('Payment method attached successfully');
      return true;
    } catch (error: any) {
      logger.error('Failed to attach payment method', {
        paymentMethodId,
        customerId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event | null {
    try {
      if (!stripeConfig.webhookSecret) {
        logger.warn('Webhook secret not configured, skipping signature verification');
        return JSON.parse(payload.toString());
      }

      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        stripeConfig.webhookSecret
      );

      logger.info('Webhook signature verified', { eventType: event.type });
      return event;
    } catch (error: any) {
      logger.error('Webhook signature verification failed', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get configuration info (for debugging)
   */
  getConfig() {
    return {
      isTestMode: stripeConfig.isTestMode,
      apiVersion: stripeConfig.apiVersion,
      webhookConfigured: !!stripeConfig.webhookSecret,
    };
  }
}

// Export singleton instance
export const stripeService = new StripeService();
