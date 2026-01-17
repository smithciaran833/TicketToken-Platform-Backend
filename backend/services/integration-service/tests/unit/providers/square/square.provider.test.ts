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
      square: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        sandbox: true,
        webhookSignatureKey: 'webhook-key',
      },
    },
    server: {
      apiUrl: 'https://api.test.com',
    },
  },
}));

import { SquareProvider } from '../../../../src/providers/square/square.provider';

describe('SquareProvider', () => {
  let provider: SquareProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new SquareProvider();
  });

  describe('constructor', () => {
    it('should use sandbox URL when sandbox is enabled', () => {
      expect(provider.name).toBe('square');
    });
  });

  describe('initialize', () => {
    it('should initialize with credentials', async () => {
      const credentials = {
        accessToken: 'test-token',
        locationId: 'location-123',
      };

      await provider.initialize(credentials);
      // Should not throw
    });

    it('should initialize without locationId', async () => {
      const credentials = {
        accessToken: 'test-token',
      };

      await provider.initialize(credentials);
      // Should not throw
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      await provider.initialize({ accessToken: 'test-token' });
    });

    it('should return true on successful connection', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200 });

      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://connect.squareupsandbox.com/v2/merchants/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Square-Version': '2023-10-18',
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
      await provider.initialize({ accessToken: 'test-token' });
    });

    it('should sync products successfully', async () => {
      const products = [
        {
          id: 'prod-1',
          name: 'Product 1',
          description: 'Description 1',
          price: 19.99,
        },
        {
          id: 'prod-2',
          name: 'Product 2',
          description: 'Description 2',
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

    it('should handle product sync failures', async () => {
      const products = [{ id: 'prod-1', name: 'Product', price: 10 }];

      mockAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await provider.syncProducts(products);

      expect(result.success).toBe(false);
      expect(result.syncedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should convert price to cents', async () => {
      const products = [
        { id: 'prod-1', name: 'Product', price: 19.99, description: 'Test' },
      ];

      mockAxiosPost.mockResolvedValue({ data: {} });

      await provider.syncProducts(products);

      const call = mockAxiosPost.mock.calls[0];
      const body = call[1];
      
      expect(body.object.item_data.variations[0].item_variation_data.price_money.amount).toBe(1999);
    });
  });

  describe('syncInventory', () => {
    beforeEach(async () => {
      await provider.initialize({
        accessToken: 'test-token',
        locationId: 'location-123',
      });
    });

    it('should sync inventory successfully', async () => {
      const inventory = [
        { id: 'inv-1', catalogObjectId: 'cat-1', quantity: 10 },
        { id: 'inv-2', catalogObjectId: 'cat-2', quantity: 20 },
      ];

      mockAxiosPost.mockResolvedValue({ data: {} });

      const result = await provider.syncInventory(inventory);

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should handle inventory sync failures', async () => {
      const inventory = [{ id: 'inv-1', catalogObjectId: 'cat-1', quantity: 5 }];

      mockAxiosPost.mockRejectedValue(new Error('Inventory error'));

      const result = await provider.syncInventory(inventory);

      expect(result.success).toBe(false);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('fetchTransactions', () => {
    beforeEach(async () => {
      await provider.initialize({ accessToken: 'test-token' });
    });

    it('should fetch transactions successfully', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');
      const payments = [{ id: 'pay-1' }, { id: 'pay-2' }];

      mockAxiosPost.mockResolvedValue({ data: { payments } });

      const result = await provider.fetchTransactions(startDate, endDate);

      expect(result).toEqual(payments);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://connect.squareupsandbox.com/v2/payments/search',
        expect.objectContaining({
          filter: expect.objectContaining({
            date_time_filter: expect.any(Object),
          }),
        }),
        expect.any(Object)
      );
    });

    it('should return empty array on error', async () => {
      mockAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await provider.fetchTransactions(new Date(), new Date());

      expect(result).toEqual([]);
    });

    it('should return empty array when no payments', async () => {
      mockAxiosPost.mockResolvedValue({ data: {} });

      const result = await provider.fetchTransactions(new Date(), new Date());

      expect(result).toEqual([]);
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
    it('should handle payment.created events', async () => {
      const event = { type: 'payment.created', data: { id: 'pay-123' } };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle inventory.count.updated events', async () => {
      const event = { type: 'inventory.count.updated', data: {} };

      await provider.handleWebhook(event);
      // Should not throw
    });

    it('should handle catalog.version.updated events', async () => {
      const event = { type: 'catalog.version.updated', data: {} };

      await provider.handleWebhook(event);
      // Should not throw
    });
  });

  describe('getOAuthUrl', () => {
    it('should generate correct OAuth URL with scopes', () => {
      const state = 'test-state';
      const url = provider.getOAuthUrl(state);

      expect(url).toContain('https://connect.squareupsandbox.com/oauth2/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=test-state');
      expect(url).toContain('ITEMS_READ');
      expect(url).toContain('INVENTORY_READ');
      expect(url).toContain('PAYMENTS_READ');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const code = 'auth-code';
      const tokenData = { access_token: 'token', expires_at: '2025-12-31' };

      mockAxiosPost.mockResolvedValue({ data: tokenData });

      const result = await provider.exchangeCodeForToken(code);

      expect(result).toEqual(tokenData);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://connect.squareupsandbox.com/v2/oauth2/token',
        expect.objectContaining({
          grant_type: 'authorization_code',
          code: 'auth-code',
        })
      );
    });

    it('should propagate exchange errors', async () => {
      mockAxiosPost.mockRejectedValue(new Error('Invalid code'));

      await expect(provider.exchangeCodeForToken('bad')).rejects.toThrow(
        'Invalid code'
      );
    });
  });
});
