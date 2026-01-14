/**
 * Unit Tests for Transfer Service
 * Tests marketplace transfer initiation and completion
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock models
const mockTransferModel = {
  create: jest.fn(),
  findById: jest.fn(),
  findByBuyerId: jest.fn(),
  findBySellerId: jest.fn(),
  updateStatus: jest.fn(),
  updateBlockchainData: jest.fn()
};

const mockListingModel = {
  findById: jest.fn(),
  updateStatus: jest.fn()
};

const mockFeeModel = {
  create: jest.fn(),
  findByTransferId: jest.fn(),
  updateFeeCollection: jest.fn()
};

jest.mock('../../../src/models/transfer.model', () => ({
  transferModel: mockTransferModel
}));

jest.mock('../../../src/models/listing.model', () => ({
  listingModel: mockListingModel
}));

jest.mock('../../../src/models/fee.model', () => ({
  feeModel: mockFeeModel
}));

// Mock services
const mockValidationService = {
  validateTransfer: jest.fn()
};

const mockBlockchainService = {
  getWalletBalance: jest.fn(),
  validateTransaction: jest.fn(),
  calculateNetworkFee: jest.fn(() => 0.00025),
  getConnection: jest.fn(() => ({
    getBlockHeight: jest.fn().mockResolvedValue(12345)
  }))
};

const mockListingService = {
  markListingAsSold: jest.fn()
};

const mockFeeService = {
  getEventRoyaltyData: jest.fn()
};

const mockStripePaymentService = {
  getSellerStripeAccountId: jest.fn(),
  createPaymentIntent: jest.fn(),
  createPaymentIntentWithSeparateCharges: jest.fn(),
  getPaymentIntent: jest.fn(),
  createTransferToSeller: jest.fn(),
  createTransferToVenue: jest.fn()
};

jest.mock('../../../src/services/validation.service', () => ({
  validationService: mockValidationService
}));

jest.mock('../../../src/services/blockchain.service', () => ({
  blockchainService: mockBlockchainService
}));

jest.mock('../../../src/services/listing.service', () => ({
  listingService: mockListingService
}));

jest.mock('../../../src/services/fee.service', () => ({
  feeService: mockFeeService
}));

jest.mock('../../../src/services/stripe-payment.service', () => ({
  stripePaymentService: mockStripePaymentService
}));

// Mock config
jest.mock('../../../src/config', () => ({
  constants: {
    FEES: {
      PLATFORM_FEE_PERCENTAGE: 0.025,
      DEFAULT_VENUE_FEE_PERCENTAGE: 0.05
    }
  }
}));

jest.mock('../../../src/config/constants', () => ({
  FEATURE_FLAGS: {
    ENABLE_VENUE_ROYALTY_SPLIT: false
  }
}));

// Mock database
const mockDb = jest.fn().mockReturnValue({
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn(),
  update: jest.fn().mockReturnThis(),
  increment: jest.fn().mockReturnThis(),
  fn: { now: jest.fn() }
});
mockDb.fn = { now: jest.fn() };

jest.mock('../../../src/config/database', () => ({
  db: mockDb
}));

// Mock blockchain client
jest.mock('../../../../shared/src/blockchain/client', () => ({
  BlockchainClient: jest.fn().mockImplementation(() => ({
    transferTicket: jest.fn().mockResolvedValue('sig_blockchain123')
  }))
}));

// Mock errors
jest.mock('../../../src/utils/errors', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(entity: string) {
      super(`${entity} not found`);
      this.name = 'NotFoundError';
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  }
}));

import { TransferService, transferService } from '../../../src/services/transfer.service';

describe('TransferService', () => {
  const mockListing = {
    id: 'listing-123',
    ticketId: 'ticket-456',
    sellerId: 'seller-789',
    eventId: 'event-111',
    venueId: 'venue-222',
    price: 10000,
    walletAddress: 'seller-wallet-abc'
  };

  const mockTransfer = {
    id: 'transfer-123',
    listingId: 'listing-123',
    buyerId: 'buyer-999',
    sellerId: 'seller-789',
    eventId: 'event-111',
    venueId: 'venue-222',
    status: 'initiated',
    stripePaymentIntentId: 'pi_123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateTransfer', () => {
    const initiateDto = {
      listingId: 'listing-123',
      buyerId: 'buyer-999',
      buyerWallet: 'buyer-wallet-xyz',
      paymentCurrency: 'USDC' as const,
      eventStartTime: new Date('2025-01-20')
    };

    it('should validate listing exists', async () => {
      mockListingModel.findById.mockResolvedValue(null);

      await expect(transferService.initiateTransfer(initiateDto))
        .rejects.toThrow('not found');
    });

    it('should validate transfer requirements', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockValidationService.validateTransfer.mockResolvedValue(undefined);
      mockBlockchainService.getWalletBalance.mockResolvedValue(100);
      mockTransferModel.create.mockResolvedValue(mockTransfer);
      mockFeeModel.create.mockResolvedValue({ id: 'fee-123' });

      await transferService.initiateTransfer(initiateDto);

      expect(mockValidationService.validateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: 'listing-123',
          buyerId: 'buyer-999',
          buyerWallet: 'buyer-wallet-xyz'
        })
      );
    });

    it('should check buyer wallet balance', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockValidationService.validateTransfer.mockResolvedValue(undefined);
      mockBlockchainService.getWalletBalance.mockResolvedValue(100);
      mockTransferModel.create.mockResolvedValue(mockTransfer);
      mockFeeModel.create.mockResolvedValue({ id: 'fee-123' });

      await transferService.initiateTransfer(initiateDto);

      expect(mockBlockchainService.getWalletBalance).toHaveBeenCalledWith('buyer-wallet-xyz');
    });

    it('should throw ValidationError on insufficient balance', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockValidationService.validateTransfer.mockResolvedValue(undefined);
      mockBlockchainService.getWalletBalance.mockResolvedValue(0.001); // Very low balance

      await expect(transferService.initiateTransfer(initiateDto))
        .rejects.toThrow('Insufficient wallet balance');
    });

    it('should create transfer record', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockValidationService.validateTransfer.mockResolvedValue(undefined);
      mockBlockchainService.getWalletBalance.mockResolvedValue(100);
      mockTransferModel.create.mockResolvedValue(mockTransfer);
      mockFeeModel.create.mockResolvedValue({ id: 'fee-123' });

      const result = await transferService.initiateTransfer(initiateDto);

      expect(mockTransferModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: 'listing-123',
          buyerId: 'buyer-999',
          sellerId: 'seller-789'
        })
      );
      expect(result.id).toBe('transfer-123');
    });

    it('should create fee record', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockValidationService.validateTransfer.mockResolvedValue(undefined);
      mockBlockchainService.getWalletBalance.mockResolvedValue(100);
      mockTransferModel.create.mockResolvedValue(mockTransfer);
      mockFeeModel.create.mockResolvedValue({ id: 'fee-123' });

      await transferService.initiateTransfer(initiateDto);

      expect(mockFeeModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transferId: 'transfer-123',
          salePrice: 10000
        })
      );
    });
  });

  describe('completeTransfer', () => {
    const completeDto = {
      transferId: 'transfer-123',
      blockchainSignature: 'sig_blockchain456'
    };

    it('should validate transfer exists', async () => {
      mockTransferModel.findById.mockResolvedValue(null);

      await expect(transferService.completeTransfer(completeDto))
        .rejects.toThrow('not found');
    });

    it('should reject invalid status', async () => {
      mockTransferModel.findById.mockResolvedValue({
        ...mockTransfer,
        status: 'completed'
      });

      await expect(transferService.completeTransfer(completeDto))
        .rejects.toThrow('Cannot complete transfer with status');
    });

    it('should validate blockchain transaction', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockBlockchainService.validateTransaction.mockResolvedValue(false);

      await expect(transferService.completeTransfer(completeDto))
        .rejects.toThrow('Invalid blockchain signature');
    });

    it('should update blockchain data', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockBlockchainService.validateTransaction.mockResolvedValue(true);
      mockTransferModel.updateBlockchainData.mockResolvedValue(mockTransfer);
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingService.markListingAsSold.mockResolvedValue(undefined);
      mockFeeModel.findByTransferId.mockResolvedValue({ id: 'fee-123' });
      mockFeeModel.updateFeeCollection.mockResolvedValue(undefined);

      await transferService.completeTransfer(completeDto);

      expect(mockTransferModel.updateBlockchainData).toHaveBeenCalledWith(
        'transfer-123',
        'sig_blockchain456',
        12345,
        0.00025
      );
    });

    it('should mark transfer as completed', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockBlockchainService.validateTransaction.mockResolvedValue(true);
      mockTransferModel.updateBlockchainData.mockResolvedValue(mockTransfer);
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingService.markListingAsSold.mockResolvedValue(undefined);
      mockFeeModel.findByTransferId.mockResolvedValue({ id: 'fee-123' });
      mockFeeModel.updateFeeCollection.mockResolvedValue(undefined);

      await transferService.completeTransfer(completeDto);

      expect(mockTransferModel.updateStatus).toHaveBeenCalledWith('transfer-123', 'completed');
    });

    it('should mark listing as sold', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockBlockchainService.validateTransaction.mockResolvedValue(true);
      mockTransferModel.updateBlockchainData.mockResolvedValue(mockTransfer);
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingService.markListingAsSold.mockResolvedValue(undefined);
      mockFeeModel.findByTransferId.mockResolvedValue({ id: 'fee-123' });
      mockFeeModel.updateFeeCollection.mockResolvedValue(undefined);

      await transferService.completeTransfer(completeDto);

      expect(mockListingService.markListingAsSold).toHaveBeenCalledWith('listing-123', 'buyer-999');
    });

    it('should update fee collection', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockBlockchainService.validateTransaction.mockResolvedValue(true);
      mockTransferModel.updateBlockchainData.mockResolvedValue(mockTransfer);
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingService.markListingAsSold.mockResolvedValue(undefined);
      mockFeeModel.findByTransferId.mockResolvedValue({ id: 'fee-123' });
      mockFeeModel.updateFeeCollection.mockResolvedValue(undefined);

      await transferService.completeTransfer(completeDto);

      expect(mockFeeModel.updateFeeCollection).toHaveBeenCalledWith(
        'fee-123',
        true,
        true,
        'sig_blockchain456',
        'sig_blockchain456'
      );
    });
  });

  describe('failTransfer', () => {
    it('should update status to failed', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingModel.updateStatus.mockResolvedValue(undefined);

      await transferService.failTransfer('transfer-123', 'Network timeout');

      expect(mockTransferModel.updateStatus).toHaveBeenCalledWith(
        'transfer-123',
        'failed',
        { failureReason: 'Network timeout' }
      );
    });

    it('should record failure reason', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingModel.updateStatus.mockResolvedValue(undefined);

      await transferService.failTransfer('transfer-123', 'Blockchain error');

      expect(mockTransferModel.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        'failed',
        expect.objectContaining({ failureReason: 'Blockchain error' })
      );
    });

    it('should reactivate listing', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingModel.updateStatus.mockResolvedValue(undefined);

      await transferService.failTransfer('transfer-123', 'Timeout');

      expect(mockListingModel.updateStatus).toHaveBeenCalledWith('listing-123', 'active');
    });
  });

  describe('getTransferById', () => {
    it('should return transfer', async () => {
      mockTransferModel.findById.mockResolvedValue(mockTransfer);

      const result = await transferService.getTransferById('transfer-123');

      expect(result).toEqual(mockTransfer);
    });

    it('should throw NotFoundError', async () => {
      mockTransferModel.findById.mockResolvedValue(null);

      await expect(transferService.getTransferById('nonexistent'))
        .rejects.toThrow('not found');
    });
  });

  describe('getUserTransfers', () => {
    it('should return buyer transfers', async () => {
      const transfers = [mockTransfer];
      mockTransferModel.findByBuyerId.mockResolvedValue(transfers);

      const result = await transferService.getUserTransfers('user-123', 'buyer');

      expect(mockTransferModel.findByBuyerId).toHaveBeenCalledWith('user-123', 20, 0);
      expect(result).toEqual(transfers);
    });

    it('should return seller transfers', async () => {
      const transfers = [mockTransfer];
      mockTransferModel.findBySellerId.mockResolvedValue(transfers);

      const result = await transferService.getUserTransfers('user-123', 'seller');

      expect(mockTransferModel.findBySellerId).toHaveBeenCalledWith('user-123', 20, 0);
      expect(result).toEqual(transfers);
    });

    it('should apply pagination', async () => {
      mockTransferModel.findByBuyerId.mockResolvedValue([]);

      await transferService.getUserTransfers('user-123', 'buyer', 50, 100);

      expect(mockTransferModel.findByBuyerId).toHaveBeenCalledWith('user-123', 50, 100);
    });
  });

  describe('initiateFiatTransfer', () => {
    const fiatDto = {
      listingId: 'listing-123',
      buyerId: 'buyer-999',
      sellerId: 'seller-789',
      paymentIntentId: 'pi_123',
      amountCents: 10000,
      applicationFeeCents: 750,
      currency: 'usd'
    };

    it('should validate listing exists', async () => {
      mockListingModel.findById.mockResolvedValue(null);

      await expect(transferService.initiateFiatTransfer(fiatDto))
        .rejects.toThrow('not found');
    });

    it('should check seller Stripe onboarding', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockStripePaymentService.getSellerStripeAccountId.mockResolvedValue(null);

      await expect(transferService.initiateFiatTransfer(fiatDto))
        .rejects.toThrow('Seller has not completed Stripe Connect onboarding');
    });

    it('should use destination charges flow by default', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockStripePaymentService.getSellerStripeAccountId.mockResolvedValue('acct_seller123');
      mockStripePaymentService.createPaymentIntent.mockResolvedValue({
        paymentIntentId: 'pi_new123',
        applicationFeeAmountCents: 750
      });
      mockTransferModel.create.mockResolvedValue(mockTransfer);
      mockFeeModel.create.mockResolvedValue({ id: 'fee-123' });

      await transferService.initiateFiatTransfer(fiatDto);

      expect(mockStripePaymentService.createPaymentIntent).toHaveBeenCalled();
      expect(mockStripePaymentService.createPaymentIntentWithSeparateCharges).not.toHaveBeenCalled();
    });

    it('should create transfer record for fiat', async () => {
      mockListingModel.findById.mockResolvedValue(mockListing);
      mockStripePaymentService.getSellerStripeAccountId.mockResolvedValue('acct_seller123');
      mockStripePaymentService.createPaymentIntent.mockResolvedValue({
        paymentIntentId: 'pi_new123',
        applicationFeeAmountCents: 750
      });
      mockTransferModel.create.mockResolvedValue(mockTransfer);
      mockFeeModel.create.mockResolvedValue({ id: 'fee-123' });

      const result = await transferService.initiateFiatTransfer(fiatDto);

      expect(mockTransferModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: 'fiat',
          stripePaymentIntentId: 'pi_new123'
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('completeFiatTransfer', () => {
    const mockPaymentIntent = {
      id: 'pi_123',
      latest_charge: 'ch_charge123',
      metadata: {
        seller_stripe_account_id: 'acct_seller123',
        venue_stripe_account_id: 'acct_venue123',
        seller_amount_cents: '9250',
        venue_amount_cents: '500'
      }
    };

    beforeEach(() => {
      mockTransferModel.findById.mockResolvedValue({
        ...mockTransfer,
        stripePaymentIntentId: 'pi_123'
      });
      mockStripePaymentService.getPaymentIntent.mockResolvedValue(mockPaymentIntent);
      mockStripePaymentService.createTransferToSeller.mockResolvedValue({ transferId: 'tr_seller123' });
      mockStripePaymentService.createTransferToVenue.mockResolvedValue({ transferId: 'tr_venue123' });
      mockTransferModel.updateStatus.mockResolvedValue(mockTransfer);
      mockListingService.markListingAsSold.mockResolvedValue(undefined);
      mockFeeModel.findByTransferId.mockResolvedValue({ id: 'fee-123' });
      mockFeeModel.updateFeeCollection.mockResolvedValue(undefined);
      mockListingModel.findById.mockResolvedValue(mockListing);
    });

    it('should retrieve PaymentIntent', async () => {
      await transferService.completeFiatTransfer('transfer-123');

      expect(mockStripePaymentService.getPaymentIntent).toHaveBeenCalledWith('pi_123');
    });

    it('should extract charge ID', async () => {
      await transferService.completeFiatTransfer('transfer-123');

      expect(mockStripePaymentService.createTransferToSeller).toHaveBeenCalledWith(
        'ch_charge123',
        expect.any(String),
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should create transfer to seller', async () => {
      await transferService.completeFiatTransfer('transfer-123');

      expect(mockStripePaymentService.createTransferToSeller).toHaveBeenCalledWith(
        'ch_charge123',
        'acct_seller123',
        9250,
        expect.objectContaining({
          listingId: 'listing-123',
          sellerId: 'seller-789'
        })
      );
    });

    it('should create transfer to venue', async () => {
      await transferService.completeFiatTransfer('transfer-123');

      expect(mockStripePaymentService.createTransferToVenue).toHaveBeenCalledWith(
        'ch_charge123',
        'acct_venue123',
        500,
        expect.objectContaining({
          listingId: 'listing-123'
        })
      );
    });

    it('should update transfer status', async () => {
      await transferService.completeFiatTransfer('transfer-123');

      expect(mockTransferModel.updateStatus).toHaveBeenCalledWith(
        'transfer-123',
        'completed',
        expect.objectContaining({
          seller_transfer_id: 'tr_seller123',
          venue_transfer_id: 'tr_venue123'
        })
      );
    });

    it('should mark listing as sold', async () => {
      await transferService.completeFiatTransfer('transfer-123');

      expect(mockListingService.markListingAsSold).toHaveBeenCalledWith('listing-123', 'buyer-999');
    });

    it('should handle missing venue account', async () => {
      mockStripePaymentService.getPaymentIntent.mockResolvedValue({
        ...mockPaymentIntent,
        metadata: {
          ...mockPaymentIntent.metadata,
          venue_stripe_account_id: ''
        }
      });

      await transferService.completeFiatTransfer('transfer-123');

      expect(mockStripePaymentService.createTransferToVenue).not.toHaveBeenCalled();
    });
  });

  describe('transferService export', () => {
    it('should export singleton instance', () => {
      expect(transferService).toBeDefined();
      expect(transferService).toBeInstanceOf(TransferService);
    });
  });
});
