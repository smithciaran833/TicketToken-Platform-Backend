/**
 * COMPONENT TEST: FeeCalculationService
 *
 * Tests fee calculations, splits, and refund adjustments
 * Pure calculation logic - no database needed
 */

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn(() => ({
      query: jest.fn(),
    })),
  },
}));

import {
  FeeCalculationService,
  formatCurrency,
  calculateGrossFromNet,
  SUPPORTED_CURRENCIES,
  SplitRecipient,
} from '../../../src/services/fee-calculation.service';

describe('FeeCalculationService Component Tests', () => {
  let service: FeeCalculationService;

  beforeEach(() => {
    service = new FeeCalculationService();
  });

  // ===========================================================================
  // BASIC FEE CALCULATIONS
  // ===========================================================================
  describe('calculateStripeFee()', () => {
    it('should calculate Stripe fee for USD', () => {
      const fee = service.calculateStripeFee(10000); // $100

      // 2.9% + $0.30 = $2.90 + $0.30 = $3.20
      expect(fee).toBe(320);
    });

    it('should calculate Stripe fee for different amounts', () => {
      expect(service.calculateStripeFee(5000)).toBe(175); // $50: $1.45 + $0.30
      expect(service.calculateStripeFee(1000)).toBe(59); // $10: $0.29 + $0.30
    });

    it('should use currency-specific fees for EUR', () => {
      const fee = service.calculateStripeFee(10000, 'EUR');

      // 2.5% + €0.25 = €2.50 + €0.25 = €2.75
      expect(fee).toBe(275);
    });

    it('should use currency-specific fees for JPY', () => {
      const fee = service.calculateStripeFee(10000, 'JPY');

      // 3.6% + ¥0 = ¥360
      expect(fee).toBe(360);
    });

    it('should fall back to default for unsupported currency', () => {
      const fee = service.calculateStripeFee(10000, 'INR');

      // Falls back to default: 2.9% + $0.30
      expect(fee).toBe(320);
    });
  });

  describe('calculatePlatformFee()', () => {
    it('should calculate 5% platform fee', () => {
      const fee = service.calculatePlatformFee(10000); // $100

      // 5% of $100 = $5.00
      expect(fee).toBe(500);
    });

    it('should enforce minimum platform fee', () => {
      const fee = service.calculatePlatformFee(1000); // $10

      // 5% of $10 = $0.50, but minimum is $1.00
      expect(fee).toBe(100);
    });

    it('should use percentage when above minimum', () => {
      const fee = service.calculatePlatformFee(5000); // $50

      // 5% of $50 = $2.50 (above $1 minimum)
      expect(fee).toBe(250);
    });
  });

  // ===========================================================================
  // COMPLETE FEE BREAKDOWN
  // ===========================================================================
  describe('calculateFees()', () => {
    it('should calculate complete fee breakdown for single recipient', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
          percentage: 1.0,
        },
      ];

      const breakdown = service.calculateFees(10000, recipients);

      expect(breakdown.totalAmount).toBe(10000);
      expect(breakdown.stripeFee).toBe(320); // $3.20
      expect(breakdown.platformFee).toBe(500); // $5.00
      expect(breakdown.netDistributable).toBe(9180); // $100 - $3.20 - $5.00
      expect(breakdown.splits).toHaveLength(1);
      expect(breakdown.splits[0].netAmount).toBe(9180);
    });

    it('should calculate split for venue and artist (70/30)', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
          percentage: 0.70,
        },
        {
          id: 'artist-1',
          type: 'artist',
          stripeAccountId: 'acct_artist',
          percentage: 0.30,
        },
      ];

      const breakdown = service.calculateFees(10000, recipients);

      expect(breakdown.netDistributable).toBe(9180);
      expect(breakdown.splits).toHaveLength(2);

      // Venue gets 70% of $91.80 = $64.26
      expect(breakdown.splits[0].grossAmount).toBe(6426);
      expect(breakdown.splits[0].recipientType).toBe('venue');

      // Artist gets 30% of $91.80 = $27.54
      expect(breakdown.splits[1].grossAmount).toBe(2754);
      expect(breakdown.splits[1].recipientType).toBe('artist');
    });

    it('should use default percentages when not specified', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
        },
        {
          id: 'artist-1',
          type: 'artist',
          stripeAccountId: 'acct_artist',
        },
      ];

      const breakdown = service.calculateFees(10000, recipients);

      // Venue default: 70%, Artist default: 25%
      // Total = 95%, leaving 5% unallocated - last recipient gets remainder
      expect(breakdown.splits[0].grossAmount).toBeCloseTo(6426, -1); // ~70%
      expect(breakdown.splits[1].grossAmount).toBeGreaterThan(0);
    });

    it('should handle fixed amount recipients', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'promoter-1',
          type: 'promoter',
          stripeAccountId: 'acct_promoter',
          fixedAmount: 2000, // Fixed $20
        },
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
          // Gets remainder
        },
      ];

      const breakdown = service.calculateFees(10000, recipients);

      expect(breakdown.splits[0].grossAmount).toBe(2000);
      expect(breakdown.splits[1].grossAmount).toBe(7180); // Remainder
    });

    it('should handle very small transaction amounts', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
        },
      ];

      // $5 transaction
      // Stripe fee: 2.9% of $5 + $0.30 = $0.145 + $0.30 = $0.445 = 45 cents
      // Platform fee: 5% of $5 = $0.25, but min is $1.00 = 100 cents
      // Total fees: 45 + 100 = 145 cents = $1.45
      // Net: $5.00 - $1.45 = $3.55 = 355 cents
      const breakdown = service.calculateFees(500, recipients);

      expect(breakdown.netDistributable).toBe(355);
      expect(breakdown.splits).toHaveLength(1);
      expect(breakdown.splits[0].netAmount).toBe(355);
    });

    it('should distribute fees proportionally among recipients', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
          percentage: 0.50,
        },
        {
          id: 'artist-1',
          type: 'artist',
          stripeAccountId: 'acct_artist',
          percentage: 0.50,
        },
      ];

      const breakdown = service.calculateFees(10000, recipients);

      // Each gets 50% of net, fees split proportionally
      expect(breakdown.splits[0].grossAmount).toBeCloseTo(breakdown.splits[1].grossAmount, 0);
    });
  });

  // ===========================================================================
  // REFUND ADJUSTMENTS
  // ===========================================================================
  describe('calculateRefundAdjustments()', () => {
    it('should calculate proportional refund for full refund', () => {
      const originalSplits = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue',
          grossAmount: 7000,
          stripeFee: 200,
          platformFee: 300,
          netAmount: 7000,
        },
        {
          recipientId: 'artist-1',
          recipientType: 'artist',
          stripeAccountId: 'acct_artist',
          grossAmount: 3000,
          stripeFee: 100,
          platformFee: 200,
          netAmount: 3000,
        },
      ];

      const adjustments = service.calculateRefundAdjustments(originalSplits, 10000);

      expect(adjustments).toHaveLength(2);
      expect(adjustments[0].refundedAmount).toBe(7000);
      expect(adjustments[0].adjustment).toBe(-7000);
      expect(adjustments[1].refundedAmount).toBe(3000);
      expect(adjustments[1].adjustment).toBe(-3000);
    });

    it('should calculate proportional refund for partial refund', () => {
      const originalSplits = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue',
          grossAmount: 7000,
          stripeFee: 200,
          platformFee: 300,
          netAmount: 7000,
        },
        {
          recipientId: 'artist-1',
          recipientType: 'artist',
          stripeAccountId: 'acct_artist',
          grossAmount: 3000,
          stripeFee: 100,
          platformFee: 200,
          netAmount: 3000,
        },
      ];

      // 50% refund
      const adjustments = service.calculateRefundAdjustments(originalSplits, 5000);

      expect(adjustments).toHaveLength(2);
      expect(adjustments[0].refundedAmount).toBe(3500); // 50% of 7000
      expect(adjustments[1].refundedAmount).toBe(1500); // 50% of 3000
    });

    it('should handle zero original amount', () => {
      const originalSplits: any[] = [];

      const adjustments = service.calculateRefundAdjustments(originalSplits, 5000);

      expect(adjustments).toEqual([]);
    });
  });

  // ===========================================================================
  // ROYALTY REVERSALS
  // ===========================================================================
  describe('calculateRoyaltyReversals()', () => {
    it('should calculate royalty reversals for artists', () => {
      const originalSplits = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue',
          grossAmount: 7000,
          stripeFee: 200,
          platformFee: 300,
          netAmount: 7000,
        },
        {
          recipientId: 'artist-1',
          recipientType: 'artist',
          stripeAccountId: 'acct_artist',
          grossAmount: 3000,
          stripeFee: 100,
          platformFee: 200,
          netAmount: 3000,
        },
      ];

      const reversals = service.calculateRoyaltyReversals(originalSplits, 5000, 10000);

      // Only artist royalty should be reversed (not venue)
      expect(reversals).toHaveLength(1);
      expect(reversals[0].recipientType).toBe('artist');
      expect(reversals[0].originalRoyalty).toBe(3000);
      expect(reversals[0].reversedAmount).toBe(1500); // 50% of 3000
      expect(reversals[0].remainingRoyalty).toBe(1500);
      expect(reversals[0].refundRatio).toBe(0.5);
    });

    it('should handle multiple royalty recipients', () => {
      const originalSplits = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue',
          grossAmount: 6000,
          stripeFee: 200,
          platformFee: 300,
          netAmount: 6000,
        },
        {
          recipientId: 'artist-1',
          recipientType: 'artist',
          stripeAccountId: 'acct_artist',
          grossAmount: 2000,
          stripeFee: 100,
          platformFee: 100,
          netAmount: 2000,
        },
        {
          recipientId: 'promoter-1',
          recipientType: 'promoter',
          stripeAccountId: 'acct_promoter',
          grossAmount: 2000,
          stripeFee: 100,
          platformFee: 100,
          netAmount: 2000,
        },
      ];

      const reversals = service.calculateRoyaltyReversals(originalSplits, 2500, 10000);

      // Both artist and promoter
      expect(reversals).toHaveLength(2);
      expect(reversals.find(r => r.recipientType === 'artist')).toBeDefined();
      expect(reversals.find(r => r.recipientType === 'promoter')).toBeDefined();
    });

    it('should return empty array when no royalty recipients', () => {
      const originalSplits = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue',
          grossAmount: 10000,
          stripeFee: 300,
          platformFee: 500,
          netAmount: 10000,
        },
      ];

      const reversals = service.calculateRoyaltyReversals(originalSplits, 5000, 10000);

      expect(reversals).toEqual([]);
    });
  });

  // ===========================================================================
  // TRANSFER AMOUNTS
  // ===========================================================================
  describe('calculateTransferAmounts()', () => {
    it('should format transfer amounts for Stripe Connect', () => {
      const splits = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue',
          grossAmount: 7000,
          stripeFee: 200,
          platformFee: 300,
          netAmount: 7000,
        },
        {
          recipientId: 'artist-1',
          recipientType: 'artist',
          stripeAccountId: 'acct_artist',
          grossAmount: 3000,
          stripeFee: 100,
          platformFee: 200,
          netAmount: 3000,
        },
      ];

      const transfers = service.calculateTransferAmounts(splits);

      expect(transfers).toHaveLength(2);
      expect(transfers[0].stripeAccountId).toBe('acct_venue');
      expect(transfers[0].amount).toBe(7000);
      expect(transfers[0].metadata.recipient_id).toBe('venue-1');
      expect(transfers[1].stripeAccountId).toBe('acct_artist');
      expect(transfers[1].amount).toBe(3000);
    });
  });

  // ===========================================================================
  // VALIDATION
  // ===========================================================================
  describe('validateSplitPercentages()', () => {
    it('should validate percentages sum to 100%', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
          percentage: 0.70,
        },
        {
          id: 'artist-1',
          type: 'artist',
          stripeAccountId: 'acct_artist',
          percentage: 0.30,
        },
      ];

      const valid = service.validateSplitPercentages(recipients);

      expect(valid).toBe(true);
    });

    it('should reject invalid percentage totals', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
          percentage: 0.60,
        },
        {
          id: 'artist-1',
          type: 'artist',
          stripeAccountId: 'acct_artist',
          percentage: 0.30,
        },
      ];

      const valid = service.validateSplitPercentages(recipients);

      expect(valid).toBe(false);
    });

    it('should allow recipients without percentages', () => {
      const recipients: SplitRecipient[] = [
        {
          id: 'venue-1',
          type: 'venue',
          stripeAccountId: 'acct_venue',
        },
      ];

      const valid = service.validateSplitPercentages(recipients);

      expect(valid).toBe(true);
    });
  });

  // ===========================================================================
  // CURRENCY SUPPORT
  // ===========================================================================
  describe('currency support', () => {
    it('should check if currency is supported', () => {
      expect(service.isCurrencySupported('USD')).toBe(true);
      expect(service.isCurrencySupported('EUR')).toBe(true);
      expect(service.isCurrencySupported('GBP')).toBe(true);
      expect(service.isCurrencySupported('INR')).toBe(false);
    });

    it('should get currency config', () => {
      const config = service.getCurrencyConfig('USD');

      expect(config).not.toBeNull();
      expect(config!.code).toBe('USD');
      expect(config!.stripePercentage).toBe(0.029);
      expect(config!.stripeFixedFee).toBe(30);
    });

    it('should return null for unsupported currency', () => {
      const config = service.getCurrencyConfig('INR');

      expect(config).toBeNull();
    });
  });

  // ===========================================================================
  // DEFAULT SPLITS
  // ===========================================================================
  describe('createDefaultSplits()', () => {
    it('should create default split with venue and artist', () => {
      const splits = service.createDefaultSplits(
        'acct_venue',
        'venue-1',
        'acct_artist',
        'artist-1'
      );

      expect(splits).toHaveLength(2);
      expect(splits[0].type).toBe('venue');
      expect(splits[0].percentage).toBe(0.70);
      expect(splits[1].type).toBe('artist');
      expect(splits[1].percentage).toBe(0.25);
    });

    it('should give venue full share when no artist', () => {
      const splits = service.createDefaultSplits('acct_venue', 'venue-1');

      expect(splits).toHaveLength(1);
      expect(splits[0].type).toBe('venue');
      expect(splits[0].percentage).toBe(0.95); // 70% + 25%
    });
  });

  // ===========================================================================
  // HELPER FUNCTIONS
  // ===========================================================================
  describe('helper functions', () => {
    it('should format currency', () => {
      expect(formatCurrency(10000, 'USD')).toBe('$100.00');
      expect(formatCurrency(5050, 'USD')).toBe('$50.50');
      expect(formatCurrency(100, 'USD')).toBe('$1.00');
    });

    it('should calculate gross from net', () => {
      // If we want $100 net, what gross do we need?
      // gross - (gross * 0.029 + 30) = 10000
      const gross = calculateGrossFromNet(10000);

      // Verify by calculating fee
      const fee = Math.round(gross * 0.029) + 30;
      const net = gross - fee;

      expect(net).toBeGreaterThanOrEqual(10000);
      expect(net).toBeLessThan(10010); // Within rounding
    });
  });

  // ===========================================================================
  // CUSTOM CONFIGURATION
  // ===========================================================================
  describe('custom configuration', () => {
    it('should allow custom platform fee configuration', () => {
      const customService = new FeeCalculationService({
        platformPercentage: 0.10, // 10%
        platformMinFee: 200, // $2.00
      });

      const platformFee = customService.calculatePlatformFee(10000);

      expect(platformFee).toBe(1000); // $10.00
    });
  });
});
