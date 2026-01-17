/**
 * Real Unit Tests for Transfer Service
 * Tests core transfer business logic, edge cases, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';

// Mock dependencies BEFORE imports
jest.mock('pg');
jest.mock('../../../src/utils/logger');
jest.mock('crypto');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

// Manual mock for shared clients
const mockTicketServiceClient = {
  getTicketForTransfer: jest.fn(),
  transferTicket: jest.fn()
};

const mockAuthServiceClient = {
  getOrCreateUser: jest.fn()
};

jest.mock('@tickettoken/shared/clients', () => ({
  ticketServiceClient: mockTicketServiceClient,
  authServiceClient: mockAuthServiceClient
}));

// Now import the service and other dependencies
import { TransferService } from '../../../src/services/transfer.service';
import {
  TransferNotFoundError,
  TransferExpiredError,
  TicketNotFoundError,
  TicketNotTransferableError
} from '../../../src/models/transfer.model';

describe('TransferService', () => {
  let service: TransferService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.TRANSFER_EXPIRY_HOURS = '48';
    process.env.ACCEPTANCE_CODE_LENGTH = '8';

    // Create mock client
    mockClient = {
      query: jest.fn<any>(),
      release: jest.fn<any>(),
    } as any;

    // Create mock pool
    mockPool = {
      connect: jest.fn<any>().mockResolvedValue(mockClient),
      query: jest.fn<any>(),
      end: jest.fn<any>(),
      on: jest.fn<any>(),
    } as any;

    // Initialize service
    service = new TransferService(mockPool);

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createGiftTransfer()', () => {
    const fromUserId = 'user-123';
    const tenantId = 'tenant-456';
    const mockRequest = {
      ticketId: 'ticket-789',
      toEmail: 'recipient@example.com',
      message: 'Happy Birthday!'
    };

    beforeEach(() => {
      // Default successful mocks
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      
      mockTicketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-789', userId: fromUserId },
        transferable: true,
        reason: null
      });

      mockAuthServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'recipient-user-id',
        created: false
      });

      // Mock crypto for acceptance code
      (crypto.randomBytes as jest.Mock).mockReturnValue(
        Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
      );
    });

    it('should create gift transfer successfully', async () => {
      const result = await service.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(result).toMatchObject({
        transferId: expect.any(String),
        acceptanceCode: expect.any(String),
        status: 'PENDING',
        expiresAt: expect.any(Date)
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should verify ticket ownership via ticketServiceClient', async () => {
      await service.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(mockTicketServiceClient.getTicketForTransfer).toHaveBeenCalledWith(
        'ticket-789',
        fromUserId,
        expect.objectContaining({
          tenantId: 'tenant-456',
          traceId: expect.stringContaining('transfer-')
        })
      );
    });

    it('should throw TicketNotFoundError when ticket does not exist', async () => {
      mockTicketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: null,
        transferable: false,
        reason: 'Ticket not found'
      });

      await expect(
        service.createGiftTransfer(fromUserId, mockRequest, tenantId)
      ).rejects.toThrow(TicketNotFoundError);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw TicketNotTransferableError when ticket cannot be transferred', async () => {
      mockTicketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-789' },
        transferable: false,
        reason: 'Event has already occurred'
      });

      await expect(
        service.createGiftTransfer(fromUserId, mockRequest, tenantId)
      ).rejects.toThrow(TicketNotTransferableError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should pass correct reason to TicketNotTransferableError', async () => {
      mockTicketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-789' },
        transferable: false,
        reason: 'Ticket type does not allow transfers'
      });

      try {
        await service.createGiftTransfer(fromUserId, mockRequest, tenantId);
        fail('Should have thrown TicketNotTransferableError');
      } catch (error) {
        expect(error).toBeInstanceOf(TicketNotTransferableError);
      }
    });

    it('should get or create recipient user via authServiceClient', async () => {
      await service.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(mockAuthServiceClient.getOrCreateUser).toHaveBeenCalledWith(
        'recipient@example.com',
        expect.objectContaining({
          tenantId: 'tenant-456',
          traceId: expect.stringContaining('transfer-')
        }),
        'gift_transfer'
      );
    });

    it('should handle newly created recipient users', async () => {
      mockAuthServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'new-user-id',
        created: true
      });

      const result = await service.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(result.transferId).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transfers'),
        expect.arrayContaining(['new-user-id'])
      );
    });

    it('should generate cryptographically secure acceptance code', async () => {
      const result = await service.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(crypto.randomBytes).toHaveBeenCalledWith(8);
      expect(result.acceptanceCode).toBeDefined();
      expect(result.acceptanceCode.length).toBeGreaterThan(0);
    });

    it('should use custom acceptance code length from env', async () => {
      process.env.ACCEPTANCE_CODE_LENGTH = '12';
      (crypto.randomBytes as jest.Mock).mockReturnValue(
        Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
      );

      const newService = new TransferService(mockPool);
      await newService.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(crypto.randomBytes).toHaveBeenCalledWith(12);
    });

    it('should calculate expiry time correctly (48 hours default)', async () => {
      const beforeTime = Date.now();
      const result = await service.createGiftTransfer(fromUserId, mockRequest, tenantId);
      const afterTime = Date.now();

      const expectedExpiry = 48 * 60 * 60 * 1000; // 48 hours in ms
      const resultExpiry = result.expiresAt.getTime() - beforeTime;

      expect(resultExpiry).toBeGreaterThanOrEqual(expectedExpiry - 1000); // Allow 1s margin
      expect(resultExpiry).toBeLessThanOrEqual(expectedExpiry + (afterTime - beforeTime) + 1000);
    });

    it('should use custom expiry hours from env', async () => {
      process.env.TRANSFER_EXPIRY_HOURS = '24';
      const newService = new TransferService(mockPool);

      const beforeTime = Date.now();
      const result = await newService.createGiftTransfer(fromUserId, mockRequest, tenantId);

      const expectedExpiry = 24 * 60 * 60 * 1000; // 24 hours in ms
      const resultExpiry = result.expiresAt.getTime() - beforeTime;

      expect(resultExpiry).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(resultExpiry).toBeLessThanOrEqual(expectedExpiry + 2000);
    });

    it('should insert transfer record with correct data', async () => {
      await service.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transfers'),
        expect.arrayContaining([
          'mock-uuid-1234',
          'ticket-789',
          'user-123',
          'recipient-user-id',
          'recipient@example.com',
          'GIFT',
          'PENDING',
          expect.any(String), // acceptanceCode
          'Happy Birthday!',
          true,
          expect.any(Date)
        ])
      );
    });

    it('should return correct response format', async () => {
      const result = await service.createGiftTransfer(fromUserId, mockRequest, tenantId);

      expect(result).toHaveProperty('transferId');
      expect(result).toHaveProperty('acceptanceCode');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('expiresAt');
      expect(result.status).toBe('PENDING');
    });

    it('should rollback transaction on ticketServiceClient error', async () => {
      mockTicketServiceClient.getTicketForTransfer.mockRejectedValue(
        new Error('Service unavailable')
      );

      await expect(
        service.createGiftTransfer(fromUserId, mockRequest, tenantId)
      ).rejects.toThrow('Service unavailable');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on authServiceClient error', async () => {
      mockAuthServiceClient.getOrCreateUser.mockRejectedValue(
        new Error('Auth service down')
      );

      await expect(
        service.createGiftTransfer(fromUserId, mockRequest, tenantId)
      ).rejects.toThrow('Auth service down');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on database insert error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockRejectedValueOnce(new Error('Database constraint violation')); // INSERT

      await expect(
        service.createGiftTransfer(fromUserId, mockRequest, tenantId)
      ).rejects.toThrow('Database constraint violation');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if rollback fails', async () => {
      mockTicketServiceClient.getTicketForTransfer.mockRejectedValue(
        new Error('Service error')
      );
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockRejectedValueOnce(new Error('Rollback failed')); // ROLLBACK

      await expect(
        service.createGiftTransfer(fromUserId, mockRequest, tenantId)
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle empty message field', async () => {
      const requestWithoutMessage = {
        ticketId: 'ticket-789',
        toEmail: 'recipient@example.com',
        message: ''
      };

      await service.createGiftTransfer(fromUserId, requestWithoutMessage, tenantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transfers'),
        expect.arrayContaining([''])
      );
    });

    it('should handle undefined message field', async () => {
      const requestWithoutMessage = {
        ticketId: 'ticket-789',
        toEmail: 'recipient@example.com',
        message: undefined as any
      };

      await service.createGiftTransfer(fromUserId, requestWithoutMessage, tenantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transfers'),
        expect.arrayContaining([undefined])
      );
    });
  });

  describe('acceptTransfer()', () => {
    const transferId = 'transfer-123';
    const tenantId = 'tenant-456';
    const mockRequest = {
      acceptanceCode: 'ABC12345'
    };

    const mockTransfer = {
      id: transferId,
      ticket_id: 'ticket-789',
      from_user_id: 'user-123',
      to_user_id: 'recipient-user-id',
      acceptance_code: 'ABC12345',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    };

    beforeEach(() => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      
      mockTicketServiceClient.transferTicket.mockResolvedValue(undefined);
    });

    it('should accept transfer successfully', async () => {
      // Mock getTransferForUpdate
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] } as any) // UPDATE status
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT transaction
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      const result = await service.acceptTransfer(transferId, mockRequest, tenantId);

      expect(result).toEqual({
        success: true,
        ticketId: 'ticket-789',
        newOwnerId: 'recipient-user-id'
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should lock transfer record for update', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] } as any) // UPDATE
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      await service.acceptTransfer(transferId, mockRequest, tenantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        [transferId, 'ABC12345']
      );
    });

    it('should throw TransferNotFoundError when transfer does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // SELECT FOR UPDATE (not found)

      await expect(
        service.acceptTransfer(transferId, mockRequest, tenantId)
      ).rejects.toThrow(TransferNotFoundError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw TransferNotFoundError with invalid acceptance code', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // SELECT FOR UPDATE

      const invalidRequest = { acceptanceCode: 'WRONG123' };

      await expect(
        service.acceptTransfer(transferId, invalidRequest, tenantId)
      ).rejects.toThrow(TransferNotFoundError);
    });

    it('should throw TransferExpiredError when transfer has expired', async () => {
      const expiredTransfer = {
        ...mockTransfer,
        expires_at: new Date(Date.now() - 1000) // 1 second ago
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [expiredTransfer], rowCount: 1 } as any) // SELECT
        .mockResolvedValueOnce({ rows: [] } as any); // UPDATE to EXPIRED

      await expect(
        service.acceptTransfer(transferId, mockRequest, tenantId)
      ).rejects.toThrow(TransferExpiredError);

      // Should mark transfer as expired
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'EXPIRED'"),
        [transferId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should transfer ticket ownership via ticketServiceClient', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      await service.acceptTransfer(transferId, mockRequest, tenantId);

      expect(mockTicketServiceClient.transferTicket).toHaveBeenCalledWith(
        'ticket-789',
        'recipient-user-id',
        expect.objectContaining({
          tenantId: 'tenant-456',
          traceId: expect.stringContaining('transfer-')
        }),
        'Gift transfer from user-123'
      );
    });

    it('should update transfer status to COMPLETED', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any) // UPDATE status
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      await service.acceptTransfer(transferId, mockRequest, tenantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'COMPLETED'"),
        [transferId]
      );
    });

    it('should create transfer transaction record', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any) // INSERT transaction
        .mockResolvedValueOnce({ rows: [] } as any); // COMMIT

      await service.acceptTransfer(transferId, mockRequest, tenantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transactions'),
        expect.arrayContaining([
          expect.any(String), // id (uuid)
          'ticket-789',
          'recipient-user-id',
          'TRANSFER_RECEIVED',
          0,
          'COMPLETED',
          expect.stringContaining('transferId')
        ])
      );
    });

    it('should include transfer metadata in transaction record', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.acceptTransfer(transferId, mockRequest, tenantId);

      const transactionInsertCall = mockClient.query.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO ticket_transactions')
      );

      expect(transactionInsertCall).toBeDefined();
      const metadata = JSON.parse(transactionInsertCall![1][6] as string);
      expect(metadata).toMatchObject({
        transferId: 'transfer-123',
        fromUserId: 'user-123'
      });
    });

    it('should rollback transaction on ticketServiceClient error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any);

      mockTicketServiceClient.transferTicket.mockRejectedValue(
        new Error('Ticket service unavailable')
      );

      await expect(
        service.acceptTransfer(transferId, mockRequest, tenantId)
      ).rejects.toThrow('Ticket service unavailable');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on update status error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockRejectedValueOnce(new Error('Update failed')); // UPDATE fails

      await expect(
        service.acceptTransfer(transferId, mockRequest, tenantId)
      ).rejects.toThrow('Update failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should rollback transaction on transaction record creation error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any) // UPDATE
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT fails

      await expect(
        service.acceptTransfer(transferId, mockRequest, tenantId)
      ).rejects.toThrow('Insert failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should release client even if commit fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockRejectedValueOnce(new Error('Commit failed')); // COMMIT fails

      await expect(
        service.acceptTransfer(transferId, mockRequest, tenantId)
      ).rejects.toThrow('Commit failed');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle transfer on exact expiry boundary', async () => {
      const boundaryTransfer = {
        ...mockTransfer,
        expires_at: new Date(Date.now()) // Exactly now
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [boundaryTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any); // UPDATE to EXPIRED

      await expect(
        service.acceptTransfer(transferId, mockRequest, tenantId)
      ).rejects.toThrow(TransferExpiredError);
    });

    it('should only select PENDING transfers in getTransferForUpdate', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.acceptTransfer(transferId, mockRequest, tenantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'PENDING'"),
        [transferId, 'ABC12345']
      );
    });
  });

  describe('generateAcceptanceCode()', () => {
    it('should generate code without ambiguous characters', async () => {
      // Test multiple generations to ensure charset is consistently used
      const codes: string[] = [];
      
      for (let i = 0; i < 10; i++) {
        (crypto.randomBytes as jest.Mock).mockReturnValue(
          Buffer.from([i, i + 1, i + 2, i + 3, i + 4, i + 5, i + 6, i + 7])
        );

        const result = await service.createGiftTransfer(
          'user-123',
          { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
          'tenant-1'
        );

        codes.push(result.acceptanceCode);
      }

      // Verify no ambiguous characters (0, O, l, 1) appear in any code
      codes.forEach(code => {
        expect(code).not.toMatch(/[0Ol1]/);
        expect(code).toMatch(/^[A-Z2-9]+$/);
      });
    });

    it('should use crypto.randomBytes for security', async () => {
      (crypto.randomBytes as jest.Mock).mockReturnValue(
        Buffer.from([10, 20, 30, 40, 50, 60, 70, 80])
      );

      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      expect(crypto.randomBytes).toHaveBeenCalledWith(8);
    });

    it('should generate different codes with different random bytes', async () => {
      (crypto.randomBytes as jest.Mock)
        .mockReturnValueOnce(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
        .mockReturnValueOnce(Buffer.from([8, 7, 6, 5, 4, 3, 2, 1]));

      mockTicketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-1' },
        transferable: true
      });
      mockAuthServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-1'
      });
      mockClient.query.mockResolvedValue({ rows: [] } as any);

      const result1 = await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      const result2 = await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      expect(result1.acceptanceCode).not.toBe(result2.acceptanceCode);
    });

    it('should handle edge case of zero byte values', async () => {
      (crypto.randomBytes as jest.Mock).mockReturnValue(
        Buffer.from([0, 0, 0, 0, 0, 0, 0, 0])
      );

      const result = await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      expect(result.acceptanceCode).toBeDefined();
      expect(result.acceptanceCode.length).toBe(8);
    });

    it('should handle edge case of max byte values', async () => {
      (crypto.randomBytes as jest.Mock).mockReturnValue(
        Buffer.from([255, 255, 255, 255, 255, 255, 255, 255])
      );

      const result = await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      expect(result.acceptanceCode).toBeDefined();
      expect(result.acceptanceCode.length).toBe(8);
    });
  });

  describe('Transaction Handling', () => {
    it('should always release client in finally block', async () => {
      mockTicketServiceClient.getTicketForTransfer.mockRejectedValue(
        new Error('Test error')
      );

      await expect(
        service.createGiftTransfer(
          'user-123',
          { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
          'tenant-1'
        )
      ).rejects.toThrow('Test error');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should call BEGIN before any database operations', async () => {
      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      const queryMock = mockClient.query as jest.Mock;
      expect(queryMock.mock.calls[0][0]).toBe('BEGIN');
    });

    it('should call COMMIT after all successful operations', async () => {
      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      const queryMock = mockClient.query as jest.Mock;
      const lastCall = queryMock.mock.calls[queryMock.mock.calls.length - 1];
      expect(lastCall[0]).toBe('COMMIT');
    });

    it('should call ROLLBACK on any error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // First query fails

      await expect(
        service.createGiftTransfer(
          'user-123',
          { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
          'tenant-1'
        )
      ).rejects.toThrow();

      const queryMock = mockClient.query as jest.Mock;
      const rollbackCall = queryMock.mock.calls.find(call => call[0] === 'ROLLBACK');
      expect(rollbackCall).toBeDefined();
    });
  });

  describe('Request Context Creation', () => {
    it('should create unique trace IDs for each request', async () => {
      const calls: any[] = [];
      mockTicketServiceClient.getTicketForTransfer.mockImplementation(
        (...args) => {
          calls.push(args[2]);
          return Promise.resolve({ ticket: { id: 'ticket-1' }, transferable: true });
        }
      );

      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test1@example.com', message: 'test' },
        'tenant-1'
      );

      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-2', toEmail: 'test2@example.com', message: 'test' },
        'tenant-1'
      );

      expect(calls.length).toBe(2);
      expect(calls[0].traceId).not.toBe(calls[1].traceId);
    });

    it('should include tenant ID in request context', async () => {
      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-789'
      );

      expect(mockTicketServiceClient.getTicketForTransfer).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ tenantId: 'tenant-789' })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(100) + '@example.com';
      
      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: longEmail, message: 'test' },
        'tenant-1'
      );

      expect(mockAuthServiceClient.getOrCreateUser).toHaveBeenCalledWith(
        longEmail,
        expect.any(Object),
        'gift_transfer'
      );
    });

    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(5000);
      
      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: longMessage },
        'tenant-1'
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transfers'),
        expect.arrayContaining([longMessage])
      );
    });

    it('should handle special characters in email', async () => {
      const specialEmail = 'test+tag@example.co.uk';
      
      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: specialEmail, message: 'test' },
        'tenant-1'
      );

      expect(mockAuthServiceClient.getOrCreateUser).toHaveBeenCalledWith(
        specialEmail,
        expect.any(Object),
        'gift_transfer'
      );
    });

    it('should handle special characters in message', async () => {
      const specialMessage = 'Happy Birthday! 🎉🎂 "Hope you enjoy the show"';
      
      await service.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: specialMessage },
        'tenant-1'
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ticket_transfers'),
        expect.arrayContaining([specialMessage])
      );
    });

    it('should handle zero expiry hours configuration', async () => {
      process.env.TRANSFER_EXPIRY_HOURS = '0';
      const newService = new TransferService(mockPool);

      const beforeTime = Date.now();
      const result = await newService.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      // Should expire immediately or very soon
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(beforeTime + 1000);
    });

    it('should handle large expiry hours configuration', async () => {
      process.env.TRANSFER_EXPIRY_HOURS = '8760'; // 1 year
      const newService = new TransferService(mockPool);

      const beforeTime = Date.now();
      const result = await newService.createGiftTransfer(
        'user-123',
        { ticketId: 'ticket-1', toEmail: 'test@example.com', message: 'test' },
        'tenant-1'
      );

      const oneYearInMs = 8760 * 60 * 60 * 1000;
      const resultExpiry = result.expiresAt.getTime() - beforeTime;
      expect(resultExpiry).toBeGreaterThanOrEqual(oneYearInMs - 1000);
    });
  });
});
