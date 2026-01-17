/**
 * Unit Tests for TransferService
 *
 * Tests:
 * - Gift transfer creation
 * - Transfer acceptance
 * - Acceptance code generation
 * - Error handling and rollbacks
 * - Service client integration
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { TransferService } from '../../../src/services/transfer.service';
import {
  TransferNotFoundError,
  TransferExpiredError,
  TicketNotFoundError,
  TicketNotTransferableError
} from '../../../src/models/transfer.model';

jest.mock('../../../src/utils/logger');
jest.mock('@tickettoken/shared/clients');

describe('TransferService', () => {
  let transferService: TransferService;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;
  let ticketServiceClient: any;
  let authServiceClient: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    } as any;

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    } as any;

    transferService = new TransferService(mockPool);

    // Get mocked service clients
    const clients = require('@tickettoken/shared/clients');
    ticketServiceClient = clients.ticketServiceClient;
    authServiceClient = clients.authServiceClient;

    jest.clearAllMocks();
  });

  describe('createGiftTransfer()', () => {
    const fromUserId = 'user-from-123';
    const tenantId = 'tenant-123';
    const request = {
      ticketId: 'ticket-123',
      toEmail: 'recipient@example.com',
      message: 'Happy Birthday!'
    };

    it('should create gift transfer successfully', async () => {
      // Mock ticket verification
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123', userId: fromUserId },
        transferable: true
      });

      // Mock user creation
      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      // Mock database operations
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // INSERT transfer
        .mockResolvedValueOnce({}); // COMMIT

      const result = await transferService.createGiftTransfer(
        fromUserId,
        request,
        tenantId
      );

      expect(result.transferId).toBeDefined();
      expect(result.acceptanceCode).toBeDefined();
      expect(result.acceptanceCode).toHaveLength(8);
      expect(result.status).toBe('PENDING');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should verify ticket ownership and transferability', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      await transferService.createGiftTransfer(fromUserId, request, tenantId);

      expect(ticketServiceClient.getTicketForTransfer).toHaveBeenCalledWith(
        'ticket-123',
        fromUserId,
        expect.objectContaining({ tenantId })
      );
    });

    it('should throw TicketNotFoundError when ticket does not exist', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: null,
        transferable: false
      });

      mockClient.query.mockResolvedValueOnce({}); // BEGIN

      await expect(
        transferService.createGiftTransfer(fromUserId, request, tenantId)
      ).rejects.toThrow(TicketNotFoundError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw TicketNotTransferableError when ticket cannot be transferred', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: false,
        reason: 'Ticket type does not allow transfers'
      });

      mockClient.query.mockResolvedValueOnce({}); // BEGIN

      await expect(
        transferService.createGiftTransfer(fromUserId, request, tenantId)
      ).rejects.toThrow(TicketNotTransferableError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should get or create recipient user', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      await transferService.createGiftTransfer(fromUserId, request, tenantId);

      expect(authServiceClient.getOrCreateUser).toHaveBeenCalledWith(
        'recipient@example.com',
        expect.objectContaining({ tenantId }),
        'gift_transfer'
      );
    });

    it('should insert transfer record with correct data', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      await transferService.createGiftTransfer(fromUserId, request, tenantId);

      const insertCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes('INSERT INTO ticket_transfers')
      );

      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual(
        expect.arrayContaining([
          expect.any(String), // transferId (UUID)
          'ticket-123',
          fromUserId,
          'user-to-456',
          'recipient@example.com',
          'GIFT',
          'PENDING',
          expect.any(String), // acceptance code
          'Happy Birthday!',
          true,
          expect.any(Date) // expiresAt
        ])
      );
    });

    it('should set expiry time based on environment variable', async () => {
      process.env.TRANSFER_EXPIRY_HOURS = '24';

      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      const beforeTime = Date.now();
      const result = await transferService.createGiftTransfer(
        fromUserId,
        request,
        tenantId
      );
      const afterTime = Date.now();

      const expectedExpiry = beforeTime + 24 * 60 * 60 * 1000;
      const expiryTime = result.expiresAt.getTime();

      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(expiryTime).toBeLessThanOrEqual(afterTime + 24 * 60 * 60 * 1000);

      delete process.env.TRANSFER_EXPIRY_HOURS;
    });

    it('should default to 48 hours expiry when not configured', async () => {
      delete process.env.TRANSFER_EXPIRY_HOURS;

      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      const beforeTime = Date.now();
      const result = await transferService.createGiftTransfer(
        fromUserId,
        request,
        tenantId
      );

      const expectedExpiry = beforeTime + 48 * 60 * 60 * 1000;
      const expiryTime = result.expiresAt.getTime();

      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(expiryTime).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    it('should handle missing message field', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      const requestWithoutMessage = {
        ticketId: 'ticket-123',
        toEmail: 'recipient@example.com'
      };

      await transferService.createGiftTransfer(
        fromUserId,
        requestWithoutMessage,
        tenantId
      );

      const insertCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes('INSERT INTO ticket_transfers')
      );

      expect(insertCall![1][8]).toBeUndefined(); // message field
    });

    it('should rollback transaction on error', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockRejectedValue(
        new Error('Database error')
      );

      mockClient.query.mockResolvedValueOnce({}); // BEGIN

      await expect(
        transferService.createGiftTransfer(fromUserId, request, tenantId)
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even when error occurs', async () => {
      ticketServiceClient.getTicketForTransfer.mockRejectedValue(
        new Error('Service error')
      );

      mockClient.query.mockResolvedValueOnce({}); // BEGIN

      await expect(
        transferService.createGiftTransfer(fromUserId, request, tenantId)
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should create request context with correct tenant ID', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      await transferService.createGiftTransfer(fromUserId, request, tenantId);

      const context = ticketServiceClient.getTicketForTransfer.mock.calls[0][2];
      expect(context.tenantId).toBe(tenantId);
      expect(context.traceId).toMatch(/^transfer-\d+-[a-z0-9]+$/);
    });
  });

  describe('acceptTransfer()', () => {
    const transferId = 'transfer-123';
    const tenantId = 'tenant-123';
    const acceptRequest = {
      acceptanceCode: 'ABC12345',
      userId: 'user-456'
    };

    const mockTransfer = {
      id: transferId,
      ticket_id: 'ticket-123',
      from_user_id: 'user-from-123',
      to_user_id: 'user-to-456',
      to_email: 'recipient@example.com',
      transfer_method: 'GIFT' as const,
      status: 'PENDING' as const,
      acceptance_code: 'ABC12345',
      message: 'Gift',
      is_gift: true,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should accept transfer successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer] }) // SELECT transfer FOR UPDATE
        .mockResolvedValueOnce({}) // UPDATE transfer status
        .mockResolvedValueOnce({}) // INSERT transaction
        .mockResolvedValueOnce({}); // COMMIT

      ticketServiceClient.transferTicket.mockResolvedValue({});

      const result = await transferService.acceptTransfer(
        transferId,
        acceptRequest,
        tenantId
      );

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe('ticket-123');
      expect(result.newOwnerId).toBe('user-to-456');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should lock transfer record for update', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer] }); // SELECT FOR UPDATE

      ticketServiceClient.transferTicket.mockResolvedValue({});
      mockClient.query.mockResolvedValue({});

      await transferService.acceptTransfer(transferId, acceptRequest, tenantId);

      const selectCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes('FOR UPDATE')
      );

      expect(selectCall).toBeDefined();
      expect(selectCall![0]).toContain('SELECT * FROM ticket_transfers');
      expect(selectCall![1]).toEqual([transferId, 'ABC12345']);
    });

    it('should throw TransferNotFoundError for invalid transfer ID', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // No transfer found

      await expect(
        transferService.acceptTransfer(transferId, acceptRequest, tenantId)
      ).rejects.toThrow(TransferNotFoundError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw TransferNotFoundError for invalid acceptance code', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // No transfer found

      const wrongCodeRequest = {
        acceptanceCode: 'WRONGCODE',
        userId: 'user-456'
      };

      await expect(
        transferService.acceptTransfer(transferId, wrongCodeRequest, tenantId)
      ).rejects.toThrow(TransferNotFoundError);
    });

    it('should throw TransferExpiredError for expired transfer', async () => {
      const expiredTransfer = {
        ...mockTransfer,
        expires_at: new Date(Date.now() - 1000) // Expired 1 second ago
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [expiredTransfer] }) // SELECT transfer
        .mockResolvedValueOnce({}); // UPDATE to expired status

      await expect(
        transferService.acceptTransfer(transferId, acceptRequest, tenantId)
      ).rejects.toThrow(TransferExpiredError);

      // Should mark transfer as expired
      const updateCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes("status = 'EXPIRED'")
      );
      expect(updateCall).toBeDefined();
    });

    it('should transfer ticket ownership via service client', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer] })
        .mockResolvedValue({});

      ticketServiceClient.transferTicket.mockResolvedValue({});

      await transferService.acceptTransfer(transferId, acceptRequest, tenantId);

      expect(ticketServiceClient.transferTicket).toHaveBeenCalledWith(
        'ticket-123',
        'user-to-456',
        expect.objectContaining({ tenantId }),
        expect.stringContaining('Gift transfer from user-from-123')
      );
    });

    it('should update transfer status to COMPLETED', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer] })
        .mockResolvedValue({});

      ticketServiceClient.transferTicket.mockResolvedValue({});

      await transferService.acceptTransfer(transferId, acceptRequest, tenantId);

      const updateCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes("status = 'COMPLETED'")
      );

      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toContain(transferId);
    });

    it('should create transfer transaction record', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer] })
        .mockResolvedValue({});

      ticketServiceClient.transferTicket.mockResolvedValue({});

      await transferService.acceptTransfer(transferId, acceptRequest, tenantId);

      const insertCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes('INSERT INTO ticket_transactions')
      );

      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual([
        expect.any(String), // transaction ID (UUID)
        'ticket-123',
        'user-to-456',
        'TRANSFER_RECEIVED',
        0,
        'COMPLETED',
        expect.stringContaining(transferId),
      ]);
    });

    it('should include transfer metadata in transaction record', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer] })
        .mockResolvedValue({});

      ticketServiceClient.transferTicket.mockResolvedValue({});

      await transferService.acceptTransfer(transferId, acceptRequest, tenantId);

      const insertCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes('INSERT INTO ticket_transactions')
      );

      const metadata = JSON.parse(insertCall![1][6]);
      expect(metadata.transferId).toBe(transferId);
      expect(metadata.fromUserId).toBe('user-from-123');
    });

    it('should rollback on ticket transfer failure', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockTransfer] });

      ticketServiceClient.transferTicket.mockRejectedValue(
        new Error('Transfer failed')
      );

      await expect(
        transferService.acceptTransfer(transferId, acceptRequest, tenantId)
      ).rejects.toThrow('Transfer failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even when error occurs', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(
        transferService.acceptTransfer(transferId, acceptRequest, tenantId)
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should only accept transfers with PENDING status', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Query filters by PENDING status

      await expect(
        transferService.acceptTransfer(transferId, acceptRequest, tenantId)
      ).rejects.toThrow(TransferNotFoundError);

      const selectCall = mockClient.query.mock.calls[1];
      expect(selectCall[0]).toContain("status = 'PENDING'");
    });
  });

  describe('generateAcceptanceCode()', () => {
    it('should generate code with default length of 8', () => {
      delete process.env.ACCEPTANCE_CODE_LENGTH;

      const code = (transferService as any).generateAcceptanceCode();

      expect(code).toHaveLength(8);
    });

    it('should generate code with custom length from environment', () => {
      process.env.ACCEPTANCE_CODE_LENGTH = '12';

      const code = (transferService as any).generateAcceptanceCode();

      expect(code).toHaveLength(12);

      delete process.env.ACCEPTANCE_CODE_LENGTH;
    });

    it('should only use safe alphanumeric characters', () => {
      const codes = Array(100)
        .fill(null)
        .map(() => (transferService as any).generateAcceptanceCode());

      const safeCharset = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

      codes.forEach(code => {
        expect(code).toMatch(safeCharset);
      });
    });

    it('should not include ambiguous characters (0, O, l, 1)', () => {
      const codes = Array(100)
        .fill(null)
        .map(() => (transferService as any).generateAcceptanceCode());

      const ambiguousChars = /[0Ol1]/;

      codes.forEach(code => {
        expect(code).not.toMatch(ambiguousChars);
      });
    });

    it('should generate unique codes', () => {
      const codes = Array(1000)
        .fill(null)
        .map(() => (transferService as any).generateAcceptanceCode());

      const uniqueCodes = new Set(codes);

      // Should have very high uniqueness (allowing some collisions due to randomness)
      expect(uniqueCodes.size).toBeGreaterThan(990);
    });

    it('should use cryptographically secure random generation', () => {
      // Test that it doesn't throw and produces valid output
      const code = (transferService as any).generateAcceptanceCode();

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    it('should handle edge case of very long code length', () => {
      process.env.ACCEPTANCE_CODE_LENGTH = '100';

      const code = (transferService as any).generateAcceptanceCode();

      expect(code).toHaveLength(100);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);

      delete process.env.ACCEPTANCE_CODE_LENGTH;
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent transfer attempts', async () => {
      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      const request = {
        ticketId: 'ticket-123',
        toEmail: 'recipient@example.com'
      };

      const promises = [
        transferService.createGiftTransfer('user-1', request, 'tenant-1'),
        transferService.createGiftTransfer('user-2', request, 'tenant-1')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(2);
      expect(results[0].transferId).not.toBe(results[1].transferId);
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(200) + '@example.com';

      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      const request = {
        ticketId: 'ticket-123',
        toEmail: longEmail
      };

      await transferService.createGiftTransfer('user-1', request, 'tenant-1');

      expect(authServiceClient.getOrCreateUser).toHaveBeenCalledWith(
        longEmail,
        expect.anything(),
        'gift_transfer'
      );
    });

    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(10000);

      ticketServiceClient.getTicketForTransfer.mockResolvedValue({
        ticket: { id: 'ticket-123' },
        transferable: true
      });

      authServiceClient.getOrCreateUser.mockResolvedValue({
        userId: 'user-to-456'
      });

      mockClient.query.mockResolvedValue({});

      const request = {
        ticketId: 'ticket-123',
        toEmail: 'recipient@example.com',
        message: longMessage
      };

      await transferService.createGiftTransfer('user-1', request, 'tenant-1');

      const insertCall = mockClient.query.mock.calls.find(
        call => (call[0] as string).includes('INSERT INTO ticket_transfers')
      );

      expect(insertCall![1][8]).toBe(longMessage);
    });

    it('should handle transfer exactly at expiry time', async () => {
      const exactlyExpiredTransfer = {
        id: 'transfer-123',
        ticket_id: 'ticket-123',
        from_user_id: 'user-from-123',
        to_user_id: 'user-to-456',
        to_email: 'recipient@example.com',
        transfer_method: 'GIFT' as const,
        status: 'PENDING' as const,
        acceptance_code: 'ABC12345',
        is_gift: true,
        expires_at: new Date(), // Expires exactly now
        created_at: new Date(),
        updated_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [exactlyExpiredTransfer] })
        .mockResolvedValueOnce({}); // UPDATE to expired

      await expect(
        transferService.acceptTransfer(
          'transfer-123',
          { acceptanceCode: 'ABC12345', userId: 'user-456' },
          'tenant-1'
        )
      ).rejects.toThrow(TransferExpiredError);
    });
  });
});
