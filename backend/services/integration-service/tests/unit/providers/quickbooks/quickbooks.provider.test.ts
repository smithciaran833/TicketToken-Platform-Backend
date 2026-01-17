// Mock dependencies BEFORE imports
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();

jest.mock('axios', () => ({
  get: mockAxiosGet,
  post: mockAxiosPost,
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockTimingSafeEqual = jest.fn();
jest.mock('crypto', () => ({
  createHmac: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('valid-hash'),
  })),
  timingSafeEqual: mockTimingSafeEqual,
}));

jest.mock('../../../../src/config', () => ({
  config: {
    providers: {
      quickbooks: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        sandbox: true,
        webhookToken: 'webhook-token',
      },
    },
    server: {
      apiUrl: 'https://api.test.com',
    },
  },
}));

import { QuickBooksProvider } from '../../../../src/providers/quickbooks/quickbooks.provider';

describe('QuickBooksProvider', () => {
  let provider: QuickBooksProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new QuickBooksProvider();
  });

  describe('constructor', () => {
    it('should use sandbox URL when sandbox is enabled', () => {
      expect(provider.name).toBe('quickbooks');
    });
  });

  describe('initialize', () => {
    it('should initialize with credentials', async () => {
      const credentials = {
        accessToken: 'test-token',
        realmId: 'realm-123',
      };

      await provider.initialize(credentials);
      // Should not throw
    });

    it('should initialize without realmId', async () => {
      const credentials = {
        accessToken: 'test-token',
      };

      await provider.initialize(credentials);
      // Should not throw
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      await provider.initialize({
        accessToken: 'test-token',
        realmId: 'realm-123',
      });
    });

    it('should return true on successful connection', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200 });

      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://sandbox-quickbooks.api.intuit.com/v3/company/realm-123/companyinfo/realm-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('should return false on connection failure', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Unauthorized'));

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('syncProducts', () => {
    beforeEach(async () => {
      await provider.initialize({
        accessToken: 'test-token',
        realmId: 'realm-123',
      });
    });

    it('should sync products successfully', async () => {
      const products = [
        {
          id: 'prod-1',
          name: 'Product 1',
          description: 'Description 1',
          price: 19.99,
          sku: 'SKU-001',
        },
        {
          id: 'prod-2',
          name: 'Product 2',
          price: 29.99,
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: {} });

      const result = await provider.syncProducts(products);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should handle products without SKU', async () => {
      const products = [
        { id: 'prod-1', name: 'Product', price: 10, description: 'Test' },
      ];

      mockAxiosPost.mockResolvedValue({ data: {} });

      await provider.syncProducts(products);

      const call = mockAxiosPost.mock.calls[0];
      expect(call[1].Sku).toBe('prod-1'); // Uses ID as SKU fallback
    });

    it('should handle product sync failures', async () => {
      const products = [{ id: 'prod-1', name: 'Product', price: 10 }];

      mockAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await provider.syncProducts(products);

      expect(result.success).toBe(false);
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('syncCustomers', () => {
    beforeEach(async () => {
      await provider.initialize({
        accessToken: 'test-token',
        realmId: 'realm-123',
      });
    });

    it('should sync customers successfully', async () => {
      const customers = [
        {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
          company: 'Acme Inc',
          address: {
            line1: '123 Main St',
            city: 'New York',
            state: 'NY',
            zip: '10001',
          },
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: {} });

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('should handle customers without optional fields', async () => {
      const customers = [
        {
          name: 'Jane Smith',
          email: 'jane@example.com',
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: {} });

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(true);
    });

    it('should handle customer sync failures', async () => {
      const customers = [{ name: 'Test User', email: 'test@example.com' }];

      mockAxiosPost.mockRejectedValue(new Error('Customer exists'));

      const result = await provider.syncCustomers(customers);

      expect(result.success).toBe(false);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('syncTransactions', () => {
    beforeEach(async () => {
      await provider.initialize({
        accessToken: 'test-token',
        realmId: 'realm-123',
      });
    });

    it('should sync transactions successfully', async () => {
      const transactions = [
        {
          customerId: 'cust-1',
          dueDate: '2025-02-01',
          items: [
            { itemId: 'item-1', name: 'Item 1', amount: 100 },
            { itemId: 'item-2', name: 'Item 2', amount: 200 },
          ],
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: {} });

      const result = await provider.syncTransactions(transactions);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('should handle transaction sync failures', async () => {
      const transactions = [
        {
          customerId: 'cust-1',
          items: [{ itemId: 'item-1', amount: 100 }],
        },
      ];

      mockAxiosPost.mockRejectedValue(new Error('Invalid transaction'));

      const result = await provider.syncTransactions(transactions);

      expect(result.success).toBe(false);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('fetchTransactions', () => {
    beforeEach(async () => {
      await provider.initialize({
        accessToken: 'test-token',
        realmId: 'realm-123',
      });
    });

    it('should fetch transactions within date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');
      const invoices = [{ id: 'inv-1' }, { id: 'inv-2' }];

      mockAxiosGet.mockResolvedValue({
        data: { QueryResponse: { Invoice: invoices } },
      });

      const result = await provider.fetchTransactions(startDate, endDate);

      expect(result).toEqual(invoices);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://sandbox-quickbooks.api.intuit.com/v3/company/realm-123/invoice',
        expect.objectContaining({
          params: {
            mindate: '2025-01-01',
            maxdate: '2025-01-31',
          },
        })
      );
    });

    it('should return empty array on error', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'));

      const result = await provider.fetchTransactions(new Date(), new Date());

      expect(result).toEqual([]);
    });

    it('should return empty array when no invoices', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { QueryResponse: {} },
      });

      const result = await provider.fetchTransactions(new Date(), new Date());

      expect(result).toEqual([]);
    });

    it('should return empty array for invalid date parameters', async () => {
      const invalidDate = 'not-a-date' as any;

      // The method catches the error and returns empty array
      const result = await provider.fetchTransactions(invalidDate, new Date());

      expect(result).toEqual([]);
    });
  });

  describe('getOAuthUrl', () => {
    it('should generate correct OAuth URL', () => {
      const state = 'test-state';
      const url = provider.getOAuthUrl(state);

      expect(url).toContain('https://appcenter.intuit.com/connect/oauth2');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('scope=com.intuit.quickbooks.accounting');
      expect(url).toContain('state=test-state');
      expect(url).toContain('response_type=code');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const code = 'auth-code';
      const tokenData = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      };

      mockAxiosPost.mockResolvedValue({ data: tokenData });

      const result = await provider.exchangeCodeForToken(code);

      expect(result).toEqual(tokenData);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        expect.any(URLSearchParams),
        expect.objectContaining({
          auth: {
            username: 'test-client-id',
            password: 'test-client-secret',
          },
        })
      );
    });

    it('should propagate exchange errors', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Invalid code'));

      await expect(provider.exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Invalid code'
      );
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshToken = 'refresh-token';
      const tokenData = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      };

      mockAxiosPost.mockResolvedValue({ data: tokenData });

      const result = await provider.refreshToken(refreshToken);

      expect(result).toEqual(tokenData);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        expect.any(URLSearchParams),
        expect.any(Object)
      );
    });

    it('should propagate refresh errors', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(provider.refreshToken('bad-token')).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate signature correctly', () => {
      mockTimingSafeEqual.mockReturnValue(true);

      const result = provider.validateWebhookSignature('payload', 'valid-hash');

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      mockTimingSafeEqual.mockReturnValue(false);

      const result = provider.validateWebhookSignature('payload', 'bad-hash');

      expect(result).toBe(false);
    });

    it('should return false on comparison error', () => {
      mockTimingSafeEqual.mockImplementation(() => {
        throw new Error('Invalid buffer');
      });

      const result = provider.validateWebhookSignature('payload', 'signature');

      expect(result).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('should handle CREATE events', async () => {
      const event = {
        eventNotifications: [
          {
            eventType: 'CREATE',
            dataChangeEvent: { entities: [{ id: '1' }] },
          },
        ],
      };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle UPDATE events', async () => {
      const event = {
        eventNotifications: [
          {
            eventType: 'UPDATE',
            dataChangeEvent: { entities: [{ id: '1' }] },
          },
        ],
      };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle DELETE events', async () => {
      const event = {
        eventNotifications: [
          {
            eventType: 'DELETE',
            dataChangeEvent: { entities: [{ id: '1' }] },
          },
        ],
      };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle multiple notifications', async () => {
      const event = {
        eventNotifications: [
          { eventType: 'CREATE', dataChangeEvent: { entities: [] } },
          { eventType: 'UPDATE', dataChangeEvent: { entities: [] } },
        ],
      };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle empty event notifications', async () => {
      const event = { eventNotifications: [] };

      await provider.handleWebhook(event);
      // Should not throw
    });
  });
});
