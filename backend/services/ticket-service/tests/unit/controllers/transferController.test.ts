import { FastifyRequest, FastifyReply } from 'fastify';

// Mock shared library BEFORE importing controller
jest.mock('@tickettoken/shared', () => ({
  auditService: {
    logAction: jest.fn()
  },
  getCacheManager: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  })),
  createAxiosInstance: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }))
}));

// Mock Redis and other services that transferService depends on
jest.mock('../../../src/services/redisService', () => ({
  redisService: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    initialize: jest.fn()
  }
}));

jest.mock('../../../src/services/transferService', () => ({
  transferService: {
    transferTicket: jest.fn(),
    getTransferHistory: jest.fn(),
    validateTransferRequest: jest.fn()
  }
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

// Now import after mocks are set up
import { TransferController, transferController } from '../../../src/controllers/transferController';
import { transferService } from '../../../src/services/transferService';
import { auditService } from '@tickettoken/shared';

describe('TransferController', () => {
  let controller: TransferController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new TransferController();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      status: mockStatus
    };

    mockRequest = {
      params: {},
      body: {},
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1'
    } as any;
  });

  describe('transferTicket', () => {
    it('should transfer ticket successfully', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456',
        reason: 'Gift to friend'
      };
      (mockRequest as any).user = { id: 'owner-123' };

      // Mock raw transfer data from service (snake_case with sensitive fields)
      const mockTransfer = {
        id: 'transfer-123',
        ticket_id: 'ticket-123',
        from_user_id: 'owner-123',
        to_user_id: 'recipient-456',
        to_email: 'recipient@example.com',  // Sensitive - should be masked
        status: 'completed',
        transfer_method: 'direct',
        is_gift: true,
        transferred_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      (transferService.transferTicket as jest.Mock).mockResolvedValue(mockTransfer);
      (auditService.logAction as jest.Mock).mockResolvedValue(undefined);

      await controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.transferTicket).toHaveBeenCalledWith(
        'ticket-123',
        'owner-123',
        'recipient-456',
        'Gift to friend'
      );
      expect(auditService.logAction).toHaveBeenCalledWith({
        service: 'ticket-service',
        action: 'transfer_ticket',
        actionType: 'UPDATE',
        userId: 'owner-123',
        resourceType: 'ticket',
        resourceId: 'ticket-123',
        previousValue: {
          ownerId: 'owner-123'
        },
        newValue: {
          ownerId: 'recipient-456',
          reason: 'Gift to friend'
        },
        metadata: {
          toUserId: 'recipient-456',
          transferMethod: 'direct_transfer',
          reason: 'Gift to friend'
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: true
      });
      // Serialized for sender - includes masked email, excludes sensitive fields
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'transfer-123',
          ticketId: 'ticket-123',
          status: 'completed',
          recipientEmailMasked: 're*****@example.com'
        })
      });
      // Verify sensitive fields are NOT in response
      const sentData = mockSend.mock.calls[0][0].data;
      expect(sentData.fromUserId).toBeUndefined();
      expect(sentData.toUserId).toBeUndefined();
      expect(sentData.toEmail).toBeUndefined();
    });

    it('should log failed transfer attempt and rethrow error', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456',
        reason: 'Gift'
      };
      (mockRequest as any).user = { id: 'owner-123' };

      const transferError = new Error('Ticket not owned by user');
      (transferService.transferTicket as jest.Mock).mockRejectedValue(transferError);
      (auditService.logAction as jest.Mock).mockResolvedValue(undefined);

      await expect(
        controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Ticket not owned by user');

      expect(auditService.logAction).toHaveBeenCalledWith({
        service: 'ticket-service',
        action: 'transfer_ticket',
        actionType: 'UPDATE',
        userId: 'owner-123',
        resourceType: 'ticket',
        resourceId: 'ticket-123',
        metadata: {
          toUserId: 'recipient-456',
          reason: 'Gift'
        },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        success: false,
        errorMessage: 'Ticket not owned by user'
      });
    });

    it('should handle non-Error exceptions in audit logging', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456',
        reason: 'Gift'
      };
      (mockRequest as any).user = { id: 'owner-123' };

      (transferService.transferTicket as jest.Mock).mockRejectedValue('String error');
      (auditService.logAction as jest.Mock).mockResolvedValue(undefined);

      await expect(
        controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toBe('String error');

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: 'Unknown error'
        })
      );
    });

    it('should transfer without reason', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456'
      };
      (mockRequest as any).user = { id: 'owner-123' };

      const mockTransfer = {
        id: 'transfer-123',
        ticketId: 'ticket-123',
        fromUserId: 'owner-123',
        toUserId: 'recipient-456',
        status: 'COMPLETED'
      };

      (transferService.transferTicket as jest.Mock).mockResolvedValue(mockTransfer);
      (auditService.logAction as jest.Mock).mockResolvedValue(undefined);

      await controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.transferTicket).toHaveBeenCalledWith(
        'ticket-123',
        'owner-123',
        'recipient-456',
        undefined
      );
    });

    it('should handle missing user-agent header', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456',
        reason: 'Gift'
      };
      (mockRequest as any).user = { id: 'owner-123' };
      mockRequest.headers = {};

      const mockTransfer = { id: 'transfer-123' };
      (transferService.transferTicket as jest.Mock).mockResolvedValue(mockTransfer);
      (auditService.logAction as jest.Mock).mockResolvedValue(undefined);

      await controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(auditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: undefined
        })
      );
    });
  });

  describe('getTransferHistory', () => {
    it('should return transfer history for a ticket', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };

      // Mock raw history from service (snake_case, safe fields only after service update)
      const mockHistory = [
        {
          id: 'transfer-1',
          ticket_id: 'ticket-123',
          status: 'completed',
          transfer_method: 'direct',
          is_gift: true,
          transferred_at: new Date('2024-01-01'),
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01')
        },
        {
          id: 'transfer-2',
          ticket_id: 'ticket-123',
          status: 'completed',
          transfer_method: 'direct',
          is_gift: false,
          transferred_at: new Date('2024-01-15'),
          created_at: new Date('2024-01-15'),
          updated_at: new Date('2024-01-15')
        }
      ];

      (transferService.getTransferHistory as jest.Mock).mockResolvedValue(mockHistory);

      await controller.getTransferHistory(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.getTransferHistory).toHaveBeenCalledWith('ticket-123');
      // Serialized to camelCase
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'transfer-1', ticketId: 'ticket-123', status: 'completed' }),
          expect.objectContaining({ id: 'transfer-2', ticketId: 'ticket-123', status: 'completed' })
        ])
      });
    });

    it('should return empty array for ticket with no transfers', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };

      (transferService.getTransferHistory as jest.Mock).mockResolvedValue([]);

      await controller.getTransferHistory(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should propagate service errors', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };

      (transferService.getTransferHistory as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        controller.getTransferHistory(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('validateTransfer', () => {
    it('should validate transfer request successfully', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456'
      };
      (mockRequest as any).user = { id: 'owner-123' };

      // Service returns only valid/reason (no sensitive internal data)
      const mockValidation = {
        valid: true,
        reason: undefined
      };

      (transferService.validateTransferRequest as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateTransfer(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.validateTransferRequest).toHaveBeenCalledWith(
        'ticket-123',
        'owner-123',
        'recipient-456'
      );
      // Controller extracts only valid/reason
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          valid: true,
          reason: undefined
        }
      });
    });

    it('should return invalid validation result', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456'
      };
      (mockRequest as any).user = { id: 'owner-123' };

      const mockValidation = {
        valid: false,
        reason: 'Ticket is already used'
      };

      (transferService.validateTransferRequest as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateTransfer(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Controller extracts only valid/reason
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        data: {
          valid: false,
          reason: 'Ticket is already used'
        }
      });
    });

    it('should propagate validation service errors', async () => {
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'recipient-456'
      };
      (mockRequest as any).user = { id: 'owner-123' };

      (transferService.validateTransferRequest as jest.Mock).mockRejectedValue(
        new Error('Validation service unavailable')
      );

      await expect(
        controller.validateTransfer(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Validation service unavailable');
    });
  });

  describe('transferController singleton', () => {
    it('should export a singleton instance', () => {
      expect(transferController).toBeInstanceOf(TransferController);
    });
  });
});
