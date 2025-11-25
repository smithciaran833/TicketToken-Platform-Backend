import { StripeService } from '../../src/services/stripe.service';

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
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
  }));
});

describe('StripeService', () => {
  let stripeService: StripeService;
  let mockStripe: any;

  beforeEach(() => {
    const Stripe = require('stripe');
    mockStripe = new Stripe();
    stripeService = new StripeService();
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent successfully', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
        client_secret: 'secret_123',
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

      const result = await stripeService.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
      });

      expect(result.success).toBe(true);
      expect(result.paymentIntentId).toBe('pi_test_123');
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe('usd');
    });

    it('should handle payment intent creation failure', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(
        new Error('Payment failed')
      );

      const result = await stripeService.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Payment failed');
    });
  });

  describe('createRefund', () => {
    it('should create a refund successfully', async () => {
      const mockRefund = {
        id: 'ref_test_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      };

      mockStripe.refunds.create.mockResolvedValue(mockRefund);

      const result = await stripeService.createRefund({
        paymentIntentId: 'pi_test_123',
        amount: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.refundId).toBe('ref_test_123');
      expect(result.amount).toBe(5000);
    });

    it('should handle refund creation failure', async () => {
      mockStripe.refunds.create.mockRejectedValue(
        new Error('Refund failed')
      );

      const result = await stripeService.createRefund({
        paymentIntentId: 'pi_test_123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Refund failed');
    });
  });

  describe('createCustomer', () => {
    it('should create a customer successfully', async () => {
      const mockCustomer = {
        id: 'cus_test_123',
      };

      mockStripe.customers.create.mockResolvedValue(mockCustomer);

      const result = await stripeService.createCustomer('test@example.com');

      expect(result).toBe('cus_test_123');
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: {},
      });
    });

    it('should return null on customer creation failure', async () => {
      mockStripe.customers.create.mockRejectedValue(
        new Error('Customer creation failed')
      );

      const result = await stripeService.createCustomer('test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify webhook signature successfully', () => {
      const mockEvent = { type: 'payment_intent.succeeded', data: {} };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = stripeService.verifyWebhookSignature(
        'payload',
        'signature'
      );

      expect(result).toEqual(mockEvent);
    });

    it('should return null on signature verification failure', () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = stripeService.verifyWebhookSignature(
        'payload',
        'invalid_signature'
      );

      expect(result).toBeNull();
    });
  });

  describe('getConfig', () => {
    it('should return configuration info', () => {
      const config = stripeService.getConfig();

      expect(config).toHaveProperty('isTestMode');
      expect(config).toHaveProperty('apiVersion');
      expect(config).toHaveProperty('webhookConfigured');
    });
  });
});
