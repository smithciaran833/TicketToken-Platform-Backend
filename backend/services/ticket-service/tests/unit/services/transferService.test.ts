/**
 * Unit Tests for src/services/transferService.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const mockQuery = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
    transaction: mockTransaction,
  },
}));

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    del: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/services/queueService', () => ({
  QueueService: {
    publish: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    rabbitmq: {
      queues: {
        ticketEvents: 'ticket.events',
        notifications: 'notifications',
      },
    },
  },
}));

import { TransferService, transferService } from '../../../src/services/transferService';

describe('services/transferService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTransferRequest()', () => {
    it('returns invalid when transferring to self', async () => {
      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-1'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('yourself');
    });

    it('returns invalid when recipient not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // cooldown check
        .mockResolvedValueOnce({ rows: [{ transfer_count: 0 }] }) // rate limit
        .mockResolvedValueOnce({ rows: [] }); // recipient not found

      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-2'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('returns invalid when recipient account is not active', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ transfer_count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ account_status: 'SUSPENDED', can_receive_transfers: true, email_verified: true }] });

      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-2'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not active');
    });

    it('returns invalid when recipient cannot receive transfers', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ transfer_count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ account_status: 'ACTIVE', can_receive_transfers: false, email_verified: true }] });

      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-2'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('cannot receive');
    });

    it('returns invalid when ticket is non-transferable', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ transfer_count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ account_status: 'ACTIVE', can_receive_transfers: true, email_verified: true }] })
        .mockResolvedValueOnce({ rows: [{ status: 'active', is_transferable: false }] });

      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-2'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('non-transferable');
    });

    it('returns valid when all checks pass', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no recent transfers
        .mockResolvedValueOnce({ rows: [{ transfer_count: 0 }] }) // under rate limit
        .mockResolvedValueOnce({ rows: [{ account_status: 'ACTIVE', can_receive_transfers: true, email_verified: true }] })
        .mockResolvedValueOnce({ rows: [{ status: 'active', is_transferable: true }] });

      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-2'
      );

      expect(result.valid).toBe(true);
    });

    it('enforces cooldown period', async () => {
      const recentTransfer = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      mockQuery.mockResolvedValueOnce({ rows: [{ transferred_at: recentTransfer }] });

      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-2'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('wait');
    });

    it('enforces daily transfer limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ transfer_count: 10 }] }); // at limit

      const result = await transferService.validateTransferRequest(
        'ticket-123',
        'user-1',
        'user-2'
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('limit');
    });
  });

  describe('getTransferHistory()', () => {
    it('returns transfer history for ticket', async () => {
      const mockHistory = [
        { id: 'transfer-1', ticketId: 'ticket-123', fromUserId: 'user-1', toUserId: 'user-2' },
        { id: 'transfer-2', ticketId: 'ticket-123', fromUserId: 'user-2', toUserId: 'user-3' },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockHistory });

      const result = await transferService.getTransferHistory('ticket-123');

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ticket_transfers'),
        ['ticket-123']
      );
    });

    it('returns empty array when no history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await transferService.getTransferHistory('ticket-123');

      expect(result).toEqual([]);
    });
  });
});
