import { EscrowService } from '../../../../src/services/marketplace/escrow.service';
import { EscrowStatus, TransactionStatus } from '../../../../src/types';

// Mock database
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

const mockGetClient = jest.fn().mockResolvedValue({
  client: mockClient,
  release: mockClient.release
});

jest.mock('../../../../src/config/database', () => ({
  getClient: () => mockGetClient(),
  query: jest.fn()
}));

// Mock Stripe
const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    confirm: jest.fn(),
    capture: jest.fn(),
    cancel: jest.fn()
  },
  refunds: {
    create: jest.fn()
  }
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    stripe: {
      secretKey: 'sk_test_mock'
    }
  }
}));

// Mock models
jest.mock('../../../../src/models', () => ({
  TransactionModel: {
    create: jest.fn()
  },
  VenueBalanceModel: {
    updateBalance: jest.fn()
  }
}));

// Mock money utils
jest.mock('../../../../src/utils/money', () => ({
  percentOfCents: jest.fn((amount, bps) => Math.round(amount * bps / 10000))
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { query } from '../../../../src/config/database';
import { TransactionModel, VenueBalanceModel } from '../../../../src/models';

describe('EscrowService', () => {
  let service: EscrowService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    service = new EscrowService();
  });

  describe('createEscrow', () => {
    it('should create escrow with correct payment splits', async () => {
      const listing = {
        id: 'listing_1',
        price: 10000, // $100 in cents
        venueRoyaltyPercentage: 0.1, // 10%
        sellerId: 'seller_1',
        ticketId: 'ticket_1'
      };

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_mock'
      });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ // INSERT escrow
          rows: [{
            id: 'escrow_1',
            listing_id: 'listing_1',
            amount: 10000,
            seller_payout: 8500, // 85%
            venue_royalty: 1000, // 10%
            platform_fee: 500, // 5%
            status: EscrowStatus.CREATED
          }]
        })
        .mockResolvedValueOnce({}) // Set release conditions 1
        .mockResolvedValueOnce({}) // Set release conditions 2
        .mockResolvedValueOnce({}); // COMMIT

      const result = await service.createEscrow(listing, 'buyer_1', 'pm_mock');

      expect(result.amount).toBe(10000);
      expect(result.seller_payout).toBe(8500);
      expect(result.venue_royalty).toBe(1000);
      expect(result.platform_fee).toBe(500);
    });

    it('should create Stripe payment intent with manual capture', async () => {
      const listing = {
        id: 'listing_1',
        price: 10000,
        venueRoyaltyPercentage: 0.1,
        sellerId: 'seller_1',
        ticketId: 'ticket_1'
      };

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_mock'
      });

      mockClient.query.mockResolvedValue({ rows: [{ id: 'escrow_1' }] });

      await service.createEscrow(listing, 'buyer_1', 'pm_mock');

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 10000,
        currency: 'usd',
        payment_method: 'pm_mock',
        capture_method: 'manual',
        metadata: expect.objectContaining({
          listingId: 'listing_1',
          sellerId: 'seller_1',
          buyerId: 'buyer_1',
          ticketId: 'ticket_1'
        })
      });
    });

    it('should set release conditions', async () => {
      const listing = {
        id: 'listing_1',
        price: 10000,
        venueRoyaltyPercentage: 0.1,
        sellerId: 'seller_1',
        ticketId: 'ticket_1'
      };

      mockStripe.paymentIntents.create.mockResolvedValue({ id: 'pi_mock' });
      mockClient.query.mockResolvedValue({ rows: [{ id: 'escrow_1' }] });

      await service.createEscrow(listing, 'buyer_1', 'pm_mock');

      // Should insert release conditions
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO escrow_release_conditions'),
        expect.any(Array)
      );
    });

    it('should rollback on error', async () => {
      const listing = {
        id: 'listing_1',
        price: 10000,
        venueRoyaltyPercentage: 0.1,
        sellerId: 'seller_1',
        ticketId: 'ticket_1'
      };

      mockStripe.paymentIntents.create.mockRejectedValue(
        new Error('Stripe error')
      );

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        service.createEscrow(listing, 'buyer_1', 'pm_mock')
      ).rejects.toThrow('Stripe error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('fundEscrow', () => {
    it('should confirm payment and update status to funded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.CREATED,
          stripePaymentIntentId: 'pi_mock'
        }]
      });

      mockStripe.paymentIntents.confirm.mockResolvedValue({
        status: 'requires_capture'
      });

      mockQuery.mockResolvedValueOnce({}); // UPDATE status

      mockQuery.mockResolvedValueOnce({ // GET updated escrow
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.FUNDED
        }]
      });

      const result = await service.fundEscrow('escrow_1');

      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith('pi_mock');
      expect(result.status).toBe(EscrowStatus.FUNDED);
    });

    it('should throw error if escrow already funded', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.FUNDED
        }]
      });

      await expect(
        service.fundEscrow('escrow_1')
      ).rejects.toThrow('Escrow already funded or cancelled');
    });

    it('should throw error if payment confirmation fails', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.CREATED,
          stripePaymentIntentId: 'pi_mock'
        }]
      });

      mockStripe.paymentIntents.confirm.mockResolvedValue({
        status: 'failed'
      });

      await expect(
        service.fundEscrow('escrow_1')
      ).rejects.toThrow('Payment confirmation failed');
    });
  });

  describe('releaseEscrow', () => {
    it('should release funds when conditions are met', async () => {
      mockQuery
        .mockResolvedValueOnce({ // Get escrow
          rows: [{
            id: 'escrow_1',
            status: EscrowStatus.FUNDED,
            stripePaymentIntentId: 'pi_mock',
            sellerId: 'seller_1',
            sellerPayout: 8500,
            venueRoyalty: 1000,
            listingId: 'listing_1'
          }]
        })
        .mockResolvedValueOnce({ // Check conditions
          rows: [
            { satisfied: true },
            { satisfied: true }
          ]
        })
        .mockResolvedValueOnce({ venueId: 'venue_1' }); // Get listing

      mockStripe.paymentIntents.capture.mockResolvedValue({
        status: 'succeeded'
      });

      mockClient.query.mockResolvedValue({});

      await service.releaseEscrow('escrow_1');

      expect(mockStripe.paymentIntents.capture).toHaveBeenCalledWith('pi_mock');
      expect(TransactionModel.create).toHaveBeenCalled();
      expect(VenueBalanceModel.updateBalance).toHaveBeenCalledWith(
        'venue_1',
        1000,
        'available'
      );
    });

    it('should throw error if escrow not funded', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.CREATED
        }]
      });

      mockClient.query.mockResolvedValue({});

      await expect(
        service.releaseEscrow('escrow_1')
      ).rejects.toThrow('Escrow not in funded state');
    });

    it('should throw error if conditions not met', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'escrow_1',
            status: EscrowStatus.FUNDED
          }]
        })
        .mockResolvedValueOnce({ // Conditions not satisfied
          rows: [
            { satisfied: false },
            { satisfied: true }
          ]
        });

      mockClient.query.mockResolvedValue({});

      await expect(
        service.releaseEscrow('escrow_1')
      ).rejects.toThrow('Release conditions not met');
    });

    it('should rollback on payment capture failure', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'escrow_1',
            status: EscrowStatus.FUNDED,
            stripePaymentIntentId: 'pi_mock'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{ satisfied: true }]
        });

      mockStripe.paymentIntents.capture.mockResolvedValue({
        status: 'failed'
      });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        service.releaseEscrow('escrow_1')
      ).rejects.toThrow('Payment capture failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('refundEscrow', () => {
    it('should process refund for funded escrow', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.FUNDED,
          stripePaymentIntentId: 'pi_mock'
        }]
      });

      mockStripe.refunds.create.mockResolvedValue({
        id: 'ref_mock'
      });

      await service.refundEscrow('escrow_1', 'buyer_request');

      expect(mockStripe.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_mock',
        reason: 'requested_by_customer',
        metadata: {
          escrowId: 'escrow_1',
          refundReason: 'buyer_request'
        }
      });
    });

    it('should cancel payment intent for non-funded escrow', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.CREATED,
          stripePaymentIntentId: 'pi_mock'
        }]
      });

      mockStripe.paymentIntents.cancel.mockResolvedValue({});

      await service.refundEscrow('escrow_1', 'buyer_cancelled');

      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_mock');
    });

    it('should throw error if already released', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.RELEASED
        }]
      });

      await expect(
        service.refundEscrow('escrow_1', 'test')
      ).rejects.toThrow('Escrow already released');
    });

    it('should throw error if already refunded', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          id: 'escrow_1',
          status: EscrowStatus.REFUNDED
        }]
      });

      await expect(
        service.refundEscrow('escrow_1', 'test')
      ).rejects.toThrow('Escrow already refunded');
    });
  });

  describe('Payment Split Calculations', () => {
    it('should calculate splits with different royalty percentages', async () => {
      const testCases = [
        { price: 10000, royalty: 0.05, expectedRoyalty: 500 },
        { price: 10000, royalty: 0.10, expectedRoyalty: 1000 },
        { price: 10000, royalty: 0.15, expectedRoyalty: 1500 },
        { price: 10000, royalty: 0.20, expectedRoyalty: 2000 }
      ];

      for (const testCase of testCases) {
        const listing = {
          id: 'listing_test',
          price: testCase.price,
          venueRoyaltyPercentage: testCase.royalty,
          sellerId: 'seller_1',
          ticketId: 'ticket_1'
        };

        mockStripe.paymentIntents.create.mockResolvedValue({ id: 'pi_mock' });
        mockClient.query.mockResolvedValue({
          rows: [{
            id: 'escrow_test',
            venue_royalty: testCase.expectedRoyalty,
            platform_fee: 500, // Always 5%
            seller_payout: testCase.price - testCase.expectedRoyalty - 500
          }]
        });

        const result = await service.createEscrow(listing, 'buyer_1', 'pm_mock');

        expect(result.venue_royalty).toBe(testCase.expectedRoyalty);
        expect(result.platform_fee).toBe(500);
      }
    });

    it('should handle large amounts correctly', async () => {
      const listing = {
        id: 'listing_large',
        price: 1000000, // $10,000
        venueRoyaltyPercentage: 0.1,
        sellerId: 'seller_1',
        ticketId: 'ticket_1'
      };

      mockStripe.paymentIntents.create.mockResolvedValue({ id: 'pi_mock' });
      mockClient.query.mockResolvedValue({
        rows: [{
          id: 'escrow_large',
          amount: 1000000,
          venue_royalty: 100000,
          platform_fee: 50000,
          seller_payout: 850000
        }]
      });

      const result = await service.createEscrow(listing, 'buyer_1', 'pm_mock');

      expect(result.seller_payout + result.venue_royalty + result.platform_fee)
        .toBe(result.amount);
    });
  });
});
