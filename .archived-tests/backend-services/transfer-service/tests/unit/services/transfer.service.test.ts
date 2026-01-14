import { Pool, PoolClient } from 'pg';
import { TransferService } from '../../../src/services/transfer.service';
import {
  Transfer,
  TicketNotFoundError,
  TicketNotTransferableError,
  TransferNotFoundError,
  TransferExpiredError
} from '../../../src/models/transfer.model';

/**
 * TRANSFER SERVICE UNIT TESTS
 * 
 * Test business logic for ticket transfers
 * Phase 4: Comprehensive Testing
 */

describe('TransferService', () => {
  let service: TransferService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    // Create mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    } as unknown as jest.Mocked<PoolClient>;

    // Create mock pool
    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    } as unknown as jest.Mocked<Pool>;

    service = new TransferService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createGiftTransfer', () => {
    it('should create a gift transfer successfully', async () => {
      const fromUserId = '123e4567-e89b-12d3-a456-426614174000';
      const ticketId = '123e4567-e89b-12d3-a456-426614174001';
      const toEmail = 'recipient@example.com';

      // Mock ticket query
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: ticketId,
          user_id: fromUserId,
          ticket_type_id: '123e4567-e89b-12d3-a456-426614174002'
        }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock ticket type query
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: '123e4567-e89b-12d3-a456-426614174002',
          is_transferable: true
        }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock user query (existing user)
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: '123e4567-e89b-12d3-a456-426614174003'
        }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock transfer insert
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock commit
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'COMMIT',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      const result = await service.createGiftTransfer(fromUserId, {
        ticketId,
        toEmail,
        message: 'Enjoy the show!'
      });

      expect(result).toHaveProperty('transferId');
      expect(result).toHaveProperty('acceptanceCode');
      expect(result.status).toBe('PENDING');
      expect(result).toHaveProperty('expiresAt');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw TicketNotFoundError if ticket does not exist', async () => {
      const fromUserId = '123e4567-e89b-12d3-a456-426614174000';
      const ticketId = '123e4567-e89b-12d3-a456-426614174001';

      // Mock ticket not found
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      // Mock rollback
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'ROLLBACK',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      await expect(
        service.createGiftTransfer(fromUserId, {
          ticketId,
          toEmail: 'test@example.com'
        })
      ).rejects.toThrow(TicketNotFoundError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw TicketNotTransferableError if ticket type is not transferable', async () => {
      const fromUserId = '123e4567-e89b-12d3-a456-426614174000';
      const ticketId = '123e4567-e89b-12d3-a456-426614174001';

      // Mock ticket found
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: ticketId,
          user_id: fromUserId,
          ticket_type_id: '123e4567-e89b-12d3-a456-426614174002'
        }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock ticket type not transferable
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: '123e4567-e89b-12d3-a456-426614174002',
          is_transferable: false
        }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock rollback
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'ROLLBACK',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      await expect(
        service.createGiftTransfer(fromUserId, {
          ticketId,
          toEmail: 'test@example.com'
        })
      ).rejects.toThrow(TicketNotTransferableError);
    });
  });

  describe('acceptTransfer', () => {
    it('should accept a valid transfer successfully', async () => {
      const transferId = '123e4567-e89b-12d3-a456-426614174000';
      const acceptanceCode = 'ABC12345';
      const userId = '123e4567-e89b-12d3-a456-426614174001';

      const mockTransfer: Partial<Transfer> = {
        id: transferId,
        ticket_id: '123e4567-e89b-12d3-a456-426614174002',
        from_user_id: '123e4567-e89b-12d3-a456-426614174003',
        to_user_id: userId,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      };

      // Mock transfer query
      mockClient.query.mockResolvedValueOnce({
        rows: [mockTransfer],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock ticket update
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock transfer status update
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock transaction insert
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock commit
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'COMMIT',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      const result = await service.acceptTransfer(transferId, {
        acceptanceCode,
        userId
      });

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe(mockTransfer.ticket_id);
      expect(result.newOwnerId).toBe(userId);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw TransferNotFoundError for invalid acceptance code', async () => {
      const transferId = '123e4567-e89b-12d3-a456-426614174000';
      const acceptanceCode = 'INVALID';

      // Mock transfer not found
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      // Mock rollback
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'ROLLBACK',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      await expect(
        service.acceptTransfer(transferId, {
          acceptanceCode,
          userId: '123e4567-e89b-12d3-a456-426614174001'
        })
      ).rejects.toThrow(TransferNotFoundError);
    });

    it('should throw TransferExpiredError for expired transfer', async () => {
      const transferId = '123e4567-e89b-12d3-a456-426614174000';
      const acceptanceCode = 'ABC12345';

      const mockTransfer: Partial<Transfer> = {
        id: transferId,
        ticket_id: '123e4567-e89b-12d3-a456-426614174002',
        status: 'PENDING',
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
      };

      // Mock transfer query
      mockClient.query.mockResolvedValueOnce({
        rows: [mockTransfer],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock expire update
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock rollback
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        command: 'ROLLBACK',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      await expect(
        service.acceptTransfer(transferId, {
          acceptanceCode,
          userId: '123e4567-e89b-12d3-a456-426614174001'
        })
      ).rejects.toThrow(TransferExpiredError);
    });
  });
});
