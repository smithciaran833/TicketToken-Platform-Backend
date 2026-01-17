// Mock axios BEFORE imports
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();
const mockAxiosPut = jest.fn();
const mockAxiosDelete = jest.fn();
const mockAxiosCreate = jest.fn(() => ({
  get: mockAxiosGet,
  post: mockAxiosPost,
  put: mockAxiosPut,
  delete: mockAxiosDelete,
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: mockAxiosCreate,
  },
}));

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
      square: {
        environment: 'sandbox',
      },
    },
  },
}));

import {
  SquareSyncService,
  squareSyncService,
  SquareCustomer,
  SquareOrder,
  SquareInventory,
} from '../../../../src/services/providers/square-sync.service';

describe('SquareSyncService', () => {
  let service: SquareSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SquareSyncService();
    
    // Default: credentials found and locations available
    mockRetrieveApiKeys.mockResolvedValue({ apiKey: 'test-api-key' });
    mockAxiosGet.mockResolvedValue({
      data: { locations: [{ id: 'loc-123', name: 'Main Location' }] },
    });
  });

  describe('verifyConnection', () => {
    it('should return true on successful locations retrieval', async () => {
      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Connection failed'));

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });

    it('should return false when no credentials found', async () => {
      mockRetrieveApiKeys.mockResolvedValue(null);

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });

    it('should use sandbox URL when configured', async () => {
      await service.verifyConnection('venue-123');

      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://connect.squareupsandbox.com/v2',
        })
      );
    });
  });

  describe('syncCustomersToSquare', () => {
    it('should sync customers successfully', async () => {
      const customers: SquareCustomer[] = [
        { givenName: 'John', familyName: 'Doe', emailAddress: 'john@example.com' },
      ];

      mockAxiosPost.mockResolvedValue({ data: { customer: { id: 'cust-1' } } });

      const result = await service.syncCustomersToSquare('venue-123', customers);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should update existing customer when id provided', async () => {
      const customers: SquareCustomer[] = [
        { id: 'cust-123', givenName: 'John' },
      ];

      mockAxiosPut.mockResolvedValue({ data: { customer: { id: 'cust-123' } } });

      await service.syncCustomersToSquare('venue-123', customers);

      expect(mockAxiosPut).toHaveBeenCalledWith('/customers/cust-123', { customer: customers[0] });
    });

    it('should create new customer with idempotency key', async () => {
      const customers: SquareCustomer[] = [
        { givenName: 'Jane', emailAddress: 'jane@example.com' },
      ];

      mockAxiosPost.mockResolvedValue({ data: { customer: { id: 'new-1' } } });

      await service.syncCustomersToSquare('venue-123', customers);

      expect(mockAxiosPost).toHaveBeenCalledWith('/customers', expect.objectContaining({
        idempotencyKey: expect.any(String),
        customer: customers[0],
      }));
    });

    it('should handle individual customer errors', async () => {
      const customers: SquareCustomer[] = [
        { emailAddress: 'success@example.com' },
        { emailAddress: 'error@example.com' },
      ];

      mockAxiosPost
        .mockResolvedValueOnce({ data: { customer: { id: '1' } } })
        .mockRejectedValueOnce(new Error('Customer creation failed'));

      const result = await service.syncCustomersToSquare('venue-123', customers);

      expect(result.success).toBe(false);
      expect(result.recordsSynced).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should throw error on initialization failure', async () => {
      mockRetrieveApiKeys.mockResolvedValue(null);

      await expect(
        service.syncCustomersToSquare('venue-123', [])
      ).rejects.toThrow('No Square credentials found');
    });
  });

  describe('syncCustomersFromSquare', () => {
    it('should fetch customers from Square', async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          customers: [
            {
              id: 'cust-1',
              given_name: 'John',
              family_name: 'Doe',
              email_address: 'john@example.com',
              phone_number: '555-1234',
            },
          ],
        },
      });

      const customers = await service.syncCustomersFromSquare('venue-123');

      expect(customers).toHaveLength(1);
      expect(customers[0]).toEqual({
        id: 'cust-1',
        givenName: 'John',
        familyName: 'Doe',
        emailAddress: 'john@example.com',
        phoneNumber: '555-1234',
        companyName: undefined,
        note: undefined,
        referenceId: undefined,
      });
    });

    it('should paginate through all customers', async () => {
      mockAxiosPost
        .mockResolvedValueOnce({
          data: {
            customers: Array(100).fill({ id: '1', given_name: 'Test' }),
            cursor: 'next-page',
          },
        })
        .mockResolvedValueOnce({
          data: {
            customers: Array(50).fill({ id: '2', given_name: 'Test' }),
          },
        });

      const customers = await service.syncCustomersFromSquare('venue-123');

      expect(customers).toHaveLength(150);
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should handle empty response', async () => {
      mockAxiosPost.mockResolvedValue({ data: { customers: [] } });

      const customers = await service.syncCustomersFromSquare('venue-123');

      expect(customers).toHaveLength(0);
    });
  });

  describe('syncOrdersToSquare', () => {
    it('should sync orders successfully', async () => {
      const orders: SquareOrder[] = [
        {
          locationId: 'loc-123',
          lineItems: [
            { name: 'Ticket', quantity: '2', basePriceMoney: { amount: 5000, currency: 'USD' } },
          ],
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: { order: { id: 'order-1' } } });

      const result = await service.syncOrdersToSquare('venue-123', orders);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
    });

    it('should update existing order when id provided', async () => {
      const orders: SquareOrder[] = [
        { id: 'order-123', locationId: 'loc-1', lineItems: [] },
      ];

      mockAxiosPut.mockResolvedValue({ data: { order: { id: 'order-123' } } });

      await service.syncOrdersToSquare('venue-123', orders);

      expect(mockAxiosPut).toHaveBeenCalledWith('/orders/order-123', { order: orders[0] });
    });

    it('should use default location if not specified', async () => {
      const orders: SquareOrder[] = [
        { locationId: '', lineItems: [] },
      ];

      mockAxiosPost.mockResolvedValue({ data: { order: { id: '1' } } });

      await service.syncOrdersToSquare('venue-123', orders);

      expect(mockAxiosPost).toHaveBeenCalledWith('/orders', expect.objectContaining({
        order: expect.objectContaining({
          locationId: 'loc-123',
        }),
      }));
    });
  });

  describe('syncOrdersFromSquare', () => {
    it('should fetch orders from Square', async () => {
      mockAxiosPost.mockResolvedValue({
        data: {
          orders: [{ id: 'order-1', state: 'COMPLETED' }],
        },
      });

      const orders = await service.syncOrdersFromSquare('venue-123');

      expect(orders).toHaveLength(1);
    });

    it('should filter by start date when provided', async () => {
      mockAxiosPost.mockResolvedValue({ data: { orders: [] } });

      await service.syncOrdersFromSquare('venue-123', '2024-01-01T00:00:00Z');

      expect(mockAxiosPost).toHaveBeenCalledWith('/orders/search', expect.objectContaining({
        query: expect.objectContaining({
          filter: expect.objectContaining({
            date_time_filter: expect.any(Object),
          }),
        }),
      }));
    });
  });

  describe('updateInventory', () => {
    it('should update inventory successfully', async () => {
      const inventoryChanges: SquareInventory[] = [
        { catalogObjectId: 'item-1', locationId: 'loc-123', quantity: '10' },
      ];

      mockAxiosPost.mockResolvedValue({ data: { counts: [] } });

      const result = await service.updateInventory('venue-123', inventoryChanges);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
    });

    it('should batch inventory updates in groups of 100', async () => {
      const inventoryChanges: SquareInventory[] = Array(150).fill({
        catalogObjectId: 'item-1',
        locationId: 'loc-123',
        quantity: '5',
      });

      mockAxiosPost.mockResolvedValue({ data: { counts: [] } });

      await service.updateInventory('venue-123', inventoryChanges);

      // Should make 2 batch calls (100 + 50)
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should handle batch errors', async () => {
      const inventoryChanges: SquareInventory[] = [
        { catalogObjectId: 'item-1', locationId: 'loc-123', quantity: '10' },
      ];

      mockAxiosPost.mockRejectedValue(new Error('Inventory update failed'));

      const result = await service.updateInventory('venue-123', inventoryChanges);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('getInventoryCounts', () => {
    it('should retrieve inventory counts', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { counts: [{ catalog_object_id: 'item-1', quantity: '10' }] },
      });

      const counts = await service.getInventoryCounts('venue-123', ['item-1']);

      expect(counts).toHaveLength(1);
    });

    it('should batch retrieve in groups of 100', async () => {
      const catalogIds = Array(150).fill('item-1');
      mockAxiosPost.mockResolvedValue({ data: { counts: [] } });

      await service.getInventoryCounts('venue-123', catalogIds);

      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLocations', () => {
    it('should return locations', async () => {
      const locations = await service.getLocations('venue-123');

      expect(locations).toHaveLength(1);
      expect(locations[0].id).toBe('loc-123');
    });

    it('should throw error on failure', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Failed'));

      await expect(service.getLocations('venue-123')).rejects.toThrow(
        'Failed to get Square locations'
      );
    });
  });

  describe('processWebhookEvent', () => {
    it('should handle customer.created event', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.processWebhookEvent('customer.created', { id: 'cust-1' });

      expect(consoleSpy).toHaveBeenCalledWith('Customer event:', { id: 'cust-1' });
      consoleSpy.mockRestore();
    });

    it('should handle order.created event', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.processWebhookEvent('order.created', { id: 'order-1' });

      expect(consoleSpy).toHaveBeenCalledWith('Order event:', { id: 'order-1' });
      consoleSpy.mockRestore();
    });

    it('should handle unhandled event types', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service.processWebhookEvent('unknown.event', {});

      expect(consoleSpy).toHaveBeenCalledWith('Unhandled event type:', 'unknown.event');
      consoleSpy.mockRestore();
    });
  });

  describe('loyalty program methods', () => {
    it('should create loyalty account', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { loyalty_account: { id: 'loyalty-1' } },
      });

      const account = await service.createLoyaltyAccount('venue-123', 'prog-1', 'cust-1');

      expect(account.id).toBe('loyalty-1');
    });

    it('should get loyalty account', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { loyalty_accounts: [{ id: 'loyalty-1' }] },
      });

      const account = await service.getLoyaltyAccount('venue-123', 'cust-1');

      expect(account.id).toBe('loyalty-1');
    });

    it('should return null when no loyalty account found', async () => {
      mockAxiosPost.mockResolvedValue({ data: { loyalty_accounts: [] } });

      const account = await service.getLoyaltyAccount('venue-123', 'cust-1');

      expect(account).toBeNull();
    });

    it('should accumulate loyalty points', async () => {
      mockAxiosPost.mockResolvedValue({ data: { event: { id: 'event-1' } } });

      const event = await service.accumulateLoyaltyPoints('venue-123', 'acc-1', 'order-1', 100);

      expect(event.id).toBe('event-1');
    });

    it('should redeem loyalty points', async () => {
      mockAxiosPost.mockResolvedValue({ data: { event: { id: 'event-1' } } });

      const event = await service.redeemLoyaltyPoints('venue-123', 'acc-1', 'reward-1', 'order-1');

      expect(event.id).toBe('event-1');
    });

    it('should get loyalty programs', async () => {
      // Need fresh service instance to avoid cached client
      service = new SquareSyncService();
      
      mockAxiosGet
        .mockResolvedValueOnce({
          data: { locations: [{ id: 'loc-123' }] },
        })
        .mockResolvedValueOnce({
          data: { programs: [{ id: 'prog-1' }] },
        });

      const programs = await service.getLoyaltyPrograms('venue-123');

      expect(programs).toHaveLength(1);
    });
  });

  describe('catalog methods', () => {
    it('should upsert catalog objects', async () => {
      mockAxiosPost.mockResolvedValue({ data: { objects: [] } });

      const result = await service.upsertCatalogObjects('venue-123', [
        { type: 'ITEM', itemData: { name: 'Test Item' } },
      ]);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
    });

    it('should search catalog objects', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { objects: [{ id: 'obj-1', type: 'ITEM' }] },
      });

      const objects = await service.searchCatalogObjects('venue-123', ['ITEM']);

      expect(objects).toHaveLength(1);
    });

    it('should get catalog object by ID', async () => {
      // Need fresh service instance to avoid cached client
      service = new SquareSyncService();
      
      mockAxiosGet
        .mockResolvedValueOnce({
          data: { locations: [{ id: 'loc-123' }] },
        })
        .mockResolvedValueOnce({
          data: { object: { id: 'obj-1' } },
        });

      const obj = await service.getCatalogObject('venue-123', 'obj-1');

      expect(obj.id).toBe('obj-1');
    });

    it('should delete catalog object', async () => {
      mockAxiosDelete.mockResolvedValue({ data: {} });

      await expect(
        service.deleteCatalogObject('venue-123', 'obj-1')
      ).resolves.not.toThrow();

      expect(mockAxiosDelete).toHaveBeenCalledWith('/catalog/object/obj-1');
    });
  });

  describe('payment methods', () => {
    it('should create payment', async () => {
      mockAxiosPost.mockResolvedValue({
        data: { payment: { id: 'pay-1', status: 'COMPLETED' } },
      });

      const payment = await service.createPayment('venue-123', 'src-1', 5000);

      expect(payment.id).toBe('pay-1');
    });

    it('should get payments', async () => {
      // Need fresh service instance to avoid cached client
      service = new SquareSyncService();
      
      mockAxiosGet
        .mockResolvedValueOnce({
          data: { locations: [{ id: 'loc-123' }] },
        })
        .mockResolvedValueOnce({
          data: { payments: [{ id: 'pay-1' }] },
        });

      const payments = await service.getPayments('venue-123');

      expect(payments).toHaveLength(1);
    });

    it('should filter payments by time range', async () => {
      // Need fresh service instance to avoid cached client
      service = new SquareSyncService();
      
      mockAxiosGet
        .mockResolvedValueOnce({
          data: { locations: [{ id: 'loc-123' }] },
        })
        .mockResolvedValueOnce({
          data: { payments: [] },
        });

      await service.getPayments('venue-123', '2024-01-01', '2024-01-31');

      expect(mockAxiosGet).toHaveBeenLastCalledWith('/payments', {
        params: expect.objectContaining({
          begin_time: '2024-01-01',
          end_time: '2024-01-31',
        }),
      });
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(squareSyncService).toBeInstanceOf(SquareSyncService);
    });
  });
});
