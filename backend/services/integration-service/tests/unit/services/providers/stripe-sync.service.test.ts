// Mock Stripe BEFORE imports
const mockCustomersCreate = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockCustomersList = jest.fn();
const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsList = jest.fn();
const mockChargesList = jest.fn();
const mockRefundsCreate = jest.fn();
const mockBalanceRetrieve = jest.fn();
const mockBalanceTransactionsList = jest.fn();
const mockWebhookEndpointsList = jest.fn();
const mockWebhookEndpointsCreate = jest.fn();
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockDisputesList = jest.fn();
const mockDisputesUpdate = jest.fn();
const mockDisputesClose = jest.fn();
const mockProductsCreate = jest.fn();
const mockProductsUpdate = jest.fn();
const mockProductsList = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

const mockStripeInstance = {
  customers: {
    create: mockCustomersCreate,
    update: mockCustomersUpdate,
    list: mockCustomersList,
  },
  paymentIntents: {
    create: mockPaymentIntentsCreate,
    list: mockPaymentIntentsList,
  },
  charges: {
    list: mockChargesList,
  },
  refunds: {
    create: mockRefundsCreate,
  },
  balance: {
    retrieve: mockBalanceRetrieve,
  },
  balanceTransactions: {
    list: mockBalanceTransactionsList,
  },
  webhookEndpoints: {
    list: mockWebhookEndpointsList,
    create: mockWebhookEndpointsCreate,
  },
  webhooks: {
    constructEvent: mockWebhooksConstructEvent,
  },
  subscriptions: {
    create: mockSubscriptionsCreate,
    list: mockSubscriptionsList,
    update: mockSubscriptionsUpdate,
    cancel: mockSubscriptionsCancel,
  },
  disputes: {
    list: mockDisputesList,
    update: mockDisputesUpdate,
    close: mockDisputesClose,
  },
  products: {
    create: mockProductsCreate,
    update: mockProductsUpdate,
    list: mockProductsList,
  },
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripeInstance);
});

// Mock credential encryption service
const mockRetrieveApiKeys = jest.fn();

jest.mock('../../../../src/services/credential-encryption.service', () => ({
  credentialEncryptionService: {
    retrieveApiKeys: mockRetrieveApiKeys,
  },
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    providers: {
      stripe: {
        clientSecret: 'test-secret',
      },
    },
  },
}));

import {
  StripeSyncService,
  stripeSyncService,
  StripeCustomer,
  StripePaymentIntent,
} from '../../../../src/services/providers/stripe-sync.service';

describe('StripeSyncService', () => {
  let service: StripeSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeSyncService();
    mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'sk_test_123' });
  });

  describe('verifyConnection', () => {
    it('should return true on successful balance retrieval', async () => {
      mockBalanceRetrieve.mockResolvedValue({ available: [] });

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      mockBalanceRetrieve.mockRejectedValue(new Error('Invalid API key'));

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });

    it('should return false when no credentials found', async () => {
      mockRetrieveApiKeys.mockResolvedValue(null);

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });
  });

  describe('syncCustomersToStripe', () => {
    it('should sync customers successfully', async () => {
      const customers: StripeCustomer[] = [
        { email: 'john@example.com', name: 'John Doe' },
      ];

      mockCustomersCreate.mockResolvedValue({ id: 'cust_123' });

      const result = await service.syncCustomersToStripe('venue-123', customers);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should update existing customer when id provided', async () => {
      const customers: StripeCustomer[] = [
        { id: 'cust_123', email: 'john@example.com' },
      ];

      mockCustomersUpdate.mockResolvedValue({ id: 'cust_123' });

      await service.syncCustomersToStripe('venue-123', customers);

      expect(mockCustomersUpdate).toHaveBeenCalledWith('cust_123', expect.objectContaining({
        email: 'john@example.com',
      }));
    });

    it('should create new customer when no id provided', async () => {
      const customers: StripeCustomer[] = [
        { email: 'jane@example.com', name: 'Jane Doe' },
      ];

      mockCustomersCreate.mockResolvedValue({ id: 'cust_new' });

      await service.syncCustomersToStripe('venue-123', customers);

      expect(mockCustomersCreate).toHaveBeenCalledWith(expect.objectContaining({
        email: 'jane@example.com',
        name: 'Jane Doe',
      }));
    });

    it('should handle individual customer errors', async () => {
      const customers: StripeCustomer[] = [
        { email: 'success@example.com' },
        { email: 'error@example.com' },
      ];

      mockCustomersCreate
        .mockResolvedValueOnce({ id: 'cust_1' })
        .mockRejectedValueOnce(new Error('Invalid email'));

      const result = await service.syncCustomersToStripe('venue-123', customers);

      expect(result.success).toBe(false);
      expect(result.recordsSynced).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Invalid email');
    });

    it('should throw error on initialization failure', async () => {
      mockRetrieveApiKeys.mockResolvedValue(null);

      await expect(
        service.syncCustomersToStripe('venue-123', [])
      ).rejects.toThrow('No Stripe credentials found');
    });
  });

  describe('syncCustomersFromStripe', () => {
    it('should fetch customers from Stripe', async () => {
      mockCustomersList.mockResolvedValue({
        data: [
          { id: 'cust_1', email: 'john@example.com', name: 'John', phone: '555-1234' },
        ],
        has_more: false,
      });

      const customers = await service.syncCustomersFromStripe('venue-123');

      expect(customers).toHaveLength(1);
      expect(customers[0]).toEqual({
        id: 'cust_1',
        email: 'john@example.com',
        name: 'John',
        phone: '555-1234',
        description: undefined,
        metadata: undefined,
      });
    });

    it('should paginate through all customers', async () => {
      mockCustomersList
        .mockResolvedValueOnce({
          data: [{ id: 'cust_1' }, { id: 'cust_2' }],
          has_more: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 'cust_3' }],
          has_more: false,
        });

      const customers = await service.syncCustomersFromStripe('venue-123');

      expect(customers).toHaveLength(3);
      expect(mockCustomersList).toHaveBeenCalledTimes(2);
    });

    it('should throw error on API failure', async () => {
      mockCustomersList.mockRejectedValue(new Error('API error'));

      await expect(
        service.syncCustomersFromStripe('venue-123')
      ).rejects.toThrow('Stripe sync from failed');
    });
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent', async () => {
      const paymentIntent: StripePaymentIntent = {
        amount: 5000,
        currency: 'usd',
        customer: 'cust_123',
        description: 'Ticket purchase',
      };

      mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_123', status: 'requires_payment_method' });

      const result = await service.createPaymentIntent('venue-123', paymentIntent);

      expect(result.id).toBe('pi_123');
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({
        amount: 5000,
        currency: 'usd',
        customer: 'cust_123',
        confirm: false,
      }));
    });

    it('should throw error on failure', async () => {
      mockPaymentIntentsCreate.mockRejectedValue(new Error('Card declined'));

      await expect(
        service.createPaymentIntent('venue-123', { amount: 100, currency: 'usd' })
      ).rejects.toThrow('Stripe payment intent creation failed');
    });
  });

  describe('syncPaymentIntentsFromStripe', () => {
    it('should fetch payment intents', async () => {
      mockPaymentIntentsList.mockResolvedValue({
        data: [{ id: 'pi_1', amount: 5000 }],
        has_more: false,
      });

      const intents = await service.syncPaymentIntentsFromStripe('venue-123');

      expect(intents).toHaveLength(1);
    });

    it('should filter by start date', async () => {
      mockPaymentIntentsList.mockResolvedValue({ data: [], has_more: false });

      await service.syncPaymentIntentsFromStripe('venue-123', 1704067200);

      expect(mockPaymentIntentsList).toHaveBeenCalledWith(expect.objectContaining({
        created: { gte: 1704067200 },
      }));
    });
  });

  describe('syncChargesFromStripe', () => {
    it('should fetch charges', async () => {
      mockChargesList.mockResolvedValue({
        data: [{ id: 'ch_1', amount: 5000 }],
        has_more: false,
      });

      const charges = await service.syncChargesFromStripe('venue-123');

      expect(charges).toHaveLength(1);
    });

    it('should paginate through charges', async () => {
      mockChargesList
        .mockResolvedValueOnce({
          data: [{ id: 'ch_1' }, { id: 'ch_2' }],
          has_more: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 'ch_3' }],
          has_more: false,
        });

      const charges = await service.syncChargesFromStripe('venue-123');

      expect(charges).toHaveLength(3);
    });
  });

  describe('createRefund', () => {
    it('should create full refund', async () => {
      mockRefundsCreate.mockResolvedValue({ id: 're_123', status: 'succeeded' });

      const refund = await service.createRefund('venue-123', 'ch_123');

      expect(refund.id).toBe('re_123');
      expect(mockRefundsCreate).toHaveBeenCalledWith({ charge: 'ch_123' });
    });

    it('should create partial refund', async () => {
      mockRefundsCreate.mockResolvedValue({ id: 're_123', amount: 2500 });

      await service.createRefund('venue-123', 'ch_123', 2500, 'requested_by_customer');

      expect(mockRefundsCreate).toHaveBeenCalledWith({
        charge: 'ch_123',
        amount: 2500,
        reason: 'requested_by_customer',
      });
    });
  });

  describe('getBalance', () => {
    it('should retrieve balance', async () => {
      mockBalanceRetrieve.mockResolvedValue({
        available: [{ amount: 10000, currency: 'usd' }],
      });

      const balance = await service.getBalance('venue-123');

      expect(balance.available[0].amount).toBe(10000);
    });
  });

  describe('getBalanceTransactions', () => {
    it('should fetch balance transactions', async () => {
      mockBalanceTransactionsList.mockResolvedValue({
        data: [{ id: 'txn_1', amount: 5000 }],
        has_more: false,
      });

      const transactions = await service.getBalanceTransactions('venue-123');

      expect(transactions).toHaveLength(1);
    });
  });

  describe('webhook methods', () => {
    it('should construct webhook event', () => {
      const event = { id: 'evt_1', type: 'payment_intent.succeeded' };
      mockWebhooksConstructEvent.mockReturnValue(event);

      const result = service.constructWebhookEvent('payload', 'sig', 'secret');

      expect(result).toEqual(event);
    });

    it('should get webhook endpoints', async () => {
      mockWebhookEndpointsList.mockResolvedValue({
        data: [{ id: 'we_1', url: 'https://example.com/webhook' }],
      });

      const endpoints = await service.getWebhookEndpoints('venue-123');

      expect(endpoints).toHaveLength(1);
    });

    it('should create webhook endpoint', async () => {
      mockWebhookEndpointsCreate.mockResolvedValue({ id: 'we_new' });

      const endpoint = await service.createWebhookEndpoint(
        'venue-123',
        'https://example.com/webhook',
        ['payment_intent.succeeded']
      );

      expect(endpoint.id).toBe('we_new');
    });

    it('should process webhook events', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.processWebhookEvent({ type: 'customer.created', data: { object: {} } });
      await service.processWebhookEvent({ type: 'payment_intent.succeeded', data: { object: {} } });
      await service.processWebhookEvent({ type: 'unknown.event', data: { object: {} } });

      expect(consoleSpy).toHaveBeenCalledWith('Customer event:', {});
      expect(consoleSpy).toHaveBeenCalledWith('Payment intent event:', {});
      expect(consoleSpy).toHaveBeenCalledWith('Unhandled event type:', 'unknown.event');

      consoleSpy.mockRestore();
    });
  });

  describe('subscription methods', () => {
    it('should create subscription', async () => {
      mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_123' });

      const sub = await service.createSubscription('venue-123', 'cust_1', 'price_1');

      expect(sub.id).toBe('sub_123');
    });

    it('should get subscriptions', async () => {
      mockSubscriptionsList.mockResolvedValue({
        data: [{ id: 'sub_1' }],
        has_more: false,
      });

      const subs = await service.getSubscriptions('venue-123');

      expect(subs).toHaveLength(1);
    });

    it('should get subscriptions for specific customer', async () => {
      mockSubscriptionsList.mockResolvedValue({ data: [], has_more: false });

      await service.getSubscriptions('venue-123', 'cust_1');

      expect(mockSubscriptionsList).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cust_1',
      }));
    });

    it('should cancel subscription immediately', async () => {
      mockSubscriptionsCancel.mockResolvedValue({ id: 'sub_1', status: 'canceled' });

      await service.cancelSubscription('venue-123', 'sub_1', false);

      expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_1');
    });

    it('should cancel subscription at period end', async () => {
      mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1', cancel_at_period_end: true });

      await service.cancelSubscription('venue-123', 'sub_1', true);

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    });

    it('should update subscription', async () => {
      mockSubscriptionsUpdate.mockResolvedValue({ id: 'sub_1' });

      await service.updateSubscription('venue-123', 'sub_1', { metadata: { key: 'value' } });

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith('sub_1', { metadata: { key: 'value' } });
    });
  });

  describe('dispute methods', () => {
    it('should get disputes', async () => {
      mockDisputesList.mockResolvedValue({
        data: [{ id: 'dp_1' }],
        has_more: false,
      });

      const disputes = await service.getDisputes('venue-123');

      expect(disputes).toHaveLength(1);
    });

    it('should update dispute with evidence', async () => {
      mockDisputesUpdate.mockResolvedValue({ id: 'dp_1' });

      await service.updateDispute('venue-123', 'dp_1', { customer_name: 'John Doe' });

      expect(mockDisputesUpdate).toHaveBeenCalledWith('dp_1', {
        evidence: { customer_name: 'John Doe' },
      });
    });

    it('should close dispute', async () => {
      mockDisputesClose.mockResolvedValue({ id: 'dp_1', status: 'lost' });

      await service.closeDispute('venue-123', 'dp_1');

      expect(mockDisputesClose).toHaveBeenCalledWith('dp_1');
    });
  });

  describe('product methods', () => {
    it('should sync products to Stripe', async () => {
      mockProductsCreate.mockResolvedValue({ id: 'prod_1' });

      const result = await service.syncProductsToStripe('venue-123', [
        { name: 'VIP Ticket', description: 'VIP access' },
      ]);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
    });

    it('should update existing product', async () => {
      mockProductsUpdate.mockResolvedValue({ id: 'prod_1' });

      await service.syncProductsToStripe('venue-123', [
        { id: 'prod_1', name: 'Updated Product' },
      ]);

      expect(mockProductsUpdate).toHaveBeenCalledWith('prod_1', expect.objectContaining({
        name: 'Updated Product',
      }));
    });

    it('should get products', async () => {
      mockProductsList.mockResolvedValue({
        data: [{ id: 'prod_1', name: 'Ticket' }],
        has_more: false,
      });

      const products = await service.getProducts('venue-123');

      expect(products).toHaveLength(1);
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(stripeSyncService).toBeInstanceOf(StripeSyncService);
    });
  });
});
