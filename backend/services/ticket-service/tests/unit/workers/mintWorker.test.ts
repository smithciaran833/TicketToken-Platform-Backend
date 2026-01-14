// Mock DatabaseService - need to reset for each test
let mockClientQuery: jest.Mock;
let mockClientRelease: jest.Mock;
let mockClient: any;
let mockPoolQuery: jest.Mock;

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn(() => ({
      connect: jest.fn().mockImplementation(() => Promise.resolve(mockClient)),
      query: mockPoolQuery,
    })),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-ticket-uuid'),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => ({
    toString: jest.fn(() => 'ABCD1234'),
  })),
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

import { MintWorker } from '../../../src/workers/mintWorker';

describe('MintWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockClientQuery = jest.fn();
    mockClientRelease = jest.fn();
    mockPoolQuery = jest.fn();
    mockClient = {
      query: mockClientQuery,
      release: mockClientRelease,
    };
  });

  describe('processMintJob', () => {
    const mockJob = {
      orderId: 'order-123',
      userId: 'user-456',
      eventId: 'event-789',
      quantity: 2,
      timestamp: new Date().toISOString(),
    };

    it('should process mint job successfully', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        }) // SELECT order
        .mockResolvedValue({}); // All other queries

      const result = await MintWorker.processMintJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.tickets).toHaveLength(2);
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should create tickets with NFT metadata', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        })
        .mockResolvedValue({});

      await MintWorker.processMintJob(mockJob);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tickets'),
        expect.arrayContaining([
          'mock-ticket-uuid',
          'tenant-123',
          'user-456',
        ])
      );
    });

    it('should update order status to COMPLETED', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        })
        .mockResolvedValue({});

      await MintWorker.processMintJob(mockJob);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE orders SET status = 'COMPLETED'"),
        ['order-123']
      );
    });

    it('should write to outbox', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        })
        .mockResolvedValue({});

      await MintWorker.processMintJob(mockJob);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.arrayContaining([
          'order-123',
          'order',
          'order.completed',
        ])
      );
    });

    it('should rollback on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        })
        .mockResolvedValueOnce({}) // First insert succeeds
        .mockRejectedValueOnce(new Error('Database error')); // Second insert fails

      await expect(MintWorker.processMintJob(mockJob)).rejects.toThrow('Database error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw if order not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // No order

      await expect(MintWorker.processMintJob(mockJob)).rejects.toThrow('Order not found');
    });

    it('should throw if no ticket type found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: null,
          }],
        });

      await expect(MintWorker.processMintJob(mockJob)).rejects.toThrow('No ticket type found');
    });

    it('should throw if no tenant found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: null,
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        });

      await expect(MintWorker.processMintJob(mockJob)).rejects.toThrow('No tenant found');
    });

    it('should use provided ticketTypeId if available', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'db-type-id',
          }],
        })
        .mockResolvedValue({});

      const jobWithType = {
        ...mockJob,
        ticketTypeId: 'provided-type-id',
      };

      await MintWorker.processMintJob(jobWithType);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tickets'),
        expect.arrayContaining(['provided-type-id'])
      );
    });

    it('should use provided tenantId if available', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'db-tenant-id',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        })
        .mockResolvedValue({});

      const jobWithTenant = {
        ...mockJob,
        tenantId: 'provided-tenant-id',
      };

      await MintWorker.processMintJob(jobWithTenant);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tickets'),
        expect.arrayContaining(['provided-tenant-id'])
      );
    });

    it('should handle mint failure and update order status', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        })
        .mockRejectedValueOnce(new Error('Mint failed'));

      mockPoolQuery.mockResolvedValue({});

      await expect(MintWorker.processMintJob(mockJob)).rejects.toThrow('Mint failed');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE orders SET status = 'MINT_FAILED'"),
        ['order-123']
      );

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO outbox'),
        expect.arrayContaining([
          'order-123',
          'order',
          'order.mint_failed',
        ])
      );
    });

    it('should release client on success', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            tenant_id: 'tenant-123',
            event_id: 'event-456',
            ticket_type_id: 'type-789',
          }],
        })
        .mockResolvedValue({});

      await MintWorker.processMintJob(mockJob);

      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should release client on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Error'));

      mockPoolQuery.mockResolvedValue({});

      await expect(MintWorker.processMintJob(mockJob)).rejects.toThrow();

      expect(mockClientRelease).toHaveBeenCalled();
    });
  });
});
