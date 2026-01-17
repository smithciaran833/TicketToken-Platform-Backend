// Mock axios BEFORE imports
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();
const mockAxiosCreate = jest.fn(() => ({
  get: mockAxiosGet,
  post: mockAxiosPost,
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: mockAxiosCreate,
    post: jest.fn(),
  },
}));

// Mock credential encryption service
const mockRetrieveOAuthTokens = jest.fn();
const mockRotateOAuthTokens = jest.fn();

jest.mock('../../../../src/services/credential-encryption.service', () => ({
  credentialEncryptionService: {
    retrieveOAuthTokens: mockRetrieveOAuthTokens,
    rotateOAuthTokens: mockRotateOAuthTokens,
  },
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    providers: {
      quickbooks: {
        realmId: 'test-realm-123',
        sandbox: true,
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
    },
  },
}));

import {
  QuickBooksSyncService,
  quickbooksSyncService,
  QuickBooksCustomer,
  QuickBooksInvoice,
  QuickBooksPayment,
} from '../../../../src/services/providers/quickbooks-sync.service';

describe('QuickBooksSyncService', () => {
  let service: QuickBooksSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QuickBooksSyncService();
  });

  describe('verifyConnection', () => {
    it('should return true on successful company info retrieval', async () => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
      mockAxiosGet.mockResolvedValue({ data: { CompanyInfo: { CompanyName: 'Test Co' } } });

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
      mockAxiosGet.mockRejectedValue(new Error('Connection failed'));

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });

    it('should return false when no credentials found', async () => {
      mockRetrieveOAuthTokens.mockResolvedValue(null);

      const result = await service.verifyConnection('venue-123');

      expect(result).toBe(false);
    });

    it('should use sandbox URL when configured', async () => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
      mockAxiosGet.mockResolvedValue({ data: { CompanyInfo: {} } });

      await service.verifyConnection('venue-123');

      expect(mockAxiosCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('sandbox-quickbooks.api.intuit.com'),
        })
      );
    });
  });

  describe('syncCustomersToQuickBooks', () => {
    beforeEach(() => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
    });

    it('should sync customers successfully', async () => {
      const customers: QuickBooksCustomer[] = [
        { displayName: 'John Doe', givenName: 'John', familyName: 'Doe' },
      ];

      mockAxiosPost.mockResolvedValue({ data: { Customer: { Id: '1' } } });

      const result = await service.syncCustomersToQuickBooks('venue-123', customers);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should update existing customer when id provided', async () => {
      const customers: QuickBooksCustomer[] = [
        { id: 'cust-123', displayName: 'John Doe' },
      ];

      mockAxiosPost.mockResolvedValue({ data: { Customer: { Id: 'cust-123' } } });

      await service.syncCustomersToQuickBooks('venue-123', customers);

      expect(mockAxiosPost).toHaveBeenCalledWith('/customer', expect.objectContaining({
        sparse: true,
      }));
    });

    it('should create new customer when no id provided', async () => {
      const customers: QuickBooksCustomer[] = [
        { displayName: 'Jane Smith' },
      ];

      mockAxiosPost.mockResolvedValue({ data: { Customer: { Id: '2' } } });

      await service.syncCustomersToQuickBooks('venue-123', customers);

      expect(mockAxiosPost).toHaveBeenCalledWith('/customer', { displayName: 'Jane Smith' });
    });

    it('should handle individual customer errors', async () => {
      const customers: QuickBooksCustomer[] = [
        { displayName: 'Success Customer' },
        { displayName: 'Error Customer' },
      ];

      mockAxiosPost
        .mockResolvedValueOnce({ data: { Customer: { Id: '1' } } })
        .mockRejectedValueOnce(new Error('Customer sync failed'));

      const result = await service.syncCustomersToQuickBooks('venue-123', customers);

      expect(result.success).toBe(false);
      expect(result.recordsSynced).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Customer sync failed');
    });

    it('should throw error on initialization failure', async () => {
      mockRetrieveOAuthTokens.mockResolvedValue(null);

      await expect(
        service.syncCustomersToQuickBooks('venue-123', [])
      ).rejects.toThrow('No QuickBooks credentials found');
    });
  });

  describe('syncCustomersFromQuickBooks', () => {
    beforeEach(() => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
    });

    it('should fetch customers from QuickBooks', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          QueryResponse: {
            Customer: [
              {
                Id: '1',
                DisplayName: 'John Doe',
                GivenName: 'John',
                FamilyName: 'Doe',
                PrimaryEmailAddr: { Address: 'john@example.com' },
                PrimaryPhone: { FreeFormNumber: '555-1234' },
              },
            ],
          },
        },
      });

      const customers = await service.syncCustomersFromQuickBooks('venue-123');

      expect(customers).toHaveLength(1);
      expect(customers[0]).toEqual(expect.objectContaining({
        id: '1',
        displayName: 'John Doe',
        givenName: 'John',
        familyName: 'Doe',
        primaryEmailAddr: 'john@example.com',
        primaryPhone: '555-1234',
      }));
    });

    it('should paginate through all customers', async () => {
      mockAxiosGet
        .mockResolvedValueOnce({
          data: {
            QueryResponse: {
              Customer: Array(1000).fill({ Id: '1', DisplayName: 'Test' }),
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            QueryResponse: {
              Customer: Array(500).fill({ Id: '2', DisplayName: 'Test' }),
            },
          },
        });

      const customers = await service.syncCustomersFromQuickBooks('venue-123');

      expect(customers).toHaveLength(1500);
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    it('should handle empty response', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { QueryResponse: { Customer: [] } },
      });

      const customers = await service.syncCustomersFromQuickBooks('venue-123');

      expect(customers).toHaveLength(0);
    });

    it('should throw error on API failure', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'));

      await expect(
        service.syncCustomersFromQuickBooks('venue-123')
      ).rejects.toThrow('QuickBooks sync from failed');
    });
  });

  describe('syncInvoicesToQuickBooks', () => {
    beforeEach(() => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
    });

    it('should sync invoices successfully', async () => {
      const invoices: QuickBooksInvoice[] = [
        {
          customerRef: { value: 'cust-1' },
          txnDate: '2024-01-01',
          totalAmt: 100,
          balance: 100,
          line: [],
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: { Invoice: { Id: '1' } } });

      const result = await service.syncInvoicesToQuickBooks('venue-123', invoices);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
    });

    it('should update existing invoice when id provided', async () => {
      const invoices: QuickBooksInvoice[] = [
        {
          id: 'inv-123',
          customerRef: { value: 'cust-1' },
          txnDate: '2024-01-01',
          totalAmt: 100,
          balance: 100,
          line: [],
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: { Invoice: { Id: 'inv-123' } } });

      await service.syncInvoicesToQuickBooks('venue-123', invoices);

      expect(mockAxiosPost).toHaveBeenCalledWith('/invoice', expect.objectContaining({
        sparse: true,
      }));
    });

    it('should handle invoice errors', async () => {
      const invoices: QuickBooksInvoice[] = [
        {
          docNumber: 'INV-001',
          customerRef: { value: 'cust-1' },
          txnDate: '2024-01-01',
          totalAmt: 100,
          balance: 100,
          line: [],
        },
      ];

      mockAxiosPost.mockRejectedValue(new Error('Invoice error'));

      const result = await service.syncInvoicesToQuickBooks('venue-123', invoices);

      expect(result.success).toBe(false);
      expect(result.errors[0].record).toBe('INV-001');
    });
  });

  describe('syncInvoicesFromQuickBooks', () => {
    beforeEach(() => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
    });

    it('should fetch invoices from QuickBooks', async () => {
      mockAxiosGet.mockResolvedValue({
        data: {
          QueryResponse: {
            Invoice: [{ Id: '1', TotalAmt: 100 }],
          },
        },
      });

      const invoices = await service.syncInvoicesFromQuickBooks('venue-123');

      expect(invoices).toHaveLength(1);
    });

    it('should filter by start date when provided', async () => {
      mockAxiosGet.mockResolvedValue({
        data: { QueryResponse: { Invoice: [] } },
      });

      await service.syncInvoicesFromQuickBooks('venue-123', '2024-01-01');

      expect(mockAxiosGet).toHaveBeenCalledWith('/query', {
        params: {
          query: expect.stringContaining("TxnDate >= '2024-01-01'"),
        },
      });
    });
  });

  describe('syncPaymentsToQuickBooks', () => {
    beforeEach(() => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
    });

    it('should sync payments successfully', async () => {
      const payments: QuickBooksPayment[] = [
        {
          customerRef: { value: 'cust-1' },
          totalAmt: 50,
          txnDate: '2024-01-15',
        },
      ];

      mockAxiosPost.mockResolvedValue({ data: { Payment: { Id: '1' } } });

      const result = await service.syncPaymentsToQuickBooks('venue-123', payments);

      expect(result.success).toBe(true);
      expect(result.recordsSynced).toBe(1);
    });

    it('should handle payment errors', async () => {
      const payments: QuickBooksPayment[] = [
        {
          id: 'pay-123',
          customerRef: { value: 'cust-1' },
          totalAmt: 50,
          txnDate: '2024-01-15',
        },
      ];

      mockAxiosPost.mockRejectedValue(new Error('Payment failed'));

      const result = await service.syncPaymentsToQuickBooks('venue-123', payments);

      expect(result.success).toBe(false);
      expect(result.errors[0].record).toBe('pay-123');
    });
  });

  describe('getCompanyInfo', () => {
    beforeEach(() => {
      mockRetrieveOAuthTokens.mockResolvedValue({ accessToken: 'test-token' });
    });

    it('should return company info', async () => {
      const companyInfo = { CompanyName: 'Test Company', Country: 'US' };
      mockAxiosGet.mockResolvedValue({ data: { CompanyInfo: companyInfo } });

      const result = await service.getCompanyInfo('venue-123');

      expect(result).toEqual(companyInfo);
    });

    it('should throw error on failure', async () => {
      mockAxiosGet.mockRejectedValue(new Error('Failed'));

      await expect(service.getCompanyInfo('venue-123')).rejects.toThrow(
        'Failed to get QuickBooks company info'
      );
    });
  });

  describe('refreshToken', () => {
    it('should refresh and store new tokens', async () => {
      const axios = require('axios').default;
      axios.post = jest.fn().mockResolvedValue({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          x_refresh_token_expires_in: 8726400,
        },
      });

      await service.refreshToken('venue-123', 'old-refresh-token');

      expect(mockRotateOAuthTokens).toHaveBeenCalledWith(
        'venue-123',
        'quickbooks',
        expect.objectContaining({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        })
      );
    });

    it('should throw error on refresh failure', async () => {
      const axios = require('axios').default;
      axios.post = jest.fn().mockRejectedValue(new Error('Refresh failed'));

      await expect(
        service.refreshToken('venue-123', 'bad-token')
      ).rejects.toThrow('Failed to refresh QuickBooks token');
    });
  });

  describe('singleton export', () => {
    it('should export a singleton instance', () => {
      expect(quickbooksSyncService).toBeInstanceOf(QuickBooksSyncService);
    });
  });
});
