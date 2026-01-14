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

      const mockTransfer = {
        id: 'transfer-123',
        ticketId: 'ticket-123',
        fromUserId: 'owner-123',
        toUserId: 'recipient-456',
        status: 'COMPLETED',
        transferredAt: new Date()
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
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: mockTransfer
      });
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

      const mockHistory = [
        {
          id: 'transfer-1',
          ticketId: 'ticket-123',
          fromUserId: 'user-1',
          toUserId: 'user-2',
          transferredAt: new Date('2024-01-01')
        },
        {
          id: 'transfer-2',
          ticketId: 'ticket-123',
          fromUserId: 'user-2',
          toUserId: 'user-3',
          transferredAt: new Date('2024-01-15')
        }
      ];

      (transferService.getTransferHistory as jest.Mock).mockResolvedValue(mockHistory);

      await controller.getTransferHistory(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.getTransferHistory).toHaveBeenCalledWith('ticket-123');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: mockHistory
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

      const mockValidation = {
        valid: true,
        ticket: { id: 'ticket-123', status: 'ACTIVE' },
        recipient: { id: 'recipient-456', verified: true }
      };

      (transferService.validateTransferRequest as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateTransfer(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.validateTransferRequest).toHaveBeenCalledWith(
        'ticket-123',
        'owner-123',
        'recipient-456'
      );
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: mockValidation
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
        errors: ['Ticket is already used', 'Recipient not verified']
      };

      (transferService.validateTransferRequest as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateTransfer(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        data: mockValidation
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
