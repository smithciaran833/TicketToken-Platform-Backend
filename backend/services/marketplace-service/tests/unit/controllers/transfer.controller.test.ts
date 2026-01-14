/**
 * Unit Tests for TransferController
 * Tests HTTP handlers for transfer operations
 */

import { FastifyReply } from 'fastify';
import { TransferController, transferController } from '../../../src/controllers/transfer.controller';
import { transferService } from '../../../src/services/transfer.service';
import { WalletRequest } from '../../../src/middleware/wallet.middleware';

// Mock dependencies
jest.mock('../../../src/services/transfer.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('TransferController', () => {
  let controller: TransferController;
  let mockRequest: Partial<WalletRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TransferController();

    mockRequest = {
      user: { id: 'user-123', email: 'test@example.com' },
      wallet: { address: 'wallet-address-123' },
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

  describe('initiateTransfer', () => {
    it('should initiate transfer successfully', async () => {
      const mockTransfer = {
        id: 'transfer-123',
        status: 'pending',
        listing_id: 'listing-456',
      };

      mockRequest.body = {
        listingId: 'listing-456',
        paymentMethod: 'crypto',
      };

      (transferService.initiateTransfer as jest.Mock).mockResolvedValue(mockTransfer);

      await controller.initiateTransfer(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(transferService.initiateTransfer).toHaveBeenCalledWith({
        listingId: 'listing-456',
        paymentMethod: 'crypto',
        buyerId: 'user-123',
        buyerWallet: 'wallet-address-123',
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          transferId: 'transfer-123',
          status: 'pending',
          expiresIn: 600,
        },
      });
    });

    it('should propagate errors from service', async () => {
      const error = new Error('Listing not found');
      mockRequest.body = { listingId: 'invalid-listing' };

      (transferService.initiateTransfer as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.initiateTransfer(mockRequest as WalletRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Listing not found');
    });
  });

  describe('confirmTransfer', () => {
    it('should confirm transfer successfully', async () => {
      const mockTransfer = {
        id: 'transfer-123',
        status: 'completed',
        blockchain_signature: 'sig-abc',
      };

      mockRequest.params = { id: 'transfer-123' };
      mockRequest.body = { signature: 'sig-abc' };

      (transferService.completeTransfer as jest.Mock).mockResolvedValue(mockTransfer);

      await controller.confirmTransfer(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(transferService.completeTransfer).toHaveBeenCalledWith({
        transferId: 'transfer-123',
        blockchainSignature: 'sig-abc',
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransfer,
      });
    });

    it('should propagate errors on invalid signature', async () => {
      const error = new Error('Invalid blockchain signature');
      mockRequest.params = { id: 'transfer-123' };
      mockRequest.body = { signature: 'invalid-sig' };

      (transferService.completeTransfer as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.confirmTransfer(mockRequest as WalletRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid blockchain signature');
    });
  });

  describe('getTransfer', () => {
    it('should get transfer by ID', async () => {
      const mockTransfer = {
        id: 'transfer-123',
        status: 'completed',
        listing_id: 'listing-456',
        buyer_id: 'user-123',
      };

      mockRequest.params = { id: 'transfer-123' };

      (transferService.getTransferById as jest.Mock).mockResolvedValue(mockTransfer);

      await controller.getTransfer(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(transferService.getTransferById).toHaveBeenCalledWith('transfer-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransfer,
      });
    });

    it('should propagate error if transfer not found', async () => {
      const error = new Error('Transfer not found');
      mockRequest.params = { id: 'invalid-id' };

      (transferService.getTransferById as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.getTransfer(mockRequest as WalletRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Transfer not found');
    });
  });

  describe('getMyPurchases', () => {
    it('should get user purchases with default pagination', async () => {
      const mockTransfers = [
        { id: 'transfer-1', status: 'completed' },
        { id: 'transfer-2', status: 'pending' },
      ];

      mockRequest.query = {};

      (transferService.getUserTransfers as jest.Mock).mockResolvedValue(mockTransfers);

      await controller.getMyPurchases(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(transferService.getUserTransfers).toHaveBeenCalledWith('user-123', 'buyer', 20, 0);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransfers,
        pagination: {
          limit: 20,
          offset: 0,
        },
      });
    });

    it('should use custom pagination parameters', async () => {
      const mockTransfers = [{ id: 'transfer-1' }];

      mockRequest.query = { limit: '10', offset: '5' };

      (transferService.getUserTransfers as jest.Mock).mockResolvedValue(mockTransfers);

      await controller.getMyPurchases(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(transferService.getUserTransfers).toHaveBeenCalledWith('user-123', 'buyer', 10, 5);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransfers,
        pagination: {
          limit: 10,
          offset: 5,
        },
      });
    });

    it('should propagate service errors', async () => {
      const error = new Error('Database error');

      (transferService.getUserTransfers as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.getMyPurchases(mockRequest as WalletRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getMySales', () => {
    it('should get user sales with default pagination', async () => {
      const mockTransfers = [
        { id: 'transfer-1', status: 'completed' },
        { id: 'transfer-2', status: 'completed' },
      ];

      mockRequest.query = {};

      (transferService.getUserTransfers as jest.Mock).mockResolvedValue(mockTransfers);

      await controller.getMySales(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(transferService.getUserTransfers).toHaveBeenCalledWith('user-123', 'seller', 20, 0);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransfers,
        pagination: {
          limit: 20,
          offset: 0,
        },
      });
    });

    it('should use custom pagination parameters', async () => {
      const mockTransfers = [];

      mockRequest.query = { limit: '50', offset: '100' };

      (transferService.getUserTransfers as jest.Mock).mockResolvedValue(mockTransfers);

      await controller.getMySales(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(transferService.getUserTransfers).toHaveBeenCalledWith('user-123', 'seller', 50, 100);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransfers,
        pagination: {
          limit: 50,
          offset: 100,
        },
      });
    });
  });

  describe('purchaseListing', () => {
    it('should return success (stub implementation)', async () => {
      await controller.purchaseListing(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('directTransfer', () => {
    it('should return success (stub implementation)', async () => {
      await controller.directTransfer(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('getTransferHistory', () => {
    it('should return empty history (stub implementation)', async () => {
      await controller.getTransferHistory(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ history: [] });
    });
  });

  describe('cancelTransfer', () => {
    it('should return success (stub implementation)', async () => {
      await controller.cancelTransfer(mockRequest as WalletRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(transferController).toBeInstanceOf(TransferController);
    });
  });
});
