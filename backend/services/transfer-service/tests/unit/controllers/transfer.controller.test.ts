import { TransferController } from '../../../src/controllers/transfer.controller';
import { TransferService } from '../../../src/services/transfer.service';
import { TransferError } from '../../../src/models/transfer.model';
import { Pool } from 'pg';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/services/transfer.service');
jest.mock('../../../src/utils/logger');

describe('TransferController - Unit Tests', () => {
  let controller: TransferController;
  let mockPool: jest.Mocked<Pool>;
  let mockTransferService: jest.Mocked<TransferService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock pool
    mockPool = {} as jest.Mocked<Pool>;

    // Create controller
    controller = new TransferController(mockPool);

    // Get mocked service instance
    mockTransferService = (controller as any).transferService as jest.Mocked<TransferService>;

    // Create mock request
    mockRequest = {
      user: { id: 'user-123' },
      body: {},
      params: {}
    };

    // Create mock reply
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('createGiftTransfer', () => {
    it('should create gift transfer successfully', async () => {
      const transferData = {
        ticketId: 'ticket-123',
        toEmail: 'recipient@example.com',
        message: 'Happy Birthday!'
      };

      const expectedResult = {
        transferId: 'transfer-123',
        status: 'PENDING',
        ...transferData
      };

      mockRequest.body = transferData;
      mockTransferService.createGiftTransfer = jest.fn().mockResolvedValue(expectedResult);

      await controller.createGiftTransfer(
        mockRequest as FastifyRequest<{ Body: typeof transferData }>,
        mockReply as FastifyReply
      );

      expect(mockTransferService.createGiftTransfer).toHaveBeenCalledWith('user-123', transferData);
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(expectedResult);
    });

    it('should create gift transfer without message', async () => {
      const transferData = {
        ticketId: 'ticket-123',
        toEmail: 'recipient@example.com'
      };

      const expectedResult = {
        transferId: 'transfer-123',
        status: 'PENDING',
        ...transferData
      };

      mockRequest.body = transferData;
      mockTransferService.createGiftTransfer = jest.fn().mockResolvedValue(expectedResult);

      await controller.createGiftTransfer(
        mockRequest as FastifyRequest<{ Body: typeof transferData }>,
        mockReply as FastifyReply
      );

      expect(mockTransferService.createGiftTransfer).toHaveBeenCalledWith('user-123', transferData);
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(expectedResult);
    });

    it('should handle TransferError with correct status code', async () => {
      const transferData = {
        ticketId: 'ticket-123',
        toEmail: 'recipient@example.com'
      };

      const error = new TransferError(
        'Ticket not found',
        'TICKET_NOT_FOUND',
        404
      );

      mockRequest.body = transferData;
      mockTransferService.createGiftTransfer = jest.fn().mockRejectedValue(error);

      await controller.createGiftTransfer(
        mockRequest as FastifyRequest<{ Body: typeof transferData }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'TICKET_NOT_FOUND',
        message: 'Ticket not found'
      });
    });

    it('should handle generic errors with 500 status', async () => {
      const transferData = {
        ticketId: 'ticket-123',
        toEmail: 'recipient@example.com'
      };

      const error = new Error('Database connection failed');

      mockRequest.body = transferData;
      mockTransferService.createGiftTransfer = jest.fn().mockRejectedValue(error);

      await controller.createGiftTransfer(
        mockRequest as FastifyRequest<{ Body: typeof transferData }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      });
    });
  });

  describe('acceptTransfer', () => {
    it('should accept transfer successfully', async () => {
      const acceptData = {
        acceptanceCode: 'ABC123',
        userId: 'user-456'
      };

      const expectedResult = {
        transferId: 'transfer-123',
        status: 'COMPLETED',
        completedAt: new Date().toISOString()
      };

      mockRequest.params = { transferId: 'transfer-123' };
      mockRequest.body = acceptData;
      mockTransferService.acceptTransfer = jest.fn().mockResolvedValue(expectedResult);

      await controller.acceptTransfer(
        mockRequest as FastifyRequest<{
          Params: { transferId: string };
          Body: typeof acceptData;
        }>,
        mockReply as FastifyReply
      );

      expect(mockTransferService.acceptTransfer).toHaveBeenCalledWith('transfer-123', acceptData);
      expect(mockReply.send).toHaveBeenCalledWith(expectedResult);
      expect(mockReply.code).not.toHaveBeenCalled(); // No explicit status code for 200
    });

    it('should handle invalid acceptance code', async () => {
      const acceptData = {
        acceptanceCode: 'WRONG',
        userId: 'user-456'
      };

      const error = new TransferError(
        'Invalid acceptance code',
        'INVALID_ACCEPTANCE_CODE',
        400
      );

      mockRequest.params = { transferId: 'transfer-123' };
      mockRequest.body = acceptData;
      mockTransferService.acceptTransfer = jest.fn().mockRejectedValue(error);

      await controller.acceptTransfer(
        mockRequest as FastifyRequest<{
          Params: { transferId: string };
          Body: typeof acceptData;
        }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'INVALID_ACCEPTANCE_CODE',
        message: 'Invalid acceptance code'
      });
    });

    it('should handle transfer not found', async () => {
      const acceptData = {
        acceptanceCode: 'ABC123',
        userId: 'user-456'
      };

      const error = new TransferError(
        'Transfer not found',
        'TRANSFER_NOT_FOUND',
        404
      );

      mockRequest.params = { transferId: 'nonexistent-id' };
      mockRequest.body = acceptData;
      mockTransferService.acceptTransfer = jest.fn().mockRejectedValue(error);

      await controller.acceptTransfer(
        mockRequest as FastifyRequest<{
          Params: { transferId: string };
          Body: typeof acceptData;
        }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'TRANSFER_NOT_FOUND',
        message: 'Transfer not found'
      });
    });

    it('should handle transfer already accepted', async () => {
      const acceptData = {
        acceptanceCode: 'ABC123',
        userId: 'user-456'
      };

      const error = new TransferError(
        'Transfer has already been accepted',
        'TRANSFER_ALREADY_ACCEPTED',
        409
      );

      mockRequest.params = { transferId: 'transfer-123' };
      mockRequest.body = acceptData;
      mockTransferService.acceptTransfer = jest.fn().mockRejectedValue(error);

      await controller.acceptTransfer(
        mockRequest as FastifyRequest<{
          Params: { transferId: string };
          Body: typeof acceptData;
        }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'TRANSFER_ALREADY_ACCEPTED',
        message: 'Transfer has already been accepted'
      });
    });

    it('should handle generic errors with 500 status', async () => {
      const acceptData = {
        acceptanceCode: 'ABC123',
        userId: 'user-456'
      };

      const error = new Error('Unexpected error');

      mockRequest.params = { transferId: 'transfer-123' };
      mockRequest.body = acceptData;
      mockTransferService.acceptTransfer = jest.fn().mockRejectedValue(error);

      await controller.acceptTransfer(
        mockRequest as FastifyRequest<{
          Params: { transferId: string };
          Body: typeof acceptData;
        }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle TransferError with all status codes', async () => {
      const statusCodes = [400, 401, 403, 404, 409, 422, 500];

      for (const statusCode of statusCodes) {
        jest.clearAllMocks();

        const error = new TransferError(
          'Test error message',
          'TEST_ERROR',
          statusCode
        );

        mockRequest.body = { ticketId: 'ticket-123', toEmail: 'test@example.com' };
        mockTransferService.createGiftTransfer = jest.fn().mockRejectedValue(error);

        await controller.createGiftTransfer(
          mockRequest as any,
          mockReply as FastifyReply
        );

        expect(mockReply.code).toHaveBeenCalledWith(statusCode);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'TEST_ERROR',
          message: 'Test error message'
        });
      }
    });

    it('should handle errors without message property', async () => {
      const error = { toString: () => 'Unknown error' };

      mockRequest.body = { ticketId: 'ticket-123', toEmail: 'test@example.com' };
      mockTransferService.createGiftTransfer = jest.fn().mockRejectedValue(error);

      await controller.createGiftTransfer(
        mockRequest as any,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      });
    });
  });
});
