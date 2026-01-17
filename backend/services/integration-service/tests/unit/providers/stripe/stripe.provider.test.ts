// Mock Stripe BEFORE imports
const mockRetrieve = jest.fn();
const mockProductsRetrieve = jest.fn();
const mockProductsUpdate = jest.fn();
const mockProductsCreate = jest.fn();
const mockPricesCreate = jest.fn();
const mockChargesList = jest.fn();
const mockCustomersCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

const mockStripe = {
  accounts: {
    retrieve: mockRetrieve,
  },
  products: {
    retrieve: mockProductsRetrieve,
    update: mockProductsUpdate,
    create: mockProductsCreate,
  },
  prices: {
    create: mockPricesCreate,
  },
  charges: {
    list: mockChargesList,
  },
  customers: {
    create: mockCustomersCreate,
  },
  webhooks: {
    constructEvent: mockWebhooksConstructEvent,
  },
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../src/config', () => ({
  config: {
    providers: {
      stripe: {
        clientSecret: 'sk_test_secret',
        apiVersion: '2022-11-15',
        webhookSecret: 'whsec_test',
      },
    },
  },
}));

import { StripeProvider } from '../../../../src/providers/stripe/stripe.provider';

describe('StripeProvider', () => {
  let provider: StripeProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new StripeProvider();
  });

  describe('constructor', () => {
    it('should initialize with client secret from config', () => {
      expect(provider.name).toBe('stripe');
    });
  });

  describe('initialize', () => {
    it('should initialize with provided secret key', async () => {
      const credentials = {
        secretKey: 'sk_test_custom',
      };

      await provider.initialize(credentials);
      // Should not throw
    });

    it('should initialize without secret key', async () => {
      await provider.initialize({});
      // Should not throw
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection', async () => {
      mockRetrieve.mockResolvedValue({ id: 'acct_123' });

      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(mockRetrieve).toHaveBeenCalled();
    });

    it('should return false on connection failure', async () => {
      mockRetrieve.mockRejectedValue(new Error('Unauthorized'));

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('syncProducts', () => {
    it('should create new products', async () => {
      const products = [
        {
          id: 'prod-1',
          name: 'Product 1',
          description: 'Description 1',
          price: 19.99,
        },
      ];

      mockProductsRetrieve.mockRejectedValue(new Error('Not found'));
      mockProductsCreate.mockResolvedValue({ id: 'prod-1', name: 'Product 1' });
      mockPricesCreate.mockResolvedValue({ id: 'price-1' });

      const result = await provider.syncProducts(products);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(mockProductsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'prod-1',
          name: 'Product 1',
          description: 'Description 1',
        })
      );
    });

    it('should update existing products', async () => {
      const products = [
        {
          id: 'prod-1',
          name: 'Updated Product',
          description: 'Updated Description',
          price: 29.99,
        },
      ];

      mockProductsRetrieve.mockResolvedValue({ id: 'prod-1' });
      mockProductsUpdate.mockResolvedValue({ id: 'prod-1', name: 'Updated Product' });
      mockPricesCreate.mockResolvedValue({ id: 'price-1' });

      const result = await provider.syncProducts(products);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(1);
      expect(mockProductsUpdate).toHaveBeenCalledWith(
        'prod-1',
        expect.objectContaining({
          name: 'Updated Product',
        })
      );
    });

    it('should convert price to cents', async () => {
      const products = [{ id: 'prod-1', name: 'Product', price: 19.99 }];

      mockProductsRetrieve.mockRejectedValue(new Error('Not found'));
      mockProductsCreate.mockResolvedValue({ id: 'prod-1' });
      mockPricesCreate.mockResolvedValue({ id: 'price-1' });

      await provider.syncProducts(products);

      expect(mockPricesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_amount: 1999,
          currency: 'usd',
        })
      );
    });

    it('should handle sync failures', async () => {
      const products = [{ id: 'prod-1', name: 'Product', price: 10 }];

      mockProductsRetrieve.mockRejectedValue(new Error('Not found'));
      mockProductsCreate.mockRejectedValue(new Error('API error'));

      const result = await provider.syncProducts(products);

      expect(result.success).toBe(false);
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should sync multiple products', async () => {
      const products = [
        { id: 'prod-1', name: 'Product 1', price: 10 },
        { id: 'prod-2', name: 'Product 2', price: 20 },
      ];

      mockProductsRetrieve.mockRejectedValue(new Error('Not found'));
      mockProductsCreate.mockResolvedValue({ id: 'prod' });
      mockPricesCreate.mockResolvedValue({ id: 'price' });

      const result = await provider.syncProducts(products);

      expect(result.syncedCount).toBe(2);
      expect(mockProductsCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchTransactions', () => {
    it('should fetch transactions within date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');
      const charges = [{ id: 'ch_1' }, { id: 'ch_2' }];

      mockChargesList.mockResolvedValue({ data: charges });

      const result = await provider.fetchTransactions(startDate, endDate);

      expect(result).toEqual(charges);
      expect(mockChargesList).toHaveBeenCalledWith(
        expect.objectContaining({
          created: {
            gte: Math.floor(startDate.getTime() / 1000),
            lte: Math.floor(endDate.getTime() / 1000),
          },
          limit: 100,
        })
      );
    });

    it('should return empty array on error', async () => {
      mockChargesList.mockRejectedValue(new Error('API error'));

      const result = await provider.fetchTransactions(new Date(), new Date());

      expect(result).toEqual([]);
    });
  });

  describe('syncCustomers', () => {
    it('should sync customers successfully', async () => {
      const customers = [
        { id: 'cust-1', email: 'test1@example.com', name: 'John Doe' },
        { id: 'cust-2', email: 'test2@example.com', name: 'Jane Smith' },
      ];

      mockCustomersCreate.mockResolvedValue({ id: 'stripe_cust' });

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(mockCustomersCreate).toHaveBeenCalledTimes(2);
    });

    it('should handle customer sync failures', async () => {
      const customers = [{ id: 'cust-1', email: 'test@example.com' }];

      mockCustomersCreate.mockRejectedValue(new Error('Customer exists'));

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(false);
      expect(result.failedCount).toBe(1);
    });

    it('should include metadata in customer creation', async () => {
      const customers = [
        { id: 'cust-123', email: 'test@example.com', name: 'Test User' },
      ];

      mockCustomersCreate.mockResolvedValue({ id: 'stripe_cust' });

      await provider.syncCustomers(customers);

      expect(mockCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            venue_customer_id: 'cust-123',
          },
        })
      );
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate signature correctly', () => {
      mockWebhooksConstructEvent.mockReturnValue({ type: 'payment_intent.succeeded' });

      const result = provider.validateWebhookSignature('payload', 'signature');

      expect(result).toBe(true);
      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        'payload',
        'signature',
        'whsec_test'
      );
    });

    it('should return false on invalid signature', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const result = provider.validateWebhookSignature('payload', 'bad-sig');

      expect(result).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('should handle payment_intent.succeeded events', async () => {
      const event = { type: 'payment_intent.succeeded', data: { object: {} } };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle customer.created events', async () => {
      const event = { type: 'customer.created', data: { object: {} } };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle charge.refunded events', async () => {
      const event = { type: 'charge.refunded', data: { object: {} } };

      await provider.handleWebhook(event);
      // Should not throw
    });
  });
});
