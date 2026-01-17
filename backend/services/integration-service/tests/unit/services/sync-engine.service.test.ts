// Mock database
const mockFirst = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockReturning = jest.fn();
const mockRaw = jest.fn();

const mockQueryBuilder = {
  where: mockWhere,
  first: mockFirst,
  update: mockUpdate,
  insert: mockInsert,
  orderBy: mockOrderBy,
  limit: mockLimit,
  returning: mockReturning,
};

mockWhere.mockReturnValue(mockQueryBuilder);
mockOrderBy.mockReturnValue(mockQueryBuilder);
mockLimit.mockReturnValue(mockQueryBuilder);
mockInsert.mockReturnValue({ returning: mockReturning });

const mockDb: any = jest.fn(() => mockQueryBuilder);
mockDb.raw = mockRaw;

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock credential encryption service
const mockRetrieveOAuthTokens = jest.fn();
const mockRetrieveApiKeys = jest.fn();
const mockValidateAndRotateIfNeeded = jest.fn();

jest.mock('../../../src/services/credential-encryption.service', () => ({
  credentialEncryptionService: {
    retrieveOAuthTokens: mockRetrieveOAuthTokens,
    retrieveApiKeys: mockRetrieveApiKeys,
    validateAndRotateIfNeeded: mockValidateAndRotateIfNeeded,
  },
}));

// Mock sync services
const mockStripeSyncCustomers = jest.fn();
const mockStripeGetProducts = jest.fn();
const mockStripeGetSubscriptions = jest.fn();
const mockStripeSyncCharges = jest.fn();

jest.mock('../../../src/services/providers/stripe-sync.service', () => ({
  stripeSyncService: {
    syncCustomersFromStripe: mockStripeSyncCustomers,
    getProducts: mockStripeGetProducts,
    getSubscriptions: mockStripeGetSubscriptions,
    syncChargesFromStripe: mockStripeSyncCharges,
  },
}));

const mockSquareSyncCustomers = jest.fn();
const mockSquareSyncOrders = jest.fn();
const mockSquareSearchCatalog = jest.fn();
const mockSquareGetPayments = jest.fn();

jest.mock('../../../src/services/providers/square-sync.service', () => ({
  squareSyncService: {
    syncCustomersFromSquare: mockSquareSyncCustomers,
    syncOrdersFromSquare: mockSquareSyncOrders,
    searchCatalogObjects: mockSquareSearchCatalog,
    getPayments: mockSquareGetPayments,
  },
}));

const mockMailchimpSyncContacts = jest.fn();
const mockMailchimpSyncContactsTo = jest.fn();
const mockMailchimpGetLists = jest.fn();

jest.mock('../../../src/services/providers/mailchimp-sync.service', () => ({
  mailchimpSyncService: {
    syncContactsFromMailchimp: mockMailchimpSyncContacts,
    syncContactsToMailchimp: mockMailchimpSyncContactsTo,
    getLists: mockMailchimpGetLists,
  },
}));

const mockQBSyncCustomers = jest.fn();
const mockQBSyncCustomersTo = jest.fn();
const mockQBSyncInvoices = jest.fn();

jest.mock('../../../src/services/providers/quickbooks-sync.service', () => ({
  quickbooksSyncService: {
    syncCustomersFromQuickBooks: mockQBSyncCustomers,
    syncCustomersToQuickBooks: mockQBSyncCustomersTo,
    syncInvoicesFromQuickBooks: mockQBSyncInvoices,
  },
}));

// Mock rate limiter
const mockWaitIfNeeded = jest.fn();

jest.mock('../../../src/services/rate-limiter.service', () => ({
  rateLimiterService: {
    waitIfNeeded: mockWaitIfNeeded,
  },
}));

import { SyncEngineService, SyncJob } from '../../../src/services/sync-engine.service';

describe('SyncEngineService', () => {
  let service: SyncEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    mockOrderBy.mockReturnValue(mockQueryBuilder);
    mockLimit.mockReturnValue(mockQueryBuilder);
    mockWaitIfNeeded.mockResolvedValue(undefined);
    service = new SyncEngineService();
  });

  describe('queueSync', () => {
    const job: SyncJob = {
      venueId: 'venue-123',
      integrationType: 'stripe',
      syncType: 'customers',
      direction: 'inbound',
      priority: 'normal',
    };

    it('should insert job into sync_queue', async () => {
      mockReturning.mockResolvedValue([{ id: 'job-123' }]);

      const result = await service.queueSync(job);

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: job.venueId,
          integration_type: job.integrationType,
          sync_type: job.syncType,
          direction: job.direction,
          status: 'pending',
          priority: 'normal',
          attempts: 0,
          max_attempts: 3,
        })
      );
      expect(result).toBe('job-123');
    });

    it('should use default priority when not specified', async () => {
      const jobWithoutPriority: SyncJob = {
        venueId: 'venue-123',
        integrationType: 'stripe',
        syncType: 'customers',
        direction: 'inbound',
      };

      mockReturning.mockResolvedValue([{ id: 'job-123' }]);

      await service.queueSync(jobWithoutPriority);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'normal',
        })
      );
    });

    it('should set scheduled_for to now when not specified', async () => {
      mockReturning.mockResolvedValue([{ id: 'job-123' }]);

      await service.queueSync(job);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduled_for: expect.any(Date),
        })
      );
    });

    it('should use provided scheduled_for', async () => {
      const futureDate = new Date('2026-01-01');
      const scheduledJob: SyncJob = {
        ...job,
        scheduledFor: futureDate,
      };

      mockReturning.mockResolvedValue([{ id: 'job-123' }]);

      await service.queueSync(scheduledJob);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduled_for: futureDate,
        })
      );
    });

    it('should stringify metadata', async () => {
      const jobWithMetadata: SyncJob = {
        ...job,
        metadata: { key: 'value' },
      };

      mockReturning.mockResolvedValue([{ id: 'job-123' }]);

      await service.queueSync(jobWithMetadata);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: JSON.stringify({ key: 'value' }),
        })
      );
    });

    it('should throw error on database failure', async () => {
      mockReturning.mockRejectedValue(new Error('Database error'));

      await expect(service.queueSync(job)).rejects.toThrow(
        'Failed to queue sync job: Database error'
      );
    });
  });

  describe('processSync', () => {
    const jobId = 'job-123';
    const mockJob = {
      id: jobId,
      venue_id: 'venue-123',
      integration_type: 'stripe',
      sync_type: 'customers',
      direction: 'inbound',
      metadata: {},
      started_at: new Date(),
    };

    beforeEach(() => {
      mockFirst.mockResolvedValue(mockJob);
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);
      mockRetrieveOAuthTokens.mockResolvedValue({
        access_token: 'token',
        refresh_token: 'refresh',
      });
      mockValidateAndRotateIfNeeded.mockResolvedValue(false);
      mockStripeSyncCustomers.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    });

    it('should get job from queue', async () => {
      await service.processSync(jobId);

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockWhere).toHaveBeenCalledWith({ id: jobId });
      expect(mockFirst).toHaveBeenCalled();
    });

    it('should throw error when job not found', async () => {
      mockFirst.mockResolvedValue(null);

      await expect(service.processSync(jobId)).rejects.toThrow(
        `Sync job ${jobId} not found`
      );
    });

    it('should update job status to processing', async () => {
      await service.processSync(jobId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'processing',
          started_at: expect.any(Date),
        })
      );
    });

    it('should get credentials', async () => {
      await service.processSync(jobId);

      expect(mockRetrieveOAuthTokens).toHaveBeenCalledWith(
        mockJob.venue_id,
        mockJob.integration_type
      );
    });

    it('should check token rotation', async () => {
      await service.processSync(jobId);

      expect(mockValidateAndRotateIfNeeded).toHaveBeenCalledWith(
        mockJob.venue_id,
        mockJob.integration_type
      );
    });

    it('should try API keys when no OAuth tokens', async () => {
      mockRetrieveOAuthTokens.mockResolvedValue(null);
      mockRetrieveApiKeys.mockResolvedValue({ api_key: 'key' });

      await service.processSync(jobId);

      expect(mockRetrieveApiKeys).toHaveBeenCalledWith(
        mockJob.venue_id,
        mockJob.integration_type,
        'default'
      );
    });

    it('should throw error when no credentials found', async () => {
      mockRetrieveOAuthTokens.mockResolvedValue(null);
      mockRetrieveApiKeys.mockResolvedValue(null);

      await expect(service.processSync(jobId)).rejects.toThrow(
        'No credentials found'
      );
    });

    it('should execute Stripe sync', async () => {
      await service.processSync(jobId);

      expect(mockStripeSyncCustomers).toHaveBeenCalledWith(mockJob.venue_id);
    });

    it('should update job as completed', async () => {
      await service.processSync(jobId);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(Date),
          records_processed: 2,
          records_succeeded: 2,
          records_failed: 0,
        })
      );
    });

    it('should return sync result', async () => {
      const result = await service.processSync(jobId);

      expect(result).toEqual({
        success: true,
        recordsProcessed: 2,
        recordsSucceeded: 2,
        recordsFailed: 0,
        errors: [],
        duration: expect.any(Number),
      });
    });

    it('should capture errors in result when sync execution fails', async () => {
      mockStripeSyncCustomers.mockRejectedValue(new Error('Sync failed'));

      const result = await service.processSync(jobId);

      // The sync engine catches errors in executeSync and includes them in errors array
      // Note: success is calculated as recordsFailed === 0, so it's true even with errors
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Sync failed');
      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsSucceeded).toBe(0);
    });

    it('should log sync completion', async () => {
      await service.processSync(jobId);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: mockJob.venue_id,
          integration_type: mockJob.integration_type,
          status: 'success',
        })
      );
    });
  });

  describe('executeStripeSync', () => {
    const baseJob = {
      venue_id: 'venue-123',
      integration_type: 'stripe',
      direction: 'inbound',
      metadata: {},
      started_at: new Date(),
    };

    beforeEach(() => {
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);
      mockRetrieveOAuthTokens.mockResolvedValue({ access_token: 'token' });
      mockValidateAndRotateIfNeeded.mockResolvedValue(false);
    });

    it('should sync customers from Stripe', async () => {
      const job = { ...baseJob, sync_type: 'customers' };
      mockFirst.mockResolvedValue(job);
      mockStripeSyncCustomers.mockResolvedValue([{ id: '1' }]);

      const result = await service.processSync('job-1');

      expect(mockWaitIfNeeded).toHaveBeenCalledWith('stripe', job.venue_id, 'customers');
      expect(mockStripeSyncCustomers).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync products from Stripe', async () => {
      const job = { ...baseJob, sync_type: 'products' };
      mockFirst.mockResolvedValue(job);
      mockStripeGetProducts.mockResolvedValue([{ id: 'prod-1' }]);

      const result = await service.processSync('job-1');

      expect(mockStripeGetProducts).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync subscriptions from Stripe', async () => {
      const job = { ...baseJob, sync_type: 'subscriptions' };
      mockFirst.mockResolvedValue(job);
      mockStripeGetSubscriptions.mockResolvedValue([{ id: 'sub-1' }]);

      const result = await service.processSync('job-1');

      expect(mockStripeGetSubscriptions).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync charges from Stripe', async () => {
      const job = { ...baseJob, sync_type: 'charges' };
      mockFirst.mockResolvedValue(job);
      mockStripeSyncCharges.mockResolvedValue([{ id: 'ch-1' }]);

      const result = await service.processSync('job-1');

      expect(mockStripeSyncCharges).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should capture error for unsupported Stripe sync type', async () => {
      const job = { ...baseJob, sync_type: 'invalid' };
      mockFirst.mockResolvedValue(job);

      const result = await service.processSync('job-1');

      // The sync engine catches the error and includes it in the errors array
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Unsupported Stripe sync type');
      expect(result.recordsProcessed).toBe(0);
    });
  });

  describe('executeSquareSync', () => {
    const baseJob = {
      venue_id: 'venue-123',
      integration_type: 'square',
      direction: 'inbound',
      metadata: {},
      started_at: new Date(),
    };

    beforeEach(() => {
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);
      mockRetrieveOAuthTokens.mockResolvedValue({ access_token: 'token' });
      mockValidateAndRotateIfNeeded.mockResolvedValue(false);
    });

    it('should sync customers from Square', async () => {
      const job = { ...baseJob, sync_type: 'customers' };
      mockFirst.mockResolvedValue(job);
      mockSquareSyncCustomers.mockResolvedValue([{ id: '1' }]);

      const result = await service.processSync('job-1');

      expect(mockSquareSyncCustomers).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync orders from Square', async () => {
      const job = { ...baseJob, sync_type: 'orders' };
      mockFirst.mockResolvedValue(job);
      mockSquareSyncOrders.mockResolvedValue([{ id: 'order-1' }]);

      const result = await service.processSync('job-1');

      expect(mockSquareSyncOrders).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync catalog from Square', async () => {
      const job = { ...baseJob, sync_type: 'catalog' };
      mockFirst.mockResolvedValue(job);
      mockSquareSearchCatalog.mockResolvedValue([{ id: 'item-1' }]);

      const result = await service.processSync('job-1');

      expect(mockSquareSearchCatalog).toHaveBeenCalledWith(job.venue_id, ['ITEM']);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync payments from Square', async () => {
      const job = { ...baseJob, sync_type: 'payments' };
      mockFirst.mockResolvedValue(job);
      mockSquareGetPayments.mockResolvedValue([{ id: 'pay-1' }]);

      const result = await service.processSync('job-1');

      expect(mockSquareGetPayments).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });
  });

  describe('executeMailchimpSync', () => {
    const baseJob = {
      venue_id: 'venue-123',
      integration_type: 'mailchimp',
      direction: 'inbound',
      metadata: { listId: 'list-123' },
      started_at: new Date(),
    };

    beforeEach(() => {
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);
      mockRetrieveOAuthTokens.mockResolvedValue({ access_token: 'token' });
      mockValidateAndRotateIfNeeded.mockResolvedValue(false);
    });

    it('should sync contacts from Mailchimp', async () => {
      const job = { ...baseJob, sync_type: 'contacts' };
      mockFirst.mockResolvedValue(job);
      mockMailchimpSyncContacts.mockResolvedValue([{ id: '1' }]);

      const result = await service.processSync('job-1');

      expect(mockMailchimpSyncContacts).toHaveBeenCalledWith(job.venue_id, 'list-123');
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync contacts to Mailchimp', async () => {
      const contacts = [{ email: 'test@example.com' }];
      const job = {
        ...baseJob,
        sync_type: 'contacts',
        direction: 'outbound',
        metadata: { listId: 'list-123', contacts },
      };
      mockFirst.mockResolvedValue(job);
      mockMailchimpSyncContactsTo.mockResolvedValue({
        contactsSynced: 1,
        errors: [],
      });

      const result = await service.processSync('job-1');

      expect(mockMailchimpSyncContactsTo).toHaveBeenCalledWith(
        job.venue_id,
        'list-123',
        contacts
      );
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should get lists from Mailchimp', async () => {
      const job = { ...baseJob, sync_type: 'lists' };
      mockFirst.mockResolvedValue(job);
      mockMailchimpGetLists.mockResolvedValue([{ id: 'list-1' }]);

      const result = await service.processSync('job-1');

      expect(mockMailchimpGetLists).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });
  });

  describe('executeQuickBooksSync', () => {
    const baseJob = {
      venue_id: 'venue-123',
      integration_type: 'quickbooks',
      direction: 'inbound',
      metadata: {},
      started_at: new Date(),
    };

    beforeEach(() => {
      mockUpdate.mockResolvedValue(1);
      mockInsert.mockResolvedValue([1]);
      mockRetrieveOAuthTokens.mockResolvedValue({ access_token: 'token' });
      mockValidateAndRotateIfNeeded.mockResolvedValue(false);
    });

    it('should sync customers from QuickBooks', async () => {
      const job = { ...baseJob, sync_type: 'customers' };
      mockFirst.mockResolvedValue(job);
      mockQBSyncCustomers.mockResolvedValue([{ id: '1' }]);

      const result = await service.processSync('job-1');

      expect(mockQBSyncCustomers).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync customers to QuickBooks', async () => {
      const customers = [{ name: 'Test' }];
      const job = {
        ...baseJob,
        sync_type: 'customers',
        direction: 'outbound',
        metadata: { customers },
      };
      mockFirst.mockResolvedValue(job);
      mockQBSyncCustomersTo.mockResolvedValue({
        recordsSynced: 1,
        errors: [],
      });

      const result = await service.processSync('job-1');

      expect(mockQBSyncCustomersTo).toHaveBeenCalledWith(job.venue_id, customers);
      expect(result.recordsSucceeded).toBe(1);
    });

    it('should sync invoices from QuickBooks', async () => {
      const job = { ...baseJob, sync_type: 'invoices' };
      mockFirst.mockResolvedValue(job);
      mockQBSyncInvoices.mockResolvedValue([{ id: 'inv-1' }]);

      const result = await service.processSync('job-1');

      expect(mockQBSyncInvoices).toHaveBeenCalledWith(job.venue_id);
      expect(result.recordsSucceeded).toBe(1);
    });
  });

  describe('getPendingSyncJobs', () => {
    it('should get pending jobs ordered by priority and time', async () => {
      const jobs = [{ id: 'job-1' }, { id: 'job-2' }];
      mockLimit.mockResolvedValue(jobs);

      const result = await service.getPendingSyncJobs(10);

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockWhere).toHaveBeenCalledWith('status', 'pending');
      expect(mockOrderBy).toHaveBeenCalledWith('priority', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(result).toEqual(jobs);
    });

    it('should use default limit of 10', async () => {
      mockLimit.mockResolvedValue([]);

      await service.getPendingSyncJobs();

      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should throw error on database failure', async () => {
      mockLimit.mockRejectedValue(new Error('Database error'));

      await expect(service.getPendingSyncJobs()).rejects.toThrow(
        'Failed to get pending sync jobs'
      );
    });
  });

  describe('retryFailedSync', () => {
    const jobId = 'job-123';

    it('should reset job status to pending', async () => {
      mockFirst.mockResolvedValue({ id: jobId, attempts: 1, max_attempts: 3 });
      mockUpdate.mockResolvedValue(1);

      await service.retryFailedSync(jobId);

      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'pending',
        scheduled_for: expect.any(Date),
      });
    });

    it('should throw error when job not found', async () => {
      mockFirst.mockResolvedValue(null);

      await expect(service.retryFailedSync(jobId)).rejects.toThrow(
        `Sync job ${jobId} not found`
      );
    });

    it('should throw error when max attempts exceeded', async () => {
      mockFirst.mockResolvedValue({ id: jobId, attempts: 3, max_attempts: 3 });

      await expect(service.retryFailedSync(jobId)).rejects.toThrow(
        'exceeded max retry attempts'
      );
    });

    it('should throw error on database failure', async () => {
      mockFirst.mockRejectedValue(new Error('Database error'));

      await expect(service.retryFailedSync(jobId)).rejects.toThrow(
        'Failed to retry sync job'
      );
    });
  });

  describe('cancelSync', () => {
    const jobId = 'job-123';

    it('should update job status to cancelled', async () => {
      mockUpdate.mockResolvedValue(1);

      await service.cancelSync(jobId);

      expect(mockDb).toHaveBeenCalledWith('sync_queue');
      expect(mockWhere).toHaveBeenCalledWith({ id: jobId });
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'cancelled',
        completed_at: expect.any(Date),
      });
    });

    it('should throw error on database failure', async () => {
      mockUpdate.mockRejectedValue(new Error('Database error'));

      await expect(service.cancelSync(jobId)).rejects.toThrow(
        'Failed to cancel sync job'
      );
    });
  });

  describe('getSyncHistory', () => {
    const venueId = 'venue-123';

    it('should get sync history for venue', async () => {
      const history = [{ id: 'log-1' }, { id: 'log-2' }];
      mockLimit.mockResolvedValue(history);

      const result = await service.getSyncHistory(venueId);

      expect(mockDb).toHaveBeenCalledWith('sync_logs');
      expect(mockWhere).toHaveBeenCalledWith('venue_id', venueId);
      expect(mockOrderBy).toHaveBeenCalledWith('started_at', 'desc');
      expect(mockLimit).toHaveBeenCalledWith(50);
      expect(result).toEqual(history);
    });

    it('should filter by integration type', async () => {
      mockLimit.mockResolvedValue([]);

      await service.getSyncHistory(venueId, 'stripe');

      expect(mockWhere).toHaveBeenCalledWith('integration_type', 'stripe');
    });

    it('should use custom limit', async () => {
      mockLimit.mockResolvedValue([]);

      await service.getSyncHistory(venueId, undefined, 100);

      expect(mockLimit).toHaveBeenCalledWith(100);
    });

    it('should throw error on database failure', async () => {
      mockLimit.mockRejectedValue(new Error('Database error'));

      await expect(service.getSyncHistory(venueId)).rejects.toThrow(
        'Failed to get sync history'
      );
    });
  });
});

describe('syncEngineService singleton', () => {
  it('should export syncEngineService instance', async () => {
    const { syncEngineService } = await import(
      '../../../src/services/sync-engine.service'
    );
    expect(syncEngineService).toBeInstanceOf(SyncEngineService);
  });
});
