/**
 * Unit Tests for DisputeController
 * Tests HTTP handlers for dispute operations
 */

import { FastifyReply } from 'fastify';
import { DisputeController, disputeController } from '../../../src/controllers/dispute.controller';
import { AuthRequest } from '../../../src/middleware/auth.middleware';
import { disputeService } from '../../../src/services/dispute.service';
import { ValidationError } from '../../../src/utils/errors';

// Mock dependencies
jest.mock('../../../src/services/dispute.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('DisputeController', () => {
  let controller: DisputeController;
  let mockRequest: Partial<AuthRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DisputeController();

    mockRequest = {
      user: { id: 'user-123', email: 'test@example.com' },
      params: {},
      query: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('create', () => {
    it('should create dispute successfully', async () => {
      const mockDispute = {
        id: 'dispute-123',
        transfer_id: 'transfer-456',
        listing_id: 'listing-789',
        initiator_id: 'user-123',
        reason: 'Item not as described',
        status: 'open',
      };

      mockRequest.body = {
        transferId: 'transfer-456',
        listingId: 'listing-789',
        reason: 'Item not as described',
        description: 'The ticket was for wrong section',
        evidence: [{ type: 'screenshot', url: 'http://example.com/img.jpg' }],
      };

      (disputeService.createDispute as jest.Mock).mockResolvedValue(mockDispute);

      await controller.create(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(disputeService.createDispute).toHaveBeenCalledWith(
        'transfer-456',
        'listing-789',
        'user-123',
        'Item not as described',
        'The ticket was for wrong section',
        [{ type: 'screenshot', url: 'http://example.com/img.jpg' }]
      );

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockDispute,
      });
    });

    it('should throw ValidationError if user ID is missing', async () => {
      mockRequest.user = undefined;
      mockRequest.body = {
        transferId: 'transfer-456',
        reason: 'Test reason',
      };

      await expect(
        controller.create(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should propagate service errors', async () => {
      const error = new Error('Transfer not found');
      mockRequest.body = {
        transferId: 'invalid-transfer',
        reason: 'Test reason',
      };

      (disputeService.createDispute as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.create(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Transfer not found');
    });
  });

  describe('getById', () => {
    it('should return dispute by ID', async () => {
      const mockDispute = {
        id: 'dispute-123',
        transfer_id: 'transfer-456',
        status: 'open',
        reason: 'Item not as described',
      };

      mockRequest.params = { disputeId: 'dispute-123' };

      (disputeService.getDispute as jest.Mock).mockResolvedValue(mockDispute);

      await controller.getById(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(disputeService.getDispute).toHaveBeenCalledWith('dispute-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockDispute,
      });
    });

    it('should return 404 if dispute not found', async () => {
      mockRequest.params = { disputeId: 'non-existent' };

      (disputeService.getDispute as jest.Mock).mockResolvedValue(null);

      await controller.getById(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Dispute not found' });
    });

    it('should propagate service errors', async () => {
      const error = new Error('Database error');
      mockRequest.params = { disputeId: 'dispute-123' };

      (disputeService.getDispute as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.getById(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('addEvidence', () => {
    it('should add evidence to dispute successfully', async () => {
      mockRequest.params = { disputeId: 'dispute-123' };
      mockRequest.body = {
        type: 'screenshot',
        content: 'https://example.com/evidence.png',
        metadata: { description: 'Evidence photo' },
      };

      (disputeService.addEvidence as jest.Mock).mockResolvedValue(undefined);

      await controller.addEvidence(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(disputeService.addEvidence).toHaveBeenCalledWith(
        'dispute-123',
        'user-123',
        'screenshot',
        'https://example.com/evidence.png',
        { description: 'Evidence photo' }
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Evidence added',
      });
    });

    it('should throw ValidationError if user ID is missing', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { disputeId: 'dispute-123' };
      mockRequest.body = { type: 'text', content: 'Some evidence' };

      await expect(
        controller.addEvidence(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should propagate service errors', async () => {
      const error = new Error('Not authorized to add evidence');
      mockRequest.params = { disputeId: 'dispute-123' };
      mockRequest.body = { type: 'text', content: 'Some evidence' };

      (disputeService.addEvidence as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.addEvidence(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Not authorized to add evidence');
    });
  });

  describe('getMyDisputes', () => {
    it('should return user disputes', async () => {
      const mockDisputes = [
        { id: 'dispute-1', status: 'open', reason: 'Test 1' },
        { id: 'dispute-2', status: 'resolved', reason: 'Test 2' },
      ];

      (disputeService.getUserDisputes as jest.Mock).mockResolvedValue(mockDisputes);

      await controller.getMyDisputes(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(disputeService.getUserDisputes).toHaveBeenCalledWith('user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockDisputes,
      });
    });

    it('should return empty array if user has no disputes', async () => {
      (disputeService.getUserDisputes as jest.Mock).mockResolvedValue([]);

      await controller.getMyDisputes(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('should throw ValidationError if user ID is missing', async () => {
      mockRequest.user = undefined;

      await expect(
        controller.getMyDisputes(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should propagate service errors', async () => {
      const error = new Error('Database error');

      (disputeService.getUserDisputes as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.getMyDisputes(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(disputeController).toBeInstanceOf(DisputeController);
    });
  });
});
