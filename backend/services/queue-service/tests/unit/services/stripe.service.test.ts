// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/stripe.config', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      cancel: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    customers: {
      create: jest.fn(),
    },
    paymentMethods: {
      attach: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
  stripeConfig: {
    isTestMode: true,
    apiVersion: '2023-10-16',
    webhookSecret: 'whsec_test_secret',
  },
}));

import { StripeService } from '../../../src/services/stripe.service';
import { stripe, stripeConfig } from '../../../src/config/stripe.config';
import { logger } from '../../../src/utils/logger';

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeService();
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      const result = await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
      });

      expect(result).toEqual({
        success: true,
        paymentIntentId: 'pi_123',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'usd',
        clientSecret: 'pi_123_secret',
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Creating Stripe payment intent',
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Payment intent created successfully',
        expect.any(Object)
      );
    });

    it('should create payment intent with customer ID', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        customerId: 'cus_123',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
        })
      );
    });

    it('should create payment intent with payment method and auto-confirm', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        paymentMethodId: 'pm_123',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method: 'pm_123',
          confirm: true,
        })
      );
    });

    it('should create payment intent with metadata', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        metadata: { orderId: 'order_123', userId: 'user_456' },
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { orderId: 'order_123', userId: 'user_456' },
        })
      );
    });

    it('should create payment intent with description', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        description: 'Ticket purchase',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Ticket purchase',
        })
      );
    });

    it('should create payment intent with receipt email', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        receiptEmail: 'user@example.com',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          receipt_email: 'user@example.com',
        })
      );
    });

    it('should enable automatic payment methods', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'usd',
        client_secret: 'pi_123_secret',
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
      });

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          automatic_payment_methods: { enabled: true },
        })
      );
    });

    it('should handle payment intent creation errors', async () => {
      const mockError = new Error('Insufficient funds');
      (mockError as any).type = 'card_error';
      (mockError as any).code = 'insufficient_funds';

      (stripe.paymentIntents.create as jest.Mock).mockRejectedValue(mockError);

      const result = await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
      });

      expect(result).toEqual({
        success: false,
        paymentIntentId: '',
        status: 'failed',
        amount: 5000,
        currency: 'usd',
        error: 'Insufficient funds',
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create payment intent',
        expect.objectContaining({
          error: 'Insufficient funds',
          type: 'card_error',
          code: 'insufficient_funds',
        })
      );
    });

    it('should handle missing client secret in response', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        client_secret: null,
      };

      (stripe.paymentIntents.create as jest.Mock).mockResolvedValue(mockPaymentIntent);

      const result = await service.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
      });

      expect(result.clientSecret).toBeUndefined();
    });
  });

  describe('getPaymentIntent', () => {
    it('should retrieve payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      };

      (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue(mockPaymentIntent);

      const result = await service.getPaymentIntent('pi_123');

      expect(result).toEqual(mockPaymentIntent);
      expect(logger.info).toHaveBeenCalledWith(
        'Retrieving payment intent',
        { paymentIntentId: 'pi_123' }
      );
    });

    it('should return null on retrieval error', async () => {
      (stripe.paymentIntents.retrieve as jest.Mock).mockRejectedValue(
        new Error('Not found')
      );

      const result = await service.getPaymentIntent('pi_invalid');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to retrieve payment intent',
        expect.any(Object)
      );
    });
  });

  describe('cancelPaymentIntent', () => {
    it('should cancel payment intent successfully', async () => {
      (stripe.paymentIntents.cancel as jest.Mock).mockResolvedValue({
        id: 'pi_123',
        status: 'canceled',
      });

      const result = await service.cancelPaymentIntent('pi_123');

      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'Canceling payment intent',
        { paymentIntentId: 'pi_123' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Payment intent canceled successfully',
        { paymentIntentId: 'pi_123' }
      );
    });

    it('should return false on cancellation error', async () => {
      (stripe.paymentIntents.cancel as jest.Mock).mockRejectedValue(
        new Error('Cannot cancel')
      );

      const result = await service.cancelPaymentIntent('pi_123');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cancel payment intent',
        expect.any(Object)
      );
    });
  });

  describe('createRefund', () => {
    it('should create full refund successfully', async () => {
      const mockRefund = {
        id: 're_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      };

      (stripe.refunds.create as jest.Mock).mockResolvedValue(mockRefund);

      const result = await service.createRefund({
        paymentIntentId: 'pi_123',
      });

      expect(result).toEqual({
        success: true,
        refundId: 're_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent: 'pi_123',
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Creating Stripe refund',
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Refund created successfully',
        expect.any(Object)
      );
    });

    it('should create partial refund', async () => {
      const mockRefund = {
        id: 're_123',
        status: 'succeeded',
        amount: 2500,
        currency: 'usd',
      };

      (stripe.refunds.create as jest.Mock).mockResolvedValue(mockRefund);

      await service.createRefund({
        paymentIntentId: 'pi_123',
        amount: 2500,
      });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2500,
        })
      );
    });

    it('should create refund with reason', async () => {
      const mockRefund = {
        id: 're_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      };

      (stripe.refunds.create as jest.Mock).mockResolvedValue(mockRefund);

      await service.createRefund({
        paymentIntentId: 'pi_123',
        reason: 'requested_by_customer',
      });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'requested_by_customer',
        })
      );
    });

    it('should create refund with metadata', async () => {
      const mockRefund = {
        id: 're_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      };

      (stripe.refunds.create as jest.Mock).mockResolvedValue(mockRefund);

      await service.createRefund({
        paymentIntentId: 'pi_123',
        metadata: { orderId: 'order_123', reason: 'customer_request' },
      });

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { orderId: 'order_123', reason: 'customer_request' },
        })
      );
    });

    it('should handle refund creation errors', async () => {
      const mockError = new Error('Already refunded');
      (mockError as any).type = 'invalid_request_error';
      (mockError as any).code = 'charge_already_refunded';

      (stripe.refunds.create as jest.Mock).mockRejectedValue(mockError);

      const result = await service.createRefund({
        paymentIntentId: 'pi_123',
        amount: 5000,
      });

      expect(result).toEqual({
        success: false,
        refundId: '',
        status: 'failed',
        amount: 5000,
        currency: 'usd',
        error: 'Already refunded',
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create refund',
        expect.any(Object)
      );
    });

    it('should handle missing status in refund response', async () => {
      const mockRefund = {
        id: 're_123',
        status: null,
        amount: 5000,
        currency: 'usd',
      };

      (stripe.refunds.create as jest.Mock).mockResolvedValue(mockRefund);

      const result = await service.createRefund({
        paymentIntentId: 'pi_123',
      });

      expect(result.status).toBe('succeeded');
    });

    it('should handle missing amount in refund response', async () => {
      const mockRefund = {
        id: 're_123',
        status: 'succeeded',
        amount: null,
        currency: 'usd',
      };

      (stripe.refunds.create as jest.Mock).mockResolvedValue(mockRefund);

      const result = await service.createRefund({
        paymentIntentId: 'pi_123',
      });

      expect(result.amount).toBe(0);
    });
  });

  describe('getRefund', () => {
    it('should retrieve refund successfully', async () => {
      const mockRefund = {
        id: 're_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      };

      (stripe.refunds.retrieve as jest.Mock).mockResolvedValue(mockRefund);

      const result = await service.getRefund('re_123');

      expect(result).toEqual(mockRefund);
      expect(logger.info).toHaveBeenCalledWith(
        'Retrieving refund',
        { refundId: 're_123' }
      );
    });

    it('should return null on retrieval error', async () => {
      (stripe.refunds.retrieve as jest.Mock).mockRejectedValue(
        new Error('Not found')
      );

      const result = await service.getRefund('re_invalid');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to retrieve refund',
        expect.any(Object)
      );
    });
  });

  describe('createCustomer', () => {
    it('should create customer successfully', async () => {
      (stripe.customers.create as jest.Mock).mockResolvedValue({
        id: 'cus_123',
        email: 'user@example.com',
      });

      const result = await service.createCustomer('user@example.com');

      expect(result).toBe('cus_123');
      expect(logger.info).toHaveBeenCalledWith(
        'Creating Stripe customer',
        { email: 'user@example.com' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Customer created successfully',
        { customerId: 'cus_123' }
      );
    });

    it('should create customer with metadata', async () => {
      (stripe.customers.create as jest.Mock).mockResolvedValue({
        id: 'cus_123',
        email: 'user@example.com',
      });

      await service.createCustomer('user@example.com', {
        userId: 'user_456',
        source: 'web',
      });

      expect(stripe.customers.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        metadata: { userId: 'user_456', source: 'web' },
      });
    });

    it('should return null on customer creation error', async () => {
      (stripe.customers.create as jest.Mock).mockRejectedValue(
        new Error('Invalid email')
      );

      const result = await service.createCustomer('invalid-email');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to create customer',
        expect.any(Object)
      );
    });
  });

  describe('attachPaymentMethod', () => {
    it('should attach payment method successfully', async () => {
      (stripe.paymentMethods.attach as jest.Mock).mockResolvedValue({
        id: 'pm_123',
        customer: 'cus_123',
      });

      const result = await service.attachPaymentMethod('pm_123', 'cus_123');

      expect(result).toBe(true);
      expect(stripe.paymentMethods.attach).toHaveBeenCalledWith('pm_123', {
        customer: 'cus_123',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Attaching payment method to customer',
        { paymentMethodId: 'pm_123', customerId: 'cus_123' }
      );
      expect(logger.info).toHaveBeenCalledWith('Payment method attached successfully');
    });

    it('should return false on attachment error', async () => {
      (stripe.paymentMethods.attach as jest.Mock).mockRejectedValue(
        new Error('Payment method already attached')
      );

      const result = await service.attachPaymentMethod('pm_123', 'cus_123');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to attach payment method',
        expect.any(Object)
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify webhook signature successfully', () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: {} },
      };

      (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = service.verifyWebhookSignature('payload', 'sig_123');

      expect(result).toEqual(mockEvent);
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'payload',
        'sig_123',
        'whsec_test_secret'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Webhook signature verified',
        { eventType: 'payment_intent.succeeded' }
      );
    });

    it('should handle Buffer payload', () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: {} },
      };

      (stripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const buffer = Buffer.from('payload');
      const result = service.verifyWebhookSignature(buffer, 'sig_123');

      expect(result).toEqual(mockEvent);
    });

    it('should return null on signature verification failure', () => {
      (stripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = service.verifyWebhookSignature('payload', 'invalid_sig');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Webhook signature verification failed',
        expect.any(Object)
      );
    });

    it('should skip verification and parse JSON when webhook secret not configured', () => {
      (stripeConfig as any).webhookSecret = '';

      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const result = service.verifyWebhookSignature(payload, 'sig_123');

      expect(result).toEqual({ type: 'payment_intent.succeeded' });
      expect(logger.warn).toHaveBeenCalledWith(
        'Webhook secret not configured, skipping signature verification'
      );
      expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();

      // Restore for other tests
      (stripeConfig as any).webhookSecret = 'whsec_test_secret';
    });
  });

  describe('getConfig', () => {
    it('should return configuration info', () => {
      const config = service.getConfig();

      expect(config).toEqual({
        isTestMode: true,
        apiVersion: '2023-10-16',
        webhookConfigured: true,
      });
    });

    it('should indicate when webhook not configured', () => {
      (stripeConfig as any).webhookSecret = '';

      const config = service.getConfig();

      expect(config.webhookConfigured).toBe(false);

      // Restore
      (stripeConfig as any).webhookSecret = 'whsec_test_secret';
    });
  });
});
