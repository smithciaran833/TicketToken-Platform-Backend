/**
 * Unit Tests for Transaction Timeout Service
 * 
 * Tests automatic timeout detection, transaction handling, and statistics.
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../../src/services/metrics.service', () => ({
  metricsService: {
    paymentTotal: {
      inc: jest.fn(),
    },
  },
}));

import { TransactionTimeoutService, TimeoutConfig, TimeoutResult } from '../../../src/services/transaction-timeout.service';
import { metricsService } from '../../../src/services/metrics.service';

describe('TransactionTimeoutService', () => {
  let service: TransactionTimeoutService;
  let mockPool: any;
  let mockClient: any;

  const defaultConfig: TimeoutConfig = {
    pendingTimeoutMinutes: 15,
    processingTimeoutMinutes: 5,
    checkIntervalMinutes: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    // Create mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    service = new TransactionTimeoutService(mockPool, defaultConfig);
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config values', () => {
      const serviceWithDefaults = new TransactionTimeoutService(mockPool);
      
      expect((serviceWithDefaults as any).config).toEqual({
        pendingTimeoutMinutes: 15,
        processingTimeoutMinutes: 5,
        checkIntervalMinutes: 1,
      });
    });

    it('should allow custom config values', () => {
      const customConfig = {
        pendingTimeoutMinutes: 30,
        processingTimeoutMinutes: 10,
        checkIntervalMinutes: 2,
      };
      
      const customService = new TransactionTimeoutService(mockPool, customConfig);
      
      expect((customService as any).config).toEqual(customConfig);
    });

    it('should merge partial config with defaults', () => {
      const partialConfig = {
        pendingTimeoutMinutes: 20,
      };
      
      const partialService = new TransactionTimeoutService(mockPool, partialConfig);
      
      expect((partialService as any).config).toEqual({
        pendingTimeoutMinutes: 20,
        processingTimeoutMinutes: 5,
        checkIntervalMinutes: 1,
      });
    });
  });

  describe('start', () => {
    it('should run timeout check immediately when started', () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      service.start();

      // Advance past the initial check
      jest.advanceTimersByTime(0);

      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should schedule periodic checks', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      service.start();

      // Clear initial call
      jest.advanceTimersByTime(0);
      const initialCalls = mockPool.query.mock.calls.length;

      // Advance by one interval
      jest.advanceTimersByTime(60000); // 1 minute

      expect(mockPool.query.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it('should not start twice if already running', () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      service.start();
      service.start(); // Second call should be ignored

      jest.advanceTimersByTime(0);

      // Should only have initial queries, not doubled
      expect(mockPool.query.mock.calls.length).toBe(2); // pending + processing queries
    });
  });

  describe('stop', () => {
    it('should clear the interval when stopped', () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      service.start();
      service.stop();

      const queryCountAfterStop = mockPool.query.mock.calls.length;

      // Advance time significantly
      jest.advanceTimersByTime(300000); // 5 minutes

      // Query count should not have increased
      expect(mockPool.query.mock.calls.length).toBe(queryCountAfterStop);
    });

    it('should handle stop when not running', () => {
      // Should not throw
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('checkTimeouts', () => {
    it('should return empty result when no timeouts found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.checkTimeouts();

      expect(result).toEqual({
        timedOutCount: 0,
        releasedInventoryCount: 0,
        notifiedUserCount: 0,
        errors: [],
      });
    });

    it('should process pending timeouts', async () => {
      const pendingTransaction = {
        transaction_id: 'txn-pending-123',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        amount_cents: 10000,
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
        payment_method: 'card',
        has_reserved_inventory: false,
        user_email: 'user@example.com',
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [pendingTransaction] }) // Find pending
        .mockResolvedValueOnce({ rows: [] }); // Find processing

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE transaction
        .mockResolvedValueOnce({}) // INSERT notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.checkTimeouts();

      expect(result.timedOutCount).toBe(1);
      expect(result.notifiedUserCount).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should release inventory for transactions with reservations', async () => {
      const transactionWithInventory = {
        transaction_id: 'txn-inventory-123',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        amount_cents: 15000,
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        payment_method: 'card',
        has_reserved_inventory: true,
        user_email: 'user@example.com',
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transactionWithInventory] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE transaction
        .mockResolvedValueOnce({}) // UPDATE inventory_reservations
        .mockResolvedValueOnce({}) // UPDATE tickets
        .mockResolvedValueOnce({}) // INSERT notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.checkTimeouts();

      expect(result.releasedInventoryCount).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE inventory_reservations'),
        expect.any(Array)
      );
    });

    it('should process both pending and processing timeouts', async () => {
      const pendingTxn = {
        transaction_id: 'txn-pending',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: false,
      };

      const processingTxn = {
        transaction_id: 'txn-processing',
        tenant_id: 'tenant-1',
        user_id: 'user-2',
        status: 'processing',
        created_at: new Date(Date.now() - 10 * 60 * 1000),
        has_reserved_inventory: true,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [pendingTxn] })
        .mockResolvedValueOnce({ rows: [processingTxn] });

      // Mock for first transaction
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // INSERT notification
        .mockResolvedValueOnce({}) // COMMIT
        // Mock for second transaction
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // UPDATE inventory
        .mockResolvedValueOnce({}) // UPDATE tickets
        .mockResolvedValueOnce({}) // INSERT notification
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.checkTimeouts();

      expect(result.timedOutCount).toBe(2);
      expect(result.releasedInventoryCount).toBe(1);
    });

    it('should handle errors for individual transactions', async () => {
      const transaction = {
        transaction_id: 'txn-error',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: false,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transaction] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // UPDATE fails

      const result = await service.checkTimeouts();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('txn-error');
      expect(result.errors[0]).toContain('Database error');
    });

    it('should record metrics after processing', async () => {
      const transaction = {
        transaction_id: 'txn-metrics',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: false,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transaction] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query.mockResolvedValue({});

      await service.checkTimeouts();

      expect(metricsService.paymentTotal.inc).toHaveBeenCalledWith(
        { status: 'timeout', payment_method: 'timeout_cleanup' },
        1
      );
    });

    it('should handle database query errors gracefully', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'));

      const result = await service.checkTimeouts();

      expect(result.errors).toContain('Timeout check process failed');
    });
  });

  describe('timeoutTransaction', () => {
    it('should manually timeout a pending transaction', async () => {
      const transaction = {
        transaction_id: 'txn-manual',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 5 * 60 * 1000),
        has_reserved_inventory: false,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [transaction] });
      mockClient.query.mockResolvedValue({});

      const result = await service.timeoutTransaction('txn-manual', 'Manual timeout by admin');

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error for non-existent transaction', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.timeoutTransaction('txn-not-found', 'Test')
      ).rejects.toThrow('Transaction not found');
    });

    it('should throw error for invalid transaction status', async () => {
      const completedTransaction = {
        transaction_id: 'txn-completed',
        status: 'completed',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [completedTransaction] });

      await expect(
        service.timeoutTransaction('txn-completed', 'Test')
      ).rejects.toThrow('Cannot timeout transaction in status: completed');
    });

    it('should allow timeout of processing transactions', async () => {
      const processingTransaction = {
        transaction_id: 'txn-processing',
        status: 'processing',
        has_reserved_inventory: false,
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValueOnce({ rows: [processingTransaction] });
      mockClient.query.mockResolvedValue({});

      const result = await service.timeoutTransaction('txn-processing', 'Stuck in processing');

      expect(result).toBe(true);
    });

    it('should reject timeout of failed transactions', async () => {
      const failedTransaction = {
        transaction_id: 'txn-failed',
        status: 'failed',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [failedTransaction] });

      await expect(
        service.timeoutTransaction('txn-failed', 'Test')
      ).rejects.toThrow('Cannot timeout transaction in status: failed');
    });

    it('should reject timeout of refunded transactions', async () => {
      const refundedTransaction = {
        transaction_id: 'txn-refunded',
        status: 'refunded',
      };

      mockPool.query.mockResolvedValueOnce({ rows: [refundedTransaction] });

      await expect(
        service.timeoutTransaction('txn-refunded', 'Test')
      ).rejects.toThrow('Cannot timeout transaction in status: refunded');
    });
  });

  describe('getTimeoutStatistics', () => {
    it('should return timeout statistics for a tenant', async () => {
      const mockStats = [
        {
          total_timeouts: '10',
          total_amount_cents: '500000',
          avg_duration_minutes: '18.5',
          pending_timeouts: '7',
          processing_timeouts: '3',
          payment_method: 'card',
          count: '10',
        },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockStats });

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-10');

      const result = await service.getTimeoutStatistics('tenant-1', startDate, endDate);

      expect(result).toEqual(mockStats);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['tenant-1', startDate, endDate]
      );
    });

    it('should return empty array when no timeouts exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getTimeoutStatistics(
        'tenant-no-timeouts',
        new Date('2026-01-01'),
        new Date('2026-01-10')
      );

      expect(result).toEqual([]);
    });

    it('should group statistics by payment method', async () => {
      const mockStats = [
        { payment_method: 'card', count: '5' },
        { payment_method: 'bank_transfer', count: '3' },
        { payment_method: 'wallet', count: '2' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockStats });

      const result = await service.getTimeoutStatistics(
        'tenant-1',
        new Date('2026-01-01'),
        new Date('2026-01-10')
      );

      expect(result).toHaveLength(3);
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback on transaction update failure', async () => {
      const transaction = {
        transaction_id: 'txn-rollback',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: false,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transaction] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Update failed')) // UPDATE fails
        .mockResolvedValueOnce({}); // ROLLBACK

      await service.checkTimeouts();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client connection after success', async () => {
      const transaction = {
        transaction_id: 'txn-success',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: false,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transaction] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query.mockResolvedValue({});

      await service.checkTimeouts();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Query Construction', () => {
    it('should use correct timeout duration for pending transactions', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.checkTimeouts();

      const pendingQuery = mockPool.query.mock.calls[0][0];
      expect(pendingQuery).toContain('15 minutes');
      expect(pendingQuery).toContain("status = $1");
    });

    it('should use correct timeout duration for processing transactions', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.checkTimeouts();

      const processingQuery = mockPool.query.mock.calls[1][0];
      expect(processingQuery).toContain('5 minutes');
    });

    it('should limit results to 100 transactions per batch', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.checkTimeouts();

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('LIMIT 100');
    });

    it('should only find unhandled timeouts', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.checkTimeouts();

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('timeout_handled = false');
    });
  });

  describe('Inventory Release', () => {
    it('should update inventory reservations correctly', async () => {
      const transaction = {
        transaction_id: 'txn-inventory',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: true,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transaction] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query.mockResolvedValue({});

      await service.checkTimeouts();

      // Verify inventory update query
      const inventoryQuery = mockClient.query.mock.calls.find(
        (call: any) => call[0].includes('inventory_reservations')
      );
      expect(inventoryQuery).toBeDefined();
      expect(inventoryQuery[0]).toContain("status = 'released'");
      expect(inventoryQuery[0]).toContain("release_reason = 'transaction_timeout'");
    });

    it('should update ticket status when inventory released', async () => {
      const transaction = {
        transaction_id: 'txn-tickets',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: true,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transaction] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query.mockResolvedValue({});

      await service.checkTimeouts();

      const ticketQuery = mockClient.query.mock.calls.find(
        (call: any) => call[0].includes('UPDATE tickets')
      );
      expect(ticketQuery).toBeDefined();
      expect(ticketQuery[0]).toContain("status = 'available'");
    });
  });

  describe('Notification Creation', () => {
    it('should create notification record for timed out transactions', async () => {
      const transaction = {
        transaction_id: 'txn-notify',
        tenant_id: 'tenant-123',
        user_id: 'user-456',
        status: 'pending',
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        has_reserved_inventory: false,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [transaction] })
        .mockResolvedValueOnce({ rows: [] });

      mockClient.query.mockResolvedValue({});

      await service.checkTimeouts();

      const notificationQuery = mockClient.query.mock.calls.find(
        (call: any) => call[0].includes('payment_notifications')
      );
      expect(notificationQuery).toBeDefined();
      expect(notificationQuery[1]).toContain('tenant-123');
      expect(notificationQuery[1]).toContain('user-456');
      expect(notificationQuery[1]).toContain('txn-notify');
    });
  });
});
