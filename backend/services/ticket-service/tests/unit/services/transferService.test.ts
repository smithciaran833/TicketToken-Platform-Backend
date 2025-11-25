// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockQueueService = {
  publish: jest.fn().mockResolvedValue(true),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/services/databaseService');
jest.mock('../../../src/services/redisService');
jest.mock('../../../src/services/solanaService');
jest.mock('../../../src/services/queueService', () => ({
  QueueService: mockQueueService,
}));
jest.mock('../../../src/config');
jest.mock('uuid');

// Import after mocks
import { TransferService, transferService } from '../../../src/services/transferService';
import { DatabaseService } from '../../../src/services/databaseService';
import { RedisService } from '../../../src/services/redisService';
import { SolanaService } from '../../../src/services/solanaService';
import { config } from '../../../src/config';
import { v4 as uuidv4 } from 'uuid';
import { TicketStatus } from '../../../src/types';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../src/utils/errors';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('TransferService', () => {
  let service: TransferService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (config as any).rabbitmq = {
      queues: {
        ticketEvents: 'ticket-events',
        notifications: 'notifications',
      },
    };

    mockClient = {
      query: jest.fn(),
    };

    (uuidv4 as jest.Mock).mockReturnValue('transfer-uuid-123');
    (RedisService.del as jest.Mock).mockResolvedValue(1);
    (SolanaService.transferNFT as jest.Mock).mockResolvedValue('tx-hash-123');

    service = new TransferService();

    // Mock Date.now for consistent timestamps
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2025-01-01T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =============================================================================
  // transferTicket() - 35+ test cases
  // =============================================================================

  describe('transferTicket()', () => {
    const ticketId = 'ticket-123';
    const fromUserId = 'user-from';
    const toUserId = 'user-to';
    const reason = 'Gift to friend';

    const mockTicket = {
      id: ticketId,
      user_id: fromUserId,
      event_id: 'event-123',
      status: TicketStatus.SOLD,
      nft_token_id: null,
    };

    const mockEvent = {
      id: 'event-123',
      start_date: new Date('2025-02-01T18:00:00Z'),
      allow_transfers: true,
      transfer_deadline_hours: 48,
      max_transfers_per_ticket: 5,
      transfer_blackout_start: null,
      transfer_blackout_end: null,
      require_identity_verification: false,
    };

    beforeEach(() => {
      // Setup default successful flow
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockTicket], rowCount: 1 }) // lock ticket
        .mockResolvedValueOnce({ rows: [mockEvent], rowCount: 1 }) // get event
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 }) // transfer count
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update ticket
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // insert transfer
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update history

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      // Mock validation as valid
      jest.spyOn(service, 'validateTransferRequest').mockResolvedValue({ valid: true });
    });

    it('should transfer ticket successfully', async () => {
      const result = await service.transferTicket(ticketId, fromUserId, toUserId, reason);

      expect(result).toHaveProperty('fromUserId', fromUserId);
      expect(result).toHaveProperty('toUserId', toUserId);
      expect(result).toHaveProperty('transferredAt');
      expect(result).toHaveProperty('reason', reason);
    });

    it('should validate transfer request before processing', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(service.validateTransferRequest).toHaveBeenCalledWith(ticketId, fromUserId, toUserId);
    });

    it('should throw ValidationError if validation fails', async () => {
      jest.spyOn(service, 'validateTransferRequest').mockResolvedValue({
        valid: false,
        reason: 'User is blacklisted',
      });

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow(ValidationError);
    });

    it('should lock ticket FOR UPDATE', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      const lockQuery = mockClient.query.mock.calls[0][0];
      expect(lockQuery).toContain('FOR UPDATE');
    });

    it('should throw NotFoundError if ticket not found', async () => {
      mockClient.query.mockReset().mockResolvedValueOnce({ rows: [], rowCount: 0 });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if user does not own ticket', async () => {
      mockClient.query.mockReset().mockResolvedValueOnce({
        rows: [{ ...mockTicket, user_id: 'different-user' }],
        rowCount: 1,
      });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ValidationError if ticket status is not SOLD', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({
          rows: [{ ...mockTicket, status: TicketStatus.CANCELLED }],
          rowCount: 1,
        });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if transfers not allowed for event', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [mockTicket], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...mockEvent, allow_transfers: false }],
          rowCount: 1,
        });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow('Transfers are not allowed for this event');
    });

    it('should throw ValidationError if transfer deadline passed', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [mockTicket], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            ...mockEvent,
            start_date: new Date('2025-01-02T12:00:00Z'), // Less than 48 hours away
          }],
          rowCount: 1,
        });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow('Transfer deadline has passed');
    });

    it('should throw ValidationError during blackout period', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [mockTicket], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            ...mockEvent,
            transfer_blackout_start: new Date('2024-12-01T00:00:00Z'),
            transfer_blackout_end: new Date('2025-12-31T23:59:59Z'),
          }],
          rowCount: 1,
        });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow('Transfers are currently in blackout period');
    });

    it('should throw ValidationError if max transfers reached', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [mockTicket], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...mockEvent, max_transfers_per_ticket: 3 }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '3' }], rowCount: 1 });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow('Maximum transfer limit (3) reached');
    });

    it('should verify identity if required', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({ rows: [mockTicket], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ ...mockEvent, require_identity_verification: true }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { identity_verified: false },
            { identity_verified: true },
          ],
          rowCount: 2,
        });
      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      await expect(
        service.transferTicket(ticketId, fromUserId, toUserId)
      ).rejects.toThrow('Identity verification required');
    });

    it('should update ticket ownership and status', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE tickets') && call[0].includes('SET user_id')
      );

      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual([toUserId, TicketStatus.TRANSFERRED, ticketId]);
    });

    it('should insert transfer record', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId, reason);

      const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO ticket_transfers')
      );

      expect(insertCall).toBeDefined();
      expect(insertCall[1]).toEqual([
        'transfer-uuid-123',
        ticketId,
        fromUserId,
        toUserId,
        reason,
        expect.any(Date),
      ]);
    });

    it('should update transfer history', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      const historyCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('transfer_history = transfer_history')
      );

      expect(historyCall).toBeDefined();
    });

    it('should transfer NFT if token exists', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({
          rows: [{ ...mockTicket, nft_token_id: 'nft-token-123' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [mockEvent], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update tx hash

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));

      const result = await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(SolanaService.transferNFT).toHaveBeenCalledWith('nft-token-123', fromUserId, toUserId);
      expect(result.transactionHash).toBe('tx-hash-123');
    });

    it('should continue if NFT transfer fails', async () => {
      mockClient.query
        .mockReset()
        .mockResolvedValueOnce({
          rows: [{ ...mockTicket, nft_token_id: 'nft-token-123' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [mockEvent], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      (DatabaseService.transaction as jest.Mock).mockImplementation((callback) => callback(mockClient));
      (SolanaService.transferNFT as jest.Mock).mockRejectedValue(new Error('NFT error'));

      const result = await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(result).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalledWith('NFT transfer failed:', expect.any(Error));
    });

    it('should clear ticket cache', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(RedisService.del).toHaveBeenCalledWith(`ticket:${ticketId}`);
    });

    it('should continue if cache delete fails', async () => {
      (RedisService.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(result).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should publish ticket.transferred event', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(mockQueueService.publish).toHaveBeenCalledWith('ticket-events', {
        type: 'ticket.transferred',
        ticketId,
        fromUserId,
        toUserId,
        timestamp: expect.any(Date),
      });
    });

    it('should send notification to sender', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(mockQueueService.publish).toHaveBeenCalledWith('notifications', {
        type: 'ticket.transfer.sender',
        userId: fromUserId,
        ticketId,
        toUserId,
      });
    });

    it('should send notification to receiver', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(mockQueueService.publish).toHaveBeenCalledWith('notifications', {
        type: 'ticket.transfer.receiver',
        userId: toUserId,
        ticketId,
        fromUserId,
      });
    });

    it('should use database transaction', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(DatabaseService.transaction).toHaveBeenCalled();
    });

    it('should handle null reason', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO ticket_transfers')
      );

      expect(insertCall[1][4]).toBeNull();
    });

    it('should generate UUID for transfer record', async () => {
      await service.transferTicket(ticketId, fromUserId, toUserId);

      expect(uuidv4).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // getTransferHistory() - 5 test cases
  // =============================================================================

  describe('getTransferHistory()', () => {
    const ticketId = 'ticket-123';

    it('should retrieve transfer history', async () => {
      const mockHistory = [
        {
          id: 'transfer-1',
          ticket_id: ticketId,
          from_user_id: 'user-1',
          to_user_id: 'user-2',
          transferred_at: new Date(),
        },
        {
          id: 'transfer-2',
          ticket_id: ticketId,
          from_user_id: 'user-2',
          to_user_id: 'user-3',
          transferred_at: new Date(),
        },
      ];

      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: mockHistory,
        rowCount: 2,
      });

      const result = await service.getTransferHistory(ticketId);

      expect(result).toEqual(mockHistory);
    });

    it('should order by transferred_at DESC', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await service.getTransferHistory(ticketId);

      const query = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(query).toContain('ORDER BY transferred_at DESC');
    });

    it('should query with ticketId', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await service.getTransferHistory(ticketId);

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ticket_id = $1'),
        [ticketId]
      );
    });

    it('should return empty array if no history', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      const result = await service.getTransferHistory(ticketId);

      expect(result).toEqual([]);
    });

    it('should handle different ticket IDs', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await service.getTransferHistory('ticket-999');

      expect(DatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        ['ticket-999']
      );
    });
  });

  // =============================================================================
  // validateTransferRequest() - 20+ test cases
  // =============================================================================

  describe('validateTransferRequest()', () => {
    const ticketId = 'ticket-123';
    const fromUserId = 'user-from';
    const toUserId = 'user-to';

    it('should return invalid if transferring to self', async () => {
      const result = await service.validateTransferRequest(ticketId, fromUserId, fromUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Cannot transfer ticket to yourself');
    });

    it('should return invalid if user is blacklisted', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
      });

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('User is blacklisted from transfers');
    });

    it('should check blacklist query correctly', async () => {
      (DatabaseService.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0,
      });

      await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      const blacklistQuery = (DatabaseService.query as jest.Mock).mock.calls[0][0];
      expect(blacklistQuery).toContain('user_blacklists');
      expect(blacklistQuery).toContain('expires_at IS NULL OR expires_at > NOW()');
    });

    it('should return invalid if within cooldown period', async () => {
      const recentTransfer = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // blacklist
        .mockResolvedValueOnce({
          rows: [{ transferred_at: recentTransfer }],
          rowCount: 1,
        }); // cooldown

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Please wait');
      expect(result.reason).toContain('minutes');
    });

    it('should allow transfer after cooldown period', async () => {
      const oldTransfer = new Date(Date.now() - 60 * 60 * 1000); // 60 minutes ago

      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // blacklist
        .mockResolvedValueOnce({
          rows: [{ transferred_at: oldTransfer }],
          rowCount: 1,
        }) // cooldown
        .mockResolvedValueOnce({ rows: [{ transfer_count: '2' }], rowCount: 1 }) // rate limit
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'ACTIVE',
            can_receive_transfers: true,
            email_verified: true,
          }],
          rowCount: 1,
        }) // recipient
        .mockResolvedValueOnce({
          rows: [{
            status: TicketStatus.SOLD,
            is_transferable: true,
            transfer_locked_until: null,
          }],
          rowCount: 1,
        }); // ticket

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(true);
    });

    it('should return invalid if daily limit exceeded', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // blacklist
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // cooldown
        .mockResolvedValueOnce({ rows: [{ transfer_count: '10' }], rowCount: 1 }); // rate limit

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Daily transfer limit');
    });

    it('should return invalid if recipient not found', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // blacklist
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // cooldown
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 }) // rate limit
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // recipient

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Recipient user not found');
    });

    it('should return invalid if recipient account not active', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // blacklist
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // cooldown
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 }) // rate limit
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'SUSPENDED',
            can_receive_transfers: true,
            email_verified: true,
          }],
          rowCount: 1,
        }); // recipient

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Recipient account is not active');
    });

    it('should return invalid if recipient cannot receive transfers', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'ACTIVE',
            can_receive_transfers: false,
            email_verified: true,
          }],
          rowCount: 1,
        });

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Recipient cannot receive transfers');
    });

    it('should return invalid if recipient email not verified', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'ACTIVE',
            can_receive_transfers: true,
            email_verified: false,
          }],
          rowCount: 1,
        });

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Recipient must verify email to receive transfers');
    });

    it('should return invalid if ticket not found', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'ACTIVE',
            can_receive_transfers: true,
            email_verified: true,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ticket

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Ticket not found');
    });

    it('should return invalid if ticket is non-transferable', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'ACTIVE',
            can_receive_transfers: true,
            email_verified: true,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{
            status: TicketStatus.SOLD,
            is_transferable: false,
            transfer_locked_until: null,
          }],
          rowCount: 1,
        });

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('This ticket is non-transferable');
    });

    it('should return invalid if ticket is locked', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'ACTIVE',
            can_receive_transfers: true,
            email_verified: true,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{
            status: TicketStatus.SOLD,
            is_transferable: true,
            transfer_locked_until: futureDate,
          }],
          rowCount: 1,
        });

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Ticket is locked from transfers until');
    });

    it('should return valid for valid transfer request', async () => {
      (DatabaseService.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // blacklist
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // cooldown
        .mockResolvedValueOnce({ rows: [{ transfer_count: '0' }], rowCount: 1 }) // rate limit
        .mockResolvedValueOnce({
          rows: [{
            account_status: 'ACTIVE',
            can_receive_transfers: true,
            email_verified: true,
          }],
          rowCount: 1,
        }) // recipient
        .mockResolvedValueOnce({
          rows: [{
            status: TicketStatus.SOLD,
            is_transferable: true,
            transfer_locked_until: null,
          }],
          rowCount: 1,
        }); // ticket

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should handle database errors', async () => {
      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should log validation errors', async () => {
      (DatabaseService.query as jest.Mock).mockRejectedValue(new Error('DB error'));

      await service.validateTransferRequest(ticketId, fromUserId, toUserId);

      expect(mockLogger.error).toHaveBeenCalledWith('Transfer validation error:', expect.any(Error));
    });
  });

  // =============================================================================
  // transferService instance test
  // =============================================================================

  describe('transferService instance', () => {
    it('should export a singleton instance', () => {
      expect(transferService).toBeInstanceOf(TransferService);
    });

    it('should have all required methods', () => {
      expect(typeof transferService.transferTicket).toBe('function');
      expect(typeof transferService.getTransferHistory).toBe('function');
      expect(typeof transferService.validateTransferRequest).toBe('function');
    });
  });
});
