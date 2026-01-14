/**
 * Unit tests for BuyController
 * Tests purchase flow for crypto and fiat payments
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('@tickettoken/shared', () => ({
  withLock: jest.fn((key, timeout, fn) => fn()),
  LockKeys: {
    listing: (id: string) => `lock:listing:${id}`
  }
}));

jest.mock('../../../src/services/transfer.service', () => ({
  transferService: {
    initiateTransfer: jest.fn(),
    completeTransfer: jest.fn(),
    failTransfer: jest.fn(),
    initiateFiatTransfer: jest.fn()
  }
}));

jest.mock('../../../src/services/blockchain.service', () => ({
  blockchainService: {
    transferNFT: jest.fn()
  }
}));

jest.mock('../../../src/models/listing.model', () => ({
  listingModel: {
    findById: jest.fn()
  }
}));

jest.mock('../../../src/services/stripe-payment.service', () => ({
  stripePaymentService: {
    createPaymentIntent: jest.fn(),
    getSellerStripeAccountId: jest.fn()
  }
}));

import { BuyController, buyController } from '../../../src/controllers/buy.controller';
import { withLock } from '@tickettoken/shared';
import { transferService } from '../../../src/services/transfer.service';
import { blockchainService } from '../../../src/services/blockchain.service';
import { listingModel } from '../../../src/models/listing.model';
import { stripePaymentService } from '../../../src/services/stripe-payment.service';

describe('BuyController', () => {
  let controller: BuyController;
  let mockRequest: any;
  let mockReply: any;

  const mockListing = {
    id: 'listing-001',
    ticketId: 'ticket-123',
    eventId: 'event-456',
    venueId: 'venue-789',
    sellerId: 'seller-user',
    walletAddress: 'seller-wallet-abc',
    price: 10000,
    status: 'active'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BuyController();

    mockRequest = {
      params: { listingId: 'listing-001' },
      body: {},
      user: { 
        id: 'buyer-user',
        walletAddress: 'buyer-wallet-xyz'
      }
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    (listingModel.findById as jest.Mock).mockResolvedValue(mockListing);
  });

  describe('buyListing', () => {
    describe('Validation', () => {
      it('should return 400 if crypto purchase without wallet', async () => {
        mockRequest.body = { paymentMethod: 'crypto' };
        mockRequest.user.walletAddress = undefined;

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Wallet address required for crypto purchase'
        });
      });

      it('should return 404 if listing not found', async () => {
        (listingModel.findById as jest.Mock).mockResolvedValue(null);

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Listing not found'
        });
      });

      it('should return 409 if listing not active', async () => {
        (listingModel.findById as jest.Mock).mockResolvedValue({
          ...mockListing,
          status: 'sold'
        });

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(409);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Listing unavailable',
          reason: 'Listing status is sold'
        });
      });

      it('should return 400 if buyer is seller', async () => {
        mockRequest.user.id = 'seller-user';

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Cannot buy your own listing'
        });
      });

      it('should return 400 if offered price below listing price', async () => {
        mockRequest.body = { offeredPrice: 5000 };

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Offered price below listing price',
          listingPrice: 10000,
          offeredPrice: 5000
        });
      });
    });

    describe('Crypto Purchase', () => {
      const mockTransfer = { id: 'transfer-001' };
      const mockBlockchainResult = {
        signature: 'sig123',
        blockHeight: 12345
      };

      beforeEach(() => {
        mockRequest.body = { paymentMethod: 'crypto' };
        (transferService.initiateTransfer as jest.Mock).mockResolvedValue(mockTransfer);
        (blockchainService.transferNFT as jest.Mock).mockResolvedValue(mockBlockchainResult);
        (transferService.completeTransfer as jest.Mock).mockResolvedValue({});
      });

      it('should use distributed lock on listing', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(withLock).toHaveBeenCalledWith(
          'lock:listing:listing-001',
          10000,
          expect.any(Function)
        );
      });

      it('should initiate transfer with correct params', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(transferService.initiateTransfer).toHaveBeenCalledWith(expect.objectContaining({
          listingId: 'listing-001',
          buyerId: 'buyer-user',
          buyerWallet: 'buyer-wallet-xyz',
          paymentCurrency: 'USDC',
          paymentMethod: 'crypto'
        }));
      });

      it('should execute blockchain transfer', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(blockchainService.transferNFT).toHaveBeenCalledWith({
          tokenId: 'ticket-123',
          fromWallet: 'seller-wallet-abc',
          toWallet: 'buyer-wallet-xyz',
          listingId: 'listing-001',
          price: 10000
        });
      });

      it('should complete transfer after blockchain success', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(transferService.completeTransfer).toHaveBeenCalledWith({
          transferId: 'transfer-001',
          blockchainSignature: 'sig123'
        });
      });

      it('should return success response with transfer details', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          transfer: expect.objectContaining({
            id: 'transfer-001',
            ticketId: 'ticket-123',
            signature: 'sig123',
            blockHeight: 12345,
            status: 'completed',
            paymentMethod: 'crypto'
          })
        }));
      });

      it('should calculate and return fees', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
          transfer: expect.objectContaining({
            price: 10000,
            platformFee: 250, // 2.5%
            venueFee: 500, // 5%
            total: 10750
          })
        }));
      });

      it('should emit ticket.sold event', async () => {
        const emitSpy = jest.spyOn(controller, 'emit');

        await controller.buyListing(mockRequest, mockReply);

        expect(emitSpy).toHaveBeenCalledWith('ticket.sold', expect.objectContaining({
          transferId: 'transfer-001',
          listingId: 'listing-001',
          buyerId: 'buyer-user',
          sellerId: 'seller-user'
        }));
      });
    });

    describe('Fiat Purchase', () => {
      const mockPaymentResult = {
        paymentIntentId: 'pi_123',
        clientSecret: 'secret_abc',
        applicationFeeAmountCents: 750
      };

      const mockFiatTransfer = { id: 'fiat-transfer-001' };

      beforeEach(() => {
        mockRequest.body = { paymentMethod: 'fiat' };
        (stripePaymentService.getSellerStripeAccountId as jest.Mock).mockResolvedValue('acct_seller');
        (stripePaymentService.createPaymentIntent as jest.Mock).mockResolvedValue(mockPaymentResult);
        (transferService.initiateFiatTransfer as jest.Mock).mockResolvedValue(mockFiatTransfer);
      });

      it('should get seller Stripe account ID', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(stripePaymentService.getSellerStripeAccountId).toHaveBeenCalledWith('seller-user');
      });

      it('should return 400 if seller not configured for fiat', async () => {
        (stripePaymentService.getSellerStripeAccountId as jest.Mock).mockResolvedValue(null);

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Seller not configured for fiat payments',
          message: 'This seller has not connected their payment account'
        });
      });

      it('should create Stripe PaymentIntent', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(stripePaymentService.createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
          listingId: 'listing-001',
          sellerId: 'seller-user',
          sellerStripeAccountId: 'acct_seller',
          buyerId: 'buyer-user',
          amountCents: 10000,
          currency: 'usd'
        }));
      });

      it('should initiate fiat transfer', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(transferService.initiateFiatTransfer).toHaveBeenCalledWith(expect.objectContaining({
          listingId: 'listing-001',
          buyerId: 'buyer-user',
          sellerId: 'seller-user',
          paymentIntentId: 'pi_123',
          amountCents: 10000
        }));
      });

      it('should return pending_payment response with client secret', async () => {
        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          transfer: expect.objectContaining({
            status: 'pending_payment',
            paymentMethod: 'fiat',
            clientSecret: 'secret_abc',
            paymentIntentId: 'pi_123'
          })
        }));
      });
    });

    describe('Error Handling', () => {
      beforeEach(() => {
        mockRequest.body = { paymentMethod: 'crypto' };
        (transferService.initiateTransfer as jest.Mock).mockResolvedValue({ id: 'transfer-001' });
      });

      it('should return 400 for insufficient balance error', async () => {
        const error = new Error('Insufficient wallet balance');
        (error as any).transferId = 'transfer-001';
        (blockchainService.transferNFT as jest.Mock).mockRejectedValue(error);

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
          error: 'Insufficient wallet balance'
        }));
      });

      it('should return 503 for blockchain service error', async () => {
        const error = new Error('Blockchain service timeout');
        (error as any).transferId = 'transfer-001';
        (blockchainService.transferNFT as jest.Mock).mockRejectedValue(error);

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(503);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Blockchain service unavailable',
          message: 'Please try again in a moment'
        });
      });

      it('should mark transfer as failed on error', async () => {
        const error = new Error('Transfer failed');
        (error as any).transferId = 'transfer-001';
        (blockchainService.transferNFT as jest.Mock).mockRejectedValue(error);

        await controller.buyListing(mockRequest, mockReply);

        expect(transferService.failTransfer).toHaveBeenCalledWith(
          'transfer-001',
          'Transfer failed'
        );
      });

      it('should return 500 for generic errors', async () => {
        const error = new Error('Unknown error');
        (error as any).transferId = 'transfer-001';
        (blockchainService.transferNFT as jest.Mock).mockRejectedValue(error);

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Purchase failed',
          message: 'Unknown error'
        });
      });
    });

    describe('Lock Handling', () => {
      it('should return 409 if lock is held by another user', async () => {
        (withLock as jest.Mock).mockRejectedValue(new Error('Resource is locked'));

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(409);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Listing is being purchased by another user',
          message: 'Please try again in a moment'
        });
      });

      it('should return 500 for other lock errors', async () => {
        (withLock as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

        await controller.buyListing(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Purchase failed due to system error'
        });
      });
    });
  });

  describe('buyWithRetry', () => {
    beforeEach(() => {
      jest.spyOn(controller, 'buyListing').mockResolvedValue();
    });

    it('should call buyListing', async () => {
      await controller.buyWithRetry(mockRequest, mockReply);

      expect(controller.buyListing).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should retry on deadlock error', async () => {
      const error = { code: '40001' };
      jest.spyOn(controller, 'buyListing')
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce();

      await controller.buyWithRetry(mockRequest, mockReply);

      expect(controller.buyListing).toHaveBeenCalledTimes(2);
    });

    it('should retry on lock error', async () => {
      const error = new Error('Resource is locked');
      jest.spyOn(controller, 'buyListing')
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce();

      await controller.buyWithRetry(mockRequest, mockReply);

      expect(controller.buyListing).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const error = new Error('Resource is locked');
      jest.spyOn(controller, 'buyListing')
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce();

      const start = Date.now();
      await controller.buyWithRetry(mockRequest, mockReply);
      const elapsed = Date.now() - start;

      // First retry should wait ~200ms (2^1 * 100)
      expect(elapsed).toBeGreaterThanOrEqual(150);
    });

    it('should return 409 after max retries', async () => {
      const error = new Error('Resource is locked');
      jest.spyOn(controller, 'buyListing')
        .mockRejectedValue(error);

      await controller.buyWithRetry(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unable to complete purchase due to high demand',
        message: 'Please try again'
      });
    });

    it('should throw non-retryable errors immediately', async () => {
      const error = new Error('Invalid request');
      jest.spyOn(controller, 'buyListing').mockRejectedValue(error);

      await expect(controller.buyWithRetry(mockRequest, mockReply)).rejects.toThrow('Invalid request');
    });
  });

  describe('Singleton export', () => {
    it('should export singleton instance', () => {
      expect(buyController).toBeInstanceOf(BuyController);
    });

    it('should extend EventEmitter', () => {
      expect(typeof buyController.on).toBe('function');
      expect(typeof buyController.emit).toBe('function');
    });
  });
});
