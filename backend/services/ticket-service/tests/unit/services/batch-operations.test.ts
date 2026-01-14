// Mock prom-client before imports
jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    dec: jest.fn(),
  })),
}));

// Mock DatabaseService
const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
    getPool: jest.fn(() => mockPool),
  },
}));

// Mock SolanaService
jest.mock('../../../src/services/solanaService', () => ({
  SolanaService: {
    transferNFT: jest.fn(),
  },
}));

// Mock RedisService
jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    getClient: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
    })),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import { BatchOperationsService, batchOperationsService } from '../../../src/services/batch-operations';

describe('BatchOperationsService', () => {
  let service: BatchOperationsService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new BatchOperationsService({
      maxBatchSize: 100,
      maxConcurrency: 5,
      itemTimeoutMs: 30000,
      continueOnError: true,
      retryCount: 2,
      retryDelayMs: 10, // Short delay for tests
    });

    // Reset mocks
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('bulkUpdateTickets', () => {
    it('should update multiple tickets successfully', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const updates = [
        { ticketId: 'ticket-1', status: 'cancelled' },
        { ticketId: 'ticket-2', status: 'cancelled' },
        { ticketId: 'ticket-3', metadata: { note: 'test' } },
      ];

      const result = await service.bulkUpdateTickets('tenant-123', updates, 'actor-1');

      expect(result.success).toBe(true);
      expect(result.totalItems).toBe(3);
      expect(result.processedItems).toBe(3);
      expect(result.failedItems).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should reject batch exceeding max size', async () => {
      const updates = Array(150).fill({ ticketId: 'ticket-1', status: 'cancelled' });

      await expect(
        service.bulkUpdateTickets('tenant-123', updates, 'actor-1')
      ).rejects.toThrow('exceeds maximum');
    });

    it('should handle partial failures with continueOnError', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const updates = [
        { ticketId: 'ticket-1', status: 'cancelled' },
        { ticketId: 'ticket-2', status: 'cancelled' },
        { ticketId: 'ticket-3', status: 'cancelled' },
      ];

      const result = await service.bulkUpdateTickets('tenant-123', updates, 'actor-1');

      expect(result.success).toBe(true); // continueOnError is true
      expect(result.processedItems).toBe(2);
      expect(result.failedItems).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should update ticket with all fields', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const updates = [
        {
          ticketId: 'ticket-1',
          status: 'transferred',
          metadata: { transferredAt: '2024-01-01' },
          ownerId: 'new-owner',
        },
      ];

      await service.bulkUpdateTickets('tenant-123', updates, 'actor-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets SET'),
        expect.arrayContaining(['transferred', 'new-owner', 'ticket-1', 'tenant-123'])
      );
    });
  });

  describe('bulkTransferTickets', () => {
    it('should transfer multiple tickets successfully', async () => {
      // Setup mock for successful transfers
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1', nft_mint: null, status: 'active' }] })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // INSERT transfer record
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({}) // BEGIN (second transfer)
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1', nft_mint: null, status: 'active' }] })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // INSERT transfer record
        .mockResolvedValueOnce({}); // COMMIT

      const transfers = [
        { ticketId: 'ticket-1', fromUserId: 'user-1', toUserId: 'user-2', reason: 'Gift' },
        { ticketId: 'ticket-2', fromUserId: 'user-1', toUserId: 'user-3' },
      ];

      const result = await service.bulkTransferTickets('tenant-123', transfers, 'actor-1');

      expect(result.success).toBe(true);
      expect(result.totalItems).toBe(2);
      expect(result.processedItems).toBe(2);
    });

    it('should reject transfer if user is not owner', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ owner_id: 'different-user', nft_mint: null, status: 'active' }] })
        .mockResolvedValueOnce({}) // ROLLBACK (after error thrown)
        // Retry 1
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ owner_id: 'different-user', nft_mint: null, status: 'active' }] })
        .mockResolvedValueOnce({}) // ROLLBACK
        // Retry 2
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ owner_id: 'different-user', nft_mint: null, status: 'active' }] })
        .mockResolvedValueOnce({}); // ROLLBACK

      const transfers = [
        { ticketId: 'ticket-1', fromUserId: 'user-1', toUserId: 'user-2' },
      ];

      const result = await service.bulkTransferTickets('tenant-123', transfers, 'actor-1');

      expect(result.success).toBe(false);
      expect(result.failedItems).toBe(1);
      expect(result.errors[0].error).toContain('not the owner');
    });

    it('should reject transfer if ticket not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [] }) // No ticket found
        .mockResolvedValueOnce({}) // ROLLBACK
        // Retry 1
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({})
        // Retry 2
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const transfers = [
        { ticketId: 'nonexistent', fromUserId: 'user-1', toUserId: 'user-2' },
      ];

      const result = await service.bulkTransferTickets('tenant-123', transfers, 'actor-1');

      expect(result.failedItems).toBe(1);
      expect(result.errors[0].error).toContain('not found');
    });

    it('should reject transfer of cancelled ticket', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1', nft_mint: null, status: 'cancelled' }] })
        .mockResolvedValueOnce({}) // ROLLBACK
        // Retry 1
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1', nft_mint: null, status: 'cancelled' }] })
        .mockResolvedValueOnce({})
        // Retry 2
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1', nft_mint: null, status: 'cancelled' }] })
        .mockResolvedValueOnce({});

      const transfers = [
        { ticketId: 'ticket-1', fromUserId: 'user-1', toUserId: 'user-2' },
      ];

      const result = await service.bulkTransferTickets('tenant-123', transfers, 'actor-1');

      expect(result.failedItems).toBe(1);
      expect(result.errors[0].error).toContain('Cannot transfer ticket');
    });

    it('should retry failed transfers', async () => {
      // First attempt fails, retry succeeds
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({}) // ROLLBACK
        // Retry 1 - succeeds
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1', nft_mint: null, status: 'active' }] })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      const transfers = [
        { ticketId: 'ticket-1', fromUserId: 'user-1', toUserId: 'user-2' },
      ];

      const result = await service.bulkTransferTickets('tenant-123', transfers, 'actor-1');

      expect(result.success).toBe(true);
      expect(result.results[0].retries).toBeGreaterThan(0);
    });
  });

  describe('cancelEventTickets', () => {
    it('should cancel all active tickets for an event', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'ticket-1' }, { id: 'ticket-2' }, { id: 'ticket-3' }]
        })
        .mockResolvedValue({ rows: [], rowCount: 1 }); // For individual updates and record insert

      const result = await service.cancelEventTickets(
        'tenant-123',
        'event-456',
        'Event cancelled due to weather',
        'admin-1'
      );

      expect(result.totalItems).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO event_cancellations'),
        expect.arrayContaining(['event-456', 'tenant-123', 'Event cancelled due to weather'])
      );
    });

    it('should handle event with no active tickets', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await service.cancelEventTickets(
        'tenant-123',
        'event-456',
        'Cancelled',
        'admin-1'
      );

      expect(result.totalItems).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('bulkValidateTickets', () => {
    it('should validate multiple tickets', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'ticket-1', status: 'active', event_id: 'event-1', scan_count: 0 },
            { id: 'ticket-2', status: 'active', event_id: 'event-1', scan_count: 0 },
          ]
        })
        .mockResolvedValue({ rows: [] }); // For scan inserts and updates

      const result = await service.bulkValidateTickets(
        'tenant-123',
        ['ticket-1', 'ticket-2'],
        'Gate A',
        'scanner-1'
      );

      expect(result.success).toBe(true);
      expect(result.totalItems).toBe(2);
      expect(result.results[0].result?.valid).toBe(true);
      expect(result.results[1].result?.valid).toBe(true);
    });

    it('should reject already used ticket', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'ticket-1', status: 'used', event_id: 'event-1', scan_count: 1 },
        ]
      });

      const result = await service.bulkValidateTickets(
        'tenant-123',
        ['ticket-1'],
        'Gate A',
        'scanner-1'
      );

      expect(result.results[0].result?.valid).toBe(false);
      expect(result.results[0].result?.reason).toContain('already used');
    });

    it('should reject cancelled ticket', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'ticket-1', status: 'cancelled', event_id: 'event-1', scan_count: 0 },
        ]
      });

      const result = await service.bulkValidateTickets(
        'tenant-123',
        ['ticket-1'],
        'Gate A',
        'scanner-1'
      );

      expect(result.results[0].result?.valid).toBe(false);
      expect(result.results[0].result?.reason).toContain('cancelled');
    });

    it('should reject expired ticket', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'ticket-1', status: 'expired', event_id: 'event-1', scan_count: 0 },
        ]
      });

      const result = await service.bulkValidateTickets(
        'tenant-123',
        ['ticket-1'],
        'Gate A',
        'scanner-1'
      );

      expect(result.results[0].result?.valid).toBe(false);
      expect(result.results[0].result?.reason).toContain('expired');
    });

    it('should reject already scanned ticket', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'ticket-1', status: 'active', event_id: 'event-1', scan_count: 1 },
        ]
      });

      const result = await service.bulkValidateTickets(
        'tenant-123',
        ['ticket-1'],
        'Gate A',
        'scanner-1'
      );

      expect(result.results[0].result?.valid).toBe(false);
      expect(result.results[0].result?.reason).toContain('already scanned');
    });

    it('should handle ticket not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.bulkValidateTickets(
        'tenant-123',
        ['nonexistent'],
        'Gate A',
        'scanner-1'
      );

      expect(result.results[0].result?.valid).toBe(false);
      expect(result.results[0].result?.reason).toContain('not found');
    });
  });

  describe('getActiveOperations', () => {
    it('should return empty array when no operations', () => {
      const ops = service.getActiveOperations();
      expect(ops).toEqual([]);
    });
  });

  describe('singleton instance', () => {
    it('should export batchOperationsService singleton', () => {
      expect(batchOperationsService).toBeInstanceOf(BatchOperationsService);
    });
  });
});
