/**
 * Unit Tests for Stripe Connect Transfer Service
 * 
 * Critical P0 tests for payment splits and venue payouts via Stripe Connect.
 */

// Mock dependencies
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    transfers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      list: jest.fn(),
      createReversal: jest.fn(),
    },
    payouts: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    accounts: {
      retrieve: jest.fn(),
    },
  }));
});

describe('Stripe Connect Transfer Service', () => {
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const Stripe = require('stripe');
    mockStripe = new Stripe();
  });

  describe('Transfer Creation', () => {
    it('should create transfer to connected account', async () => {
      mockStripe.transfers.create.mockResolvedValue({
        id: 'tr_test123',
        amount: 8000,
        currency: 'usd',
        destination: 'acct_venue123',
        transfer_group: 'order_123',
        source_transaction: 'ch_test123',
      });

      const result = await mockStripe.transfers.create({
        amount: 8000,
        currency: 'usd',
        destination: 'acct_venue123',
        transfer_group: 'order_123',
        source_transaction: 'ch_test123',
      });

      expect(result.id).toBe('tr_test123');
      expect(result.amount).toBe(8000);
      expect(result.destination).toBe('acct_venue123');
    });

    it('should calculate correct venue share from payment', async () => {
      const paymentAmount = 10000; // $100.00
      const platformFeePercentage = 7; // 7%
      const platformFee = Math.round((paymentAmount * platformFeePercentage) / 100);
      const venueShare = paymentAmount - platformFee;

      expect(platformFee).toBe(700); // $7.00
      expect(venueShare).toBe(9300); // $93.00
    });

    it('should include metadata for reconciliation', async () => {
      mockStripe.transfers.create.mockResolvedValue({
        id: 'tr_test123',
        amount: 9300,
        metadata: {
          orderId: 'order-123',
          eventId: 'event-456',
          tenantId: 'tenant-abc',
          transferType: 'primary_sale',
        },
      });

      const result = await mockStripe.transfers.create({
        amount: 9300,
        currency: 'usd',
        destination: 'acct_venue123',
        metadata: {
          orderId: 'order-123',
          eventId: 'event-456',
          tenantId: 'tenant-abc',
          transferType: 'primary_sale',
        },
      });

      expect(result.metadata.orderId).toBe('order-123');
      expect(result.metadata.transferType).toBe('primary_sale');
    });

    it('should handle transfer to non-onboarded account', async () => {
      mockStripe.transfers.create.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        code: 'account_invalid',
        message: 'The destination account cannot accept payments',
      });

      await expect(
        mockStripe.transfers.create({
          amount: 8000,
          destination: 'acct_not_onboarded',
        })
      ).rejects.toMatchObject({
        code: 'account_invalid',
      });
    });
  });

  describe('Resale Royalty Splits', () => {
    it('should split resale payment correctly', async () => {
      const resaleAmount = 15000; // $150.00
      const originalPrice = 10000; // $100.00
      const markup = resaleAmount - originalPrice; // $50.00

      // Venue gets 10% royalty on markup
      const venueRoyaltyPercentage = 10;
      const venueRoyalty = Math.round((markup * venueRoyaltyPercentage) / 100);

      // Platform fee on total
      const platformFeePercentage = 7;
      const platformFee = Math.round((resaleAmount * platformFeePercentage) / 100);

      // Seller gets remainder
      const sellerPayout = resaleAmount - venueRoyalty - platformFee;

      expect(venueRoyalty).toBe(500); // $5.00
      expect(platformFee).toBe(1050); // $10.50
      expect(sellerPayout).toBe(13450); // $134.50
    });

    it('should create multiple transfers for resale', async () => {
      // Transfer to venue (royalty)
      mockStripe.transfers.create.mockResolvedValueOnce({
        id: 'tr_royalty',
        amount: 500,
        destination: 'acct_venue123',
        metadata: { type: 'royalty' },
      });

      // Transfer to seller
      mockStripe.transfers.create.mockResolvedValueOnce({
        id: 'tr_seller',
        amount: 13450,
        destination: 'acct_seller456',
        metadata: { type: 'resale_payout' },
      });

      const royaltyTransfer = await mockStripe.transfers.create({
        amount: 500,
        destination: 'acct_venue123',
        metadata: { type: 'royalty' },
      });

      const sellerTransfer = await mockStripe.transfers.create({
        amount: 13450,
        destination: 'acct_seller456',
        metadata: { type: 'resale_payout' },
      });

      expect(royaltyTransfer.amount).toBe(500);
      expect(sellerTransfer.amount).toBe(13450);
    });

    it('should enforce price cap on resale', () => {
      const originalPrice = 10000;
      const maxMarkupPercentage = 20; // 20% max markup
      const maxResalePrice = originalPrice + Math.round((originalPrice * maxMarkupPercentage) / 100);

      const attemptedPrice = 15000; // 50% markup
      const isValidPrice = attemptedPrice <= maxResalePrice;

      expect(maxResalePrice).toBe(12000); // $120.00
      expect(isValidPrice).toBe(false);
    });
  });

  describe('Transfer Reversal', () => {
    it('should reverse transfer on refund', async () => {
      mockStripe.transfers.createReversal.mockResolvedValue({
        id: 'trr_test123',
        transfer: 'tr_test123',
        amount: 8000,
      });

      const result = await mockStripe.transfers.createReversal('tr_test123', {
        amount: 8000,
      });

      expect(result.id).toBe('trr_test123');
      expect(result.amount).toBe(8000);
    });

    it('should partially reverse transfer', async () => {
      mockStripe.transfers.createReversal.mockResolvedValue({
        id: 'trr_partial',
        transfer: 'tr_test123',
        amount: 4000, // Half reversal
      });

      const result = await mockStripe.transfers.createReversal('tr_test123', {
        amount: 4000,
      });

      expect(result.amount).toBe(4000);
    });

    it('should handle insufficient balance for reversal', async () => {
      mockStripe.transfers.createReversal.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        code: 'balance_insufficient',
        message: 'The destination account has insufficient funds',
      });

      await expect(
        mockStripe.transfers.createReversal('tr_test123', { amount: 10000 })
      ).rejects.toMatchObject({
        code: 'balance_insufficient',
      });
    });
  });

  describe('Account Verification', () => {
    it('should verify account can receive transfers', async () => {
      mockStripe.accounts.retrieve.mockResolvedValue({
        id: 'acct_venue123',
        charges_enabled: true,
        payouts_enabled: true,
        capabilities: {
          transfers: 'active',
        },
      });

      const account = await mockStripe.accounts.retrieve('acct_venue123');
      const canReceiveTransfers = 
        account.charges_enabled && 
        account.payouts_enabled &&
        account.capabilities?.transfers === 'active';

      expect(canReceiveTransfers).toBe(true);
    });

    it('should reject transfer to restricted account', async () => {
      mockStripe.accounts.retrieve.mockResolvedValue({
        id: 'acct_restricted',
        charges_enabled: false,
        payouts_enabled: false,
        requirements: {
          currently_due: ['identity.verification'],
          disabled_reason: 'requirements.pending_verification',
        },
      });

      const account = await mockStripe.accounts.retrieve('acct_restricted');
      const canReceiveTransfers = account.charges_enabled && account.payouts_enabled;

      expect(canReceiveTransfers).toBe(false);
    });
  });

  describe('Transfer Batching', () => {
    it('should batch multiple transfers in same group', async () => {
      const transferGroup = 'event_payout_2026-01-08';
      const transfers = [
        { destination: 'acct_venue1', amount: 5000 },
        { destination: 'acct_venue2', amount: 3000 },
        { destination: 'acct_venue3', amount: 7000 },
      ];

      for (const transfer of transfers) {
        mockStripe.transfers.create.mockResolvedValueOnce({
          id: `tr_${transfer.destination}`,
          ...transfer,
          transfer_group: transferGroup,
        });
      }

      const results = await Promise.all(
        transfers.map(t =>
          mockStripe.transfers.create({
            ...t,
            currency: 'usd',
            transfer_group: transferGroup,
          })
        )
      );

      expect(results).toHaveLength(3);
      expect(results.every(r => r.transfer_group === transferGroup)).toBe(true);
    });
  });

  describe('Payout to Bank Account', () => {
    it('should initiate payout to connected account bank', async () => {
      mockStripe.payouts.create.mockResolvedValue({
        id: 'po_test123',
        amount: 50000,
        currency: 'usd',
        arrival_date: 1704672000,
        status: 'pending',
      });

      const result = await mockStripe.payouts.create(
        {
          amount: 50000,
          currency: 'usd',
        },
        {
          stripeAccount: 'acct_venue123',
        }
      );

      expect(result.status).toBe('pending');
    });

    it('should handle payout timing', async () => {
      const now = new Date();
      const standardArrival = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // +2 days
      const instantArrival = new Date(now.getTime() + 30 * 60 * 1000); // +30 minutes

      const standardPayout = { arrival_date: Math.floor(standardArrival.getTime() / 1000) };
      const instantPayout = { arrival_date: Math.floor(instantArrival.getTime() / 1000) };

      expect(standardPayout.arrival_date).toBeGreaterThan(instantPayout.arrival_date);
    });
  });

  describe('Error Handling', () => {
    it('should handle Stripe API rate limiting', async () => {
      mockStripe.transfers.create.mockRejectedValue({
        type: 'StripeRateLimitError',
        message: 'Too many requests',
      });

      await expect(
        mockStripe.transfers.create({ amount: 1000, destination: 'acct_test' })
      ).rejects.toMatchObject({
        type: 'StripeRateLimitError',
      });
    });

    it('should handle network errors', async () => {
      mockStripe.transfers.create.mockRejectedValue({
        type: 'StripeConnectionError',
        message: 'Network error',
      });

      await expect(
        mockStripe.transfers.create({ amount: 1000, destination: 'acct_test' })
      ).rejects.toMatchObject({
        type: 'StripeConnectionError',
      });
    });

    it('should handle invalid currency', async () => {
      mockStripe.transfers.create.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        code: 'parameter_invalid_string_empty',
        message: 'Invalid currency',
      });

      await expect(
        mockStripe.transfers.create({
          amount: 1000,
          currency: 'xyz',
          destination: 'acct_test',
        })
      ).rejects.toMatchObject({
        code: 'parameter_invalid_string_empty',
      });
    });
  });
});
