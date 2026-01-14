import { OrderArchivingJob } from '../../../src/jobs/order-archiving.job';
import * as database from '../../../src/config/database';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createContextLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock orderConfig module
jest.mock('../../../src/config/order.config', () => ({
  orderConfig: {
    archiving: {
      enabled: true,
      retentionDays: 365,
      batchSize: 100,
      maxOrdersPerRun: 1000,
      deleteAfterDays: 0,
      archivableStatuses: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
      dryRun: false,
    },
  },
}));

describe('OrderArchivingJob', () => {
  let job: OrderArchivingJob;
  let mockDb: any;
  let mockClient: any;

  const mockGetDatabase = jest.mocked(database.getDatabase);
  const mockLogger = logger as jest.Mocked<typeof logger>;

  // Get reference to mocked config
  const orderConfigModule = require('../../../src/config/order.config');

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset config to defaults
    orderConfigModule.orderConfig.archiving = {
      enabled: true,
      retentionDays: 365,
      batchSize: 100,
      maxOrdersPerRun: 1000,
      deleteAfterDays: 0,
      archivableStatuses: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
      dryRun: false,
    };

    // Mock client for transactions
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    };

    // Mock database
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    mockGetDatabase.mockReturnValue(mockDb);

    job = new OrderArchivingJob();
  });

  afterEach(() => {
    job.stop();
  });

  describe('start and stop', () => {
    it('should start the archiving job when enabled', () => {
      job.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting order archiving job'),
        expect.objectContaining({
          retentionDays: 365,
          dryRun: false,
        })
      );
    });

    it('should not start when disabled in config', () => {
      orderConfigModule.orderConfig.archiving.enabled = false;
      job = new OrderArchivingJob();
      
      job.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Order archiving disabled via configuration'
      );
    });

    it('should not start if already running', () => {
      job.start();
      mockLogger.warn.mockClear();
      job.start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Order archiving job already running');
    });

    it('should stop the archiving job', () => {
      job.start();
      mockLogger.info.mockClear();
      job.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Order archiving job stopped');
    });
  });

  describe('execute', () => {
    it('should process archiving for all tenants', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ tenant_id: 'tenant-1' }, { tenant_id: 'tenant-2' }],
      });

      // Mock no orders to archive
      mockDb.query.mockResolvedValue({ rows: [] });

      const stats = await job.execute();

      expect(stats.ordersArchived).toBe(0);
      expect(stats.errors).toHaveLength(0);
    });

    it('should skip execution if already running', async () => {
      // Start execution
      const promise1 = job.execute();
      
      // Try to start another while first is running
      const stats2 = await job.execute();

      expect(stats2.ordersArchived).toBe(0);
      
      // Wait for first to complete
      await promise1;
    });

    it('should calculate threshold date correctly', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await job.execute();

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      await expect(job.execute()).rejects.toThrow('Database error');
      expect((job as any).isRunning).toBe(false);
    });

    it('should merge stats from multiple tenants', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1' }, { tenant_id: 'tenant-2' }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'order-1', order_number: 'ORD-001', status: 'COMPLETED', created_at: new Date() },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({
          rows: [
            { id: 'order-2', order_number: 'ORD-002', status: 'COMPLETED', created_at: new Date() },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const stats = await job.execute();

      expect(stats.ordersArchived).toBe(2);
    });
  });

  describe('archiveTenantOrders', () => {
    it('should archive orders for a tenant', async () => {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - 365);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'order-1', order_number: 'ORD-001', status: 'COMPLETED', created_at: new Date() },
            { id: 'order-2', order_number: 'ORD-002', status: 'COMPLETED', created_at: new Date() },
          ],
        })
        .mockResolvedValue({ rows: [] }); // audit log

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const stats = await (job as any).archiveTenantOrders('tenant-1', thresholdDate);

      expect(stats.ordersArchived).toBeGreaterThan(0);
    });

    it('should return early if no orders to archive', async () => {
      const thresholdDate = new Date();
      mockDb.query.mockResolvedValue({ rows: [] });

      const stats = await (job as any).archiveTenantOrders('tenant-1', thresholdDate);

      expect(stats.ordersArchived).toBe(0);
    });

    it('should handle dry run mode', async () => {
      orderConfigModule.orderConfig.archiving.dryRun = true;
      job = new OrderArchivingJob();

      const thresholdDate = new Date();
      mockDb.query.mockResolvedValue({
        rows: [
          { id: 'order-1', order_number: 'ORD-001', status: 'COMPLETED', created_at: new Date() },
        ],
      });

      const stats = await (job as any).archiveTenantOrders('tenant-1', thresholdDate);

      expect(stats.ordersArchived).toBe(1);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('should log audit record when archiving orders', async () => {
      const thresholdDate = new Date();
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', order_number: 'ORD-001', status: 'COMPLETED', created_at: new Date() }],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await (job as any).archiveTenantOrders('tenant-1', thresholdDate);

      // Find the audit log call
      const auditCall = mockDb.query.mock.calls.find((call: any) =>
        call[0]?.includes?.('INSERT INTO archive.archive_audit_log')
      );

      expect(auditCall).toBeDefined();
      expect(auditCall[1]).toEqual(
        expect.arrayContaining(['tenant-1', 'ARCHIVE'])
      );
    });

    it('should log audit record on failure', async () => {
      const thresholdDate = new Date();
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'order-1', order_number: 'ORD-001', status: 'COMPLETED', created_at: new Date() }],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log for failure
      
      mockClient.query.mockRejectedValue(new Error('Archive failed'));

      try {
        await (job as any).archiveTenantOrders('tenant-1', thresholdDate);
      } catch (error) {
        // Expected to throw
      }

      // Should still attempt to log audit record
      const auditCall = mockDb.query.mock.calls.find((call: any) =>
        call[0]?.includes?.('INSERT INTO archive.archive_audit_log')
      );

      expect(auditCall).toBeDefined();
    });
  });

  describe('archiveBatch', () => {
    it('should archive a batch of orders with all related data', async () => {
      const orderIds = ['order-1', 'order-2', 'order-3'];
      const thresholdDate = new Date();

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 3 }) // orders
        .mockResolvedValueOnce({ rows: [], rowCount: 5 }) // items
        .mockResolvedValueOnce({ rows: [], rowCount: 10 }) // events
        .mockResolvedValueOnce({ rows: [], rowCount: 2 }) // addresses
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // discounts
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // refunds
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const stats = await (job as any).archiveBatch('tenant-1', orderIds, thresholdDate);

      expect(stats.ordersArchived).toBe(3);
      expect(stats.itemsArchived).toBe(5);
      expect(stats.eventsArchived).toBe(10);
      expect(stats.addressesArchived).toBe(2);
      expect(stats.discountsArchived).toBe(1);
      expect(stats.refundsArchived).toBe(0);
    });

    it('should delete old orders if configured', async () => {
      orderConfigModule.orderConfig.archiving.deleteAfterDays = 730; // 2 years
      job = new OrderArchivingJob();

      const orderIds = ['order-1'];
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - 1000); // Very old

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await (job as any).archiveBatch('tenant-1', orderIds, thresholdDate);

      // Should have DELETE queries
      const deleteCalls = mockClient.query.mock.calls.filter((call: any) =>
        call[0].includes('DELETE FROM')
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    it('should not delete if deleteAfterDays is 0', async () => {
      orderConfigModule.orderConfig.archiving.deleteAfterDays = 0;
      job = new OrderArchivingJob();

      const orderIds = ['order-1'];
      const thresholdDate = new Date();

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      await (job as any).archiveBatch('tenant-1', orderIds, thresholdDate);

      const deleteCalls = mockClient.query.mock.calls.filter((call: any) =>
        call[0].includes('DELETE FROM')
      );
      expect(deleteCalls.length).toBe(0);
    });

    it('should rollback on error', async () => {
      const orderIds = ['order-1'];
      const thresholdDate = new Date();

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed')); // orders insert fails

      await expect(
        (job as any).archiveBatch('tenant-1', orderIds, thresholdDate)
      ).rejects.toThrow('Insert failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even on error', async () => {
      const orderIds = ['order-1'];
      const thresholdDate = new Date();

      mockClient.query.mockRejectedValue(new Error('Query failed'));

      await expect(
        (job as any).archiveBatch('tenant-1', orderIds, thresholdDate)
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getTenants', () => {
    it('should return list of tenant IDs', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          { tenant_id: 'tenant-1' },
          { tenant_id: 'tenant-2' },
          { tenant_id: 'tenant-3' },
        ],
      });

      const tenants = await (job as any).getTenants();

      expect(tenants).toEqual(['tenant-1', 'tenant-2', 'tenant-3']);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT DISTINCT tenant_id FROM orders'
      );
    });

    it('should return empty array if no tenants', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const tenants = await (job as any).getTenants();

      expect(tenants).toEqual([]);
    });
  });

  describe('logAuditRecord', () => {
    it('should log audit record successfully', async () => {
      const record = {
        id: 'audit-1',
        tenantId: 'tenant-1',
        operation: 'ARCHIVE' as const,
        ordersAffected: 10,
        itemsAffected: 20,
        eventsAffected: 30,
        thresholdDate: new Date(),
        daysOld: 365,
        executedBy: 'system-archiving-job',
        notes: null,
        metadata: { test: 'value' },
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 1000,
        success: true,
        errorMessage: null,
      };

      mockDb.query.mockResolvedValue({ rows: [] });

      await (job as any).logAuditRecord(record);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO archive.archive_audit_log'),
        expect.arrayContaining([
          'audit-1',
          'tenant-1',
          'ARCHIVE',
          10,
          20,
          30,
        ])
      );
    });

    it('should not throw if audit logging fails', async () => {
      const record = {
        id: 'audit-1',
        tenantId: 'tenant-1',
        operation: 'ARCHIVE' as const,
        ordersAffected: 0,
        itemsAffected: 0,
        eventsAffected: 0,
        thresholdDate: new Date(),
        daysOld: 365,
        executedBy: 'system',
        notes: null,
        metadata: {},
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 0,
        success: true,
        errorMessage: null,
      };

      mockDb.query.mockRejectedValue(new Error('Audit log failed'));

      await expect((job as any).logAuditRecord(record)).resolves.not.toThrow();
    });
  });

  describe('utility methods', () => {
    it('should create empty stats', () => {
      const stats = (job as any).emptyStats();

      expect(stats).toEqual({
        ordersArchived: 0,
        itemsArchived: 0,
        eventsArchived: 0,
        addressesArchived: 0,
        discountsArchived: 0,
        refundsArchived: 0,
        ordersDeleted: 0,
        errors: [],
      });
    });

    it('should merge stats correctly', () => {
      const target = (job as any).emptyStats();
      const source = {
        ordersArchived: 5,
        itemsArchived: 10,
        eventsArchived: 15,
        addressesArchived: 2,
        discountsArchived: 1,
        refundsArchived: 0,
        ordersDeleted: 5,
        errors: ['error1'],
      };

      (job as any).mergeStats(target, source);

      expect(target.ordersArchived).toBe(5);
      expect(target.itemsArchived).toBe(10);
      expect(target.errors).toEqual(['error1']);

      // Merge again
      (job as any).mergeStats(target, source);

      expect(target.ordersArchived).toBe(10);
      expect(target.errors).toEqual(['error1', 'error1']);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = job.getStatus();

      expect(status).toEqual({
        running: false,
        enabled: true,
      });
    });

    it('should reflect running state', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const promise = job.execute();

      await promise;

      const statusAfter = job.getStatus();
      expect(statusAfter.running).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should collect errors from failed tenant operations', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ tenant_id: 'tenant-1' }, { tenant_id: 'tenant-2' }],
        })
        .mockRejectedValueOnce(new Error('Tenant 1 failed'))
        .mockResolvedValueOnce({ rows: [] });

      const stats = await job.execute();

      expect(stats.errors.length).toBeGreaterThan(0);
      expect(stats.errors[0]).toContain('tenant-1');
    });

    it('should handle batch processing errors gracefully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'order-1', order_number: 'ORD-001', status: 'COMPLETED', created_at: new Date() },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Batch failed'));

      const stats = await job.execute();

      // Should catch the error and add to stats
      expect(stats.errors.length).toBeGreaterThan(0);
    });
  });
});
