// =============================================================================
// TEST SUITE - transferController
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { TransferController } from '../../../src/controllers/transferController';
import { transferService } from '../../../src/services/transferService';

jest.mock('../../../src/services/transferService');

describe('TransferController', () => {
  let controller: TransferController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    controller = new TransferController();
    
    mockRequest = {
      body: {},
      params: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('transferTicket()', () => {
    it('should transfer a ticket', async () => {
      const mockTransfer = {
        id: 'transfer-1',
        ticketId: 'ticket-123',
        fromUserId: 'user-1',
        toUserId: 'user-2',
        status: 'completed',
      };

      (mockRequest as any).user = { id: 'user-1' };
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'user-2',
        reason: 'Gift',
      };

      (transferService.transferTicket as jest.Mock).mockResolvedValue(mockTransfer);

      await controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.transferTicket).toHaveBeenCalledWith(
        'ticket-123',
        'user-1',
        'user-2',
        'Gift'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransfer,
      });
    });

    it('should handle transfer without reason', async () => {
      (mockRequest as any).user = { id: 'user-1' };
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'user-2',
      };

      (transferService.transferTicket as jest.Mock).mockResolvedValue({});

      await controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.transferTicket).toHaveBeenCalledWith(
        'ticket-123',
        'user-1',
        'user-2',
        undefined
      );
    });

    it('should use authenticated user as fromUserId', async () => {
      (mockRequest as any).user = { id: 'authenticated-user' };
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'user-2',
      };

      (transferService.transferTicket as jest.Mock).mockResolvedValue({});

      await controller.transferTicket(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.transferTicket).toHaveBeenCalledWith(
        'ticket-123',
        'authenticated-user',
        'user-2',
        undefined
      );
    });
  });

  describe('getTransferHistory()', () => {
    it('should get transfer history for a ticket', async () => {
      const mockHistory = [
        { id: 'transfer-1', fromUserId: 'user-1', toUserId: 'user-2' },
        { id: 'transfer-2', fromUserId: 'user-2', toUserId: 'user-3' },
      ];

      mockRequest.params = { ticketId: 'ticket-123' };

      (transferService.getTransferHistory as jest.Mock).mockResolvedValue(mockHistory);

      await controller.getTransferHistory(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.getTransferHistory).toHaveBeenCalledWith('ticket-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockHistory,
      });
    });

    it('should return empty history if no transfers', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };

      (transferService.getTransferHistory as jest.Mock).mockResolvedValue([]);

      await controller.getTransferHistory(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });
  });

  describe('validateTransfer()', () => {
    it('should validate a transfer request', async () => {
      const mockValidation = {
        valid: true,
        message: 'Transfer is valid',
      };

      (mockRequest as any).user = { id: 'user-1' };
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'user-2',
      };

      (transferService.validateTransferRequest as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateTransfer(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(transferService.validateTransferRequest).toHaveBeenCalledWith(
        'ticket-123',
        'user-1',
        'user-2'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockValidation,
      });
    });

    it('should handle invalid transfer', async () => {
      const mockValidation = {
        valid: false,
        message: 'Transfer not allowed',
      };

      (mockRequest as any).user = { id: 'user-1' };
      mockRequest.body = {
        ticketId: 'ticket-123',
        toUserId: 'user-2',
      };

      (transferService.validateTransferRequest as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateTransfer(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        data: mockValidation,
      });
    });
  });
});
