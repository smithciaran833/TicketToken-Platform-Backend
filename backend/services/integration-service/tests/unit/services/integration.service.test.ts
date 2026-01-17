// Mock uuid BEFORE imports
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}));

// Mock database
const mockFirst = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockWhere = jest.fn();
const mockSelect = jest.fn();

const mockQueryBuilder = {
  where: mockWhere,
  first: mockFirst,
  update: mockUpdate,
  insert: mockInsert,
  delete: mockDelete,
  select: mockSelect,
};

mockWhere.mockReturnValue(mockQueryBuilder);
mockSelect.mockReturnValue(mockQueryBuilder);

const mockDb = jest.fn(() => mockQueryBuilder);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock tokenVault
const mockStoreToken = jest.fn();
const mockStoreApiKey = jest.fn();
const mockGetToken = jest.fn();
const mockGetApiKey = jest.fn();

jest.mock('../../../src/services/token-vault.service', () => ({
  tokenVault: {
    storeToken: mockStoreToken,
    storeApiKey: mockStoreApiKey,
    getToken: mockGetToken,
    getApiKey: mockGetApiKey,
  },
}));

// Mock providers
const mockProviderInitialize = jest.fn();
const mockProviderTestConnection = jest.fn();
const mockProviderSyncProducts = jest.fn();
const mockProviderSyncCustomers = jest.fn();
const mockProviderSyncTransactions = jest.fn();

const createMockProvider = () => ({
  initialize: mockProviderInitialize,
  testConnection: mockProviderTestConnection,
  syncProducts: mockProviderSyncProducts,
  syncCustomers: mockProviderSyncCustomers,
  syncTransactions: mockProviderSyncTransactions,
});

jest.mock('../../../src/providers/square/square.provider', () => ({
  SquareProvider: jest.fn().mockImplementation(createMockProvider),
}));

jest.mock('../../../src/providers/stripe/stripe.provider', () => ({
  StripeProvider: jest.fn().mockImplementation(createMockProvider),
}));

jest.mock('../../../src/providers/mailchimp/mailchimp.provider', () => ({
  MailchimpProvider: jest.fn().mockImplementation(createMockProvider),
}));

jest.mock('../../../src/providers/quickbooks/quickbooks.provider', () => ({
  QuickBooksProvider: jest.fn().mockImplementation(createMockProvider),
}));

// Mock queue
const mockQueueAdd = jest.fn();
jest.mock('../../../src/config/queue', () => ({
  queues: {
    normal: {
      add: mockQueueAdd,
    },
  },
}));

import { IntegrationService } from '../../../src/services/integration.service';
import { logger } from '../../../src/utils/logger';
import { tokenVault } from '../../../src/services/token-vault.service';
import { IntegrationStatus } from '../../../src/types/integration.types';

describe('IntegrationService', () => {
  let service: IntegrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    mockSelect.mockReturnValue(mockQueryBuilder);
    service = new IntegrationService();
  });

  describe('constructor', () => {
    it('should initialize with all providers', () => {
      expect(service).toBeInstanceOf(IntegrationService);
    });
  });

  describe('connectIntegration', () => {
    const venueId = 'venue-123';
    const integrationType = 'stripe';
    const credentials = {
      accessToken: 'access-token-xyz',
      refreshToken: 'refresh-token-xyz',
      expiresAt: new Date(),
      scopes: ['read', 'write'],
      config: { customSetting: true },
    };

    beforeEach(() => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);
      mockUpdate.mockResolvedValue(1);
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderTestConnection.mockResolvedValue(true);
      mockStoreToken.mockResolvedValue(undefined);
      mockQueueAdd.mockResolvedValue({ id: 'job-1' });
    });

    it('should update status to connecting first', async () => {
      await service.connectIntegration(venueId, integrationType as any, credentials);

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
    });

    it('should initialize provider with credentials', async () => {
      await service.connectIntegration(venueId, integrationType as any, credentials);

      expect(mockProviderInitialize).toHaveBeenCalledWith(credentials);
    });

    it('should test connection', async () => {
      await service.connectIntegration(venueId, integrationType as any, credentials);

      expect(mockProviderTestConnection).toHaveBeenCalled();
    });

    it('should throw error when connection test fails', async () => {
      mockProviderTestConnection.mockResolvedValue(false);

      await expect(
        service.connectIntegration(venueId, integrationType as any, credentials)
      ).rejects.toThrow('Connection test failed');
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        service.connectIntegration(venueId, 'unknown' as any, credentials)
      ).rejects.toThrow('Provider unknown not found');
    });

    it('should store OAuth token when accessToken provided', async () => {
      await service.connectIntegration(venueId, integrationType as any, credentials);

      expect(mockStoreToken).toHaveBeenCalledWith(venueId, integrationType, {
        access_token: credentials.accessToken,
        refresh_token: credentials.refreshToken,
        expires_at: credentials.expiresAt,
        scopes: credentials.scopes,
      });
    });

    it('should store API key when apiKey provided', async () => {
      const apiCredentials = {
        apiKey: 'sk_test_xxx',
        apiSecret: 'whsec_xxx',
      };

      await service.connectIntegration(venueId, integrationType as any, apiCredentials);

      expect(mockStoreApiKey).toHaveBeenCalledWith(
        venueId,
        integrationType,
        apiCredentials.apiKey,
        apiCredentials.apiSecret
      );
    });

    it('should schedule initial sync', async () => {
      await service.connectIntegration(venueId, integrationType as any, credentials);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'sync',
        expect.objectContaining({
          venueId,
          integrationType,
          syncType: 'initial',
        }),
        { delay: 5000 }
      );
    });

    it('should return success response', async () => {
      const result = await service.connectIntegration(venueId, integrationType as any, credentials);

      expect(result).toEqual({
        success: true,
        message: 'Integration connected successfully',
        integrationType,
      });
    });

    it('should log success', async () => {
      await service.connectIntegration(venueId, integrationType as any, credentials);

      expect(logger.info).toHaveBeenCalledWith('Integration connected successfully', {
        venueId,
        integrationType,
      });
    });

    it('should update status to error on failure', async () => {
      const error = new Error('Connection failed');
      mockProviderInitialize.mockRejectedValue(error);

      await expect(
        service.connectIntegration(venueId, integrationType as any, credentials)
      ).rejects.toThrow('Connection failed');

      expect(logger.error).toHaveBeenCalledWith('Failed to connect integration', {
        venueId,
        integrationType,
        error: error.message,
      });
    });

    it('should work with all supported providers', async () => {
      for (const provider of ['square', 'stripe', 'mailchimp', 'quickbooks']) {
        jest.clearAllMocks();
        mockFirst.mockResolvedValue(null);
        mockInsert.mockResolvedValue([1]);
        mockProviderTestConnection.mockResolvedValue(true);

        const result = await service.connectIntegration(venueId, provider as any, credentials);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('disconnectIntegration', () => {
    const venueId = 'venue-123';
    const integrationType = 'stripe';

    beforeEach(() => {
      mockFirst.mockResolvedValue({ id: 'config-1' });
      mockUpdate.mockResolvedValue(1);
      mockDelete.mockResolvedValue(1);
    });

    it('should delete OAuth tokens', async () => {
      await service.disconnectIntegration(venueId, integrationType as any);

      expect(mockDb).toHaveBeenCalledWith('oauth_tokens');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integrationType,
      });
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should delete API keys', async () => {
      await service.disconnectIntegration(venueId, integrationType as any);

      expect(mockDb).toHaveBeenCalledWith('venue_api_keys');
    });

    it('should update integration config status', async () => {
      await service.disconnectIntegration(venueId, integrationType as any);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          disconnected_at: expect.any(Date),
          status: IntegrationStatus.DISCONNECTED,
          updated_at: expect.any(Date),
        })
      );
    });

    it('should log disconnection', async () => {
      await service.disconnectIntegration(venueId, integrationType as any);

      expect(logger.info).toHaveBeenCalledWith('Integration disconnected', {
        venueId,
        integrationType,
      });
    });

    it('should propagate errors', async () => {
      const error = new Error('Database error');
      mockDelete.mockRejectedValue(error);

      await expect(
        service.disconnectIntegration(venueId, integrationType as any)
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith('Failed to disconnect integration', {
        venueId,
        integrationType,
        error,
      });
    });
  });

  describe('getIntegrationStatus', () => {
    const venueId = 'venue-123';

    it('should return all integrations for venue', async () => {
      const configs = [
        { integration_type: 'stripe', status: 'connected' },
        { integration_type: 'square', status: 'disconnected' },
      ];

      // Mock the query chain for getting all configs
      const mockConfigQuery: any = Promise.resolve(configs);
      mockConfigQuery.where = jest.fn().mockReturnValue(mockConfigQuery);
      mockDb.mockReturnValueOnce(mockConfigQuery);

      // Mock health data lookup
      mockFirst.mockResolvedValue({ status: 'healthy' });

      const result = await service.getIntegrationStatus(venueId);

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(result).toHaveLength(2);
    });

    it('should return single integration when type specified', async () => {
      const configs = [{ integration_type: 'stripe', status: 'connected' }];

      // Create a proper async iterable mock
      const mockConfigQuery: any = Promise.resolve(configs);
      mockConfigQuery.where = jest.fn().mockReturnValue(mockConfigQuery);
      mockDb.mockReturnValueOnce(mockConfigQuery);

      // Mock health data lookup
      mockFirst.mockResolvedValue({ status: 'healthy' });

      const result = await service.getIntegrationStatus(venueId, 'stripe' as any);

      // When integrationType is specified, it returns configs[0]
      expect(result).toBeDefined();
    });

    it('should enrich with health data', async () => {
      const configs = [{ integration_type: 'stripe', status: 'connected' }];
      const healthData = { status: 'healthy', uptime: 99.9 };

      const mockConfigQuery: any = Promise.resolve(configs);
      mockConfigQuery.where = jest.fn().mockReturnValue(mockConfigQuery);
      mockDb.mockReturnValueOnce(mockConfigQuery);

      mockFirst.mockResolvedValue(healthData);

      const result = await service.getIntegrationStatus(venueId);

      expect(mockDb).toHaveBeenCalledWith('integration_health');
      expect(result[0].health).toEqual(healthData);
    });
  });

  describe('syncNow', () => {
    const venueId = 'venue-123';
    const integrationType = 'stripe';

    beforeEach(() => {
      mockFirst.mockResolvedValue({ field_mappings: {}, config: {} });
      mockInsert.mockResolvedValue([1]);
      mockUpdate.mockResolvedValue(1);
      mockGetToken.mockResolvedValue({
        access_token: 'token',
        refresh_token: 'refresh',
      });
      mockProviderInitialize.mockResolvedValue(undefined);
      mockProviderSyncProducts.mockResolvedValue({
        success: true,
        syncedCount: 5,
        failedCount: 0,
      });
      mockProviderSyncCustomers.mockResolvedValue({
        success: true,
        syncedCount: 10,
        failedCount: 0,
      });
      mockProviderSyncTransactions.mockResolvedValue({
        success: true,
        syncedCount: 20,
        failedCount: 0,
      });

      // Mock db queries for sync operations
      mockSelect.mockResolvedValue([]);
    });

    it('should create sync log entry', async () => {
      await service.syncNow(venueId, integrationType as any);

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-uuid-12345',
          venue_id: venueId,
          integration_type: integrationType,
          status: 'started',
        })
      );
    });

    it('should throw error for unknown provider', async () => {
      await expect(
        service.syncNow(venueId, 'unknown' as any)
      ).rejects.toThrow('Provider unknown not found');
    });

    it('should get credentials from token vault', async () => {
      await service.syncNow(venueId, integrationType as any);

      expect(mockGetToken).toHaveBeenCalledWith(venueId, integrationType);
    });

    it('should use API key when no OAuth token', async () => {
      mockGetToken.mockResolvedValue(null);
      mockGetApiKey.mockResolvedValue({
        api_key: 'key',
        api_secret: 'secret',
      });

      await service.syncNow(venueId, integrationType as any);

      expect(mockGetApiKey).toHaveBeenCalledWith(venueId, integrationType);
    });

    it('should throw error when no credentials found', async () => {
      mockGetToken.mockResolvedValue(null);
      mockGetApiKey.mockResolvedValue(null);

      await expect(
        service.syncNow(venueId, integrationType as any)
      ).rejects.toThrow('No credentials found');
    });

    it('should sync products when syncType is products', async () => {
      await service.syncNow(venueId, integrationType as any, { syncType: 'products' });

      expect(mockProviderSyncProducts).toHaveBeenCalled();
    });

    it('should sync customers when syncType is customers', async () => {
      await service.syncNow(venueId, integrationType as any, { syncType: 'customers' });

      expect(mockProviderSyncCustomers).toHaveBeenCalled();
    });

    it('should sync transactions when syncType is transactions', async () => {
      await service.syncNow(venueId, integrationType as any, { syncType: 'transactions' });

      expect(mockProviderSyncTransactions).toHaveBeenCalled();
    });

    it('should perform full sync by default', async () => {
      await service.syncNow(venueId, integrationType as any);

      expect(mockProviderSyncProducts).toHaveBeenCalled();
      expect(mockProviderSyncCustomers).toHaveBeenCalled();
      expect(mockProviderSyncTransactions).toHaveBeenCalled();
    });

    it('should update sync log on completion', async () => {
      await service.syncNow(venueId, integrationType as any);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(Date),
        })
      );
    });

    it('should update last_sync_at in integration config', async () => {
      await service.syncNow(venueId, integrationType as any);

      expect(mockDb).toHaveBeenCalledWith('integration_configs');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          last_sync_at: expect.any(Date),
        })
      );
    });

    it('should return sync result with aggregated counts', async () => {
      const result = await service.syncNow(venueId, integrationType as any);

      expect(result.overall.syncedCount).toBe(35); // 5 + 10 + 20
      expect(result.overall.failedCount).toBe(0);
      expect(result.overall.success).toBe(true);
    });

    it('should handle provider not supporting sync method', async () => {
      mockProviderSyncProducts.mockResolvedValue({
        success: false,
        message: 'Provider does not support product sync',
      });

      const result = await service.syncNow(venueId, integrationType as any, {
        syncType: 'products',
      });

      expect(result.success).toBe(false);
    });

    it('should log error on sync failure', async () => {
      const error = new Error('Sync failed');
      mockProviderSyncProducts.mockRejectedValue(error);

      await expect(
        service.syncNow(venueId, integrationType as any, { syncType: 'products' })
      ).rejects.toThrow('Sync failed');

      expect(logger.error).toHaveBeenCalledWith('Sync failed', {
        venueId,
        integrationType,
        error: error.message,
      });
    });
  });

  describe('field mapping', () => {
    const venueId = 'venue-123';
    const integrationType = 'stripe';

    beforeEach(() => {
      mockGetToken.mockResolvedValue({ access_token: 'token' });
      mockProviderInitialize.mockResolvedValue(undefined);
      mockInsert.mockResolvedValue([1]);
      mockUpdate.mockResolvedValue(1);
    });

    it('should apply field mappings to data', async () => {
      const mappings = {
        name: 'title',
        'base_price': 'amount',
      };

      mockFirst.mockResolvedValue({ field_mappings: mappings, config: {} });
      mockSelect.mockResolvedValue([
        { id: '1', name: 'Event 1', base_price: 100 },
      ]);
      mockProviderSyncProducts.mockResolvedValue({
        success: true,
        syncedCount: 1,
        failedCount: 0,
      });

      await service.syncNow(venueId, integrationType as any, { syncType: 'products' });

      expect(mockProviderSyncProducts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Event 1',
            amount: 100,
          }),
        ])
      );
    });

    it('should handle nested field mappings', async () => {
      const mappings = {
        'nested.value': 'output',
      };

      mockFirst.mockResolvedValue({ field_mappings: mappings, config: {} });
      mockSelect.mockResolvedValue([
        { id: '1', nested: { value: 'test' } },
      ]);
      mockProviderSyncProducts.mockResolvedValue({
        success: true,
        syncedCount: 1,
        failedCount: 0,
      });

      await service.syncNow(venueId, integrationType as any, { syncType: 'products' });

      expect(mockProviderSyncProducts).toHaveBeenCalled();
    });

    it('should pass data unchanged when no mappings', async () => {
      mockFirst.mockResolvedValue({ field_mappings: {}, config: {} });
      const products = [{ id: '1', name: 'Product 1' }];
      mockSelect.mockResolvedValue(products);
      mockProviderSyncProducts.mockResolvedValue({
        success: true,
        syncedCount: 1,
        failedCount: 0,
      });

      await service.syncNow(venueId, integrationType as any, { syncType: 'products' });

      expect(mockProviderSyncProducts).toHaveBeenCalledWith(products);
    });
  });
});

describe('integrationService singleton', () => {
  it('should export integrationService instance', async () => {
    const { integrationService } = await import(
      '../../../src/services/integration.service'
    );
    expect(integrationService).toBeInstanceOf(IntegrationService);
  });
});
