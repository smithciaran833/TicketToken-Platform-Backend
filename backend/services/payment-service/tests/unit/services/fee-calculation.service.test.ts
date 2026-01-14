/**
 * Unit Tests for Fee Calculation Service
 * 
 * Tests payment fee calculations, splits, refunds, and royalty reversals.
 */

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: jest.fn().mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    }),
  },
}));

import {
  FeeCalculationService,
  feeCalculationService,
  SplitRecipient,
  PaymentSplit,
  SUPPORTED_CURRENCIES,
  formatCurrency,
  calculateGrossFromNet,
} from '../../../src/services/fee-calculation.service';
import { DatabaseService } from '../../../src/services/databaseService';

describe('FeeCalculationService', () => {
  let service: FeeCalculationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeeCalculationService();
  });

  describe('calculateStripeFee', () => {
    it('should calculate standard Stripe fee (2.9% + $0.30)', () => {
      // $100.00 = 10000 cents
      // Fee = 10000 * 0.029 + 30 = 290 + 30 = 320 cents ($3.20)
      const fee = service.calculateStripeFee(10000);
      expect(fee).toBe(320);
    });

    it('should calculate fee for small transaction', () => {
      // $10.00 = 1000 cents
      // Fee = 1000 * 0.029 + 30 = 29 + 30 = 59 cents
      const fee = service.calculateStripeFee(1000);
      expect(fee).toBe(59);
    });

    it('should calculate fee for large transaction', () => {
      // $1000.00 = 100000 cents
      // Fee = 100000 * 0.029 + 30 = 2900 + 30 = 2930 cents ($29.30)
      const fee = service.calculateStripeFee(100000);
      expect(fee).toBe(2930);
    });

    it('should use EUR fee structure for EUR currency', () => {
      // EUR: 2.5% + €0.25
      // €100.00 = 10000 cents
      // Fee = 10000 * 0.025 + 25 = 250 + 25 = 275 cents
      const fee = service.calculateStripeFee(10000, 'EUR');
      expect(fee).toBe(275);
    });

    it('should use GBP fee structure for GBP currency', () => {
      // GBP: 2.5% + £0.20
      // £100.00 = 10000 pence
      // Fee = 10000 * 0.025 + 20 = 250 + 20 = 270 pence
      const fee = service.calculateStripeFee(10000, 'GBP');
      expect(fee).toBe(270);
    });

    it('should use JPY fee structure (no fixed fee)', () => {
      // JPY: 3.6% + ¥0
      // ¥10000
      // Fee = 10000 * 0.036 + 0 = 360
      const fee = service.calculateStripeFee(10000, 'JPY');
      expect(fee).toBe(360);
    });

    it('should handle case-insensitive currency codes', () => {
      const feeUpper = service.calculateStripeFee(10000, 'EUR');
      const feeLower = service.calculateStripeFee(10000, 'eur');
      expect(feeUpper).toBe(feeLower);
    });

    it('should fall back to default for unsupported currency', () => {
      const fee = service.calculateStripeFee(10000, 'XYZ');
      expect(fee).toBe(320); // Default: 2.9% + $0.30
    });
  });

  describe('calculatePlatformFee', () => {
    it('should calculate 5% platform fee', () => {
      // $100.00 = 10000 cents
      // Platform fee = 10000 * 0.05 = 500 cents ($5.00)
      const fee = service.calculatePlatformFee(10000);
      expect(fee).toBe(500);
    });

    it('should apply minimum $1.00 fee', () => {
      // $10.00 = 1000 cents
      // 5% = 50 cents, but minimum is $1.00 (100 cents)
      const fee = service.calculatePlatformFee(1000);
      expect(fee).toBe(100);
    });

    it('should not apply minimum for larger amounts', () => {
      // $50.00 = 5000 cents
      // 5% = 250 cents > $1.00 minimum
      const fee = service.calculatePlatformFee(5000);
      expect(fee).toBe(250);
    });

    it('should apply minimum for very small amounts', () => {
      // $5.00 = 500 cents
      // 5% = 25 cents, minimum is 100 cents
      const fee = service.calculatePlatformFee(500);
      expect(fee).toBe(100);
    });
  });

  describe('calculateFees', () => {
    const defaultRecipients: SplitRecipient[] = [
      { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1', percentage: 0.70 },
      { id: 'artist-1', type: 'artist', stripeAccountId: 'acct_artist1', percentage: 0.30 },
    ];

    it('should calculate complete fee breakdown', () => {
      const result = service.calculateFees(10000, defaultRecipients);

      expect(result.totalAmount).toBe(10000);
      expect(result.stripeFee).toBe(320); // 2.9% + $0.30
      expect(result.platformFee).toBe(500); // 5%
      expect(result.netDistributable).toBe(10000 - 320 - 500); // 9180
      expect(result.splits).toHaveLength(2);
    });

    it('should distribute net amount proportionally', () => {
      const result = service.calculateFees(10000, defaultRecipients);

      // Net = 9180 cents
      // Venue (70%) = 6426
      // Artist (30%) = 2754
      const venueSplit = result.splits.find(s => s.recipientType === 'venue');
      const artistSplit = result.splits.find(s => s.recipientType === 'artist');

      expect(venueSplit?.grossAmount).toBe(6426);
      expect(artistSplit?.grossAmount).toBe(2754);
    });

    it('should handle fixed amount recipients', () => {
      const recipients: SplitRecipient[] = [
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1', fixedAmount: 5000 },
        { id: 'artist-1', type: 'artist', stripeAccountId: 'acct_artist1' },
      ];

      const result = service.calculateFees(10000, recipients);

      const venueSplit = result.splits.find(s => s.recipientType === 'venue');
      expect(venueSplit?.grossAmount).toBe(5000);
    });

    it('should use default percentages when not specified', () => {
      const recipients: SplitRecipient[] = [
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1' },
        { id: 'artist-1', type: 'artist', stripeAccountId: 'acct_artist1' },
      ];

      const result = service.calculateFees(10000, recipients);

      // Default: venue 70%, artist 25%
      const venueSplit = result.splits.find(s => s.recipientType === 'venue');
      const artistSplit = result.splits.find(s => s.recipientType === 'artist');

      // Net = 9180, venue 70% = 6426, artist 25% = 2295
      expect(venueSplit?.grossAmount).toBeGreaterThan(artistSplit?.grossAmount || 0);
    });

    it('should handle single recipient', () => {
      const recipients: SplitRecipient[] = [
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1', percentage: 1.0 },
      ];

      const result = service.calculateFees(10000, recipients);

      expect(result.splits).toHaveLength(1);
      expect(result.splits[0].grossAmount).toBe(result.netDistributable);
    });

    it('should return empty splits when fees exceed amount', () => {
      // $0.50 = 50 cents, fees = 30 + 100 = 130 cents
      const result = service.calculateFees(50, defaultRecipients);

      expect(result.netDistributable).toBe(0);
      expect(result.splits).toHaveLength(0);
    });

    it('should calculate per-recipient fee shares', () => {
      const result = service.calculateFees(10000, defaultRecipients);

      const totalStripeFeeShares = result.splits.reduce((sum, s) => sum + s.stripeFee, 0);
      const totalPlatformFeeShares = result.splits.reduce((sum, s) => sum + s.platformFee, 0);

      // Due to rounding, should be close to total fees
      expect(totalStripeFeeShares).toBeCloseTo(result.stripeFee, -1);
      expect(totalPlatformFeeShares).toBeCloseTo(result.platformFee, -1);
    });
  });

  describe('calculateRefundAdjustments', () => {
    const originalSplits: PaymentSplit[] = [
      {
        recipientId: 'venue-1',
        recipientType: 'venue',
        stripeAccountId: 'acct_venue1',
        grossAmount: 7000,
        stripeFee: 224,
        platformFee: 350,
        netAmount: 7000,
      },
      {
        recipientId: 'artist-1',
        recipientType: 'artist',
        stripeAccountId: 'acct_artist1',
        grossAmount: 3000,
        stripeFee: 96,
        platformFee: 150,
        netAmount: 3000,
      },
    ];

    it('should calculate full refund adjustments', () => {
      const adjustments = service.calculateRefundAdjustments(originalSplits, 10000);

      expect(adjustments).toHaveLength(2);
      
      const venueAdj = adjustments.find(a => a.recipientType === 'venue');
      expect(venueAdj?.originalAmount).toBe(7000);
      expect(venueAdj?.refundedAmount).toBe(7000);
      expect(venueAdj?.adjustment).toBe(-7000);
    });

    it('should calculate partial refund adjustments', () => {
      // 50% refund
      const adjustments = service.calculateRefundAdjustments(originalSplits, 5000);

      const venueAdj = adjustments.find(a => a.recipientType === 'venue');
      const artistAdj = adjustments.find(a => a.recipientType === 'artist');

      expect(venueAdj?.refundedAmount).toBe(3500); // 50% of 7000
      expect(artistAdj?.refundedAmount).toBe(1500); // 50% of 3000
    });

    it('should return empty array for empty splits', () => {
      const adjustments = service.calculateRefundAdjustments([], 1000);
      expect(adjustments).toHaveLength(0);
    });

    it('should calculate refunded fees proportionally', () => {
      const adjustments = service.calculateRefundAdjustments(originalSplits, 5000);

      // Each recipient should have proportional fee shares
      adjustments.forEach(adj => {
        expect(adj.refundedStripeFee).toBeGreaterThanOrEqual(0);
        expect(adj.refundedPlatformFee).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('calculateRoyaltyReversals', () => {
    const originalSplits: PaymentSplit[] = [
      {
        recipientId: 'venue-1',
        recipientType: 'venue',
        stripeAccountId: 'acct_venue1',
        grossAmount: 7000,
        stripeFee: 224,
        platformFee: 350,
        netAmount: 7000,
      },
      {
        recipientId: 'artist-1',
        recipientType: 'artist',
        stripeAccountId: 'acct_artist1',
        grossAmount: 2500,
        stripeFee: 80,
        platformFee: 125,
        netAmount: 2500,
      },
      {
        recipientId: 'promoter-1',
        recipientType: 'promoter',
        stripeAccountId: 'acct_promoter1',
        grossAmount: 500,
        stripeFee: 16,
        platformFee: 25,
        netAmount: 500,
      },
    ];

    it('should only calculate reversals for artist and promoter', () => {
      const reversals = service.calculateRoyaltyReversals(originalSplits, 5000, 10000);

      // Should only include artist and promoter, not venue
      expect(reversals).toHaveLength(2);
      expect(reversals.some(r => r.recipientType === 'artist')).toBe(true);
      expect(reversals.some(r => r.recipientType === 'promoter')).toBe(true);
      expect(reversals.some(r => r.recipientType === 'venue')).toBe(false);
    });

    it('should calculate correct reversal amounts', () => {
      // 50% refund
      const reversals = service.calculateRoyaltyReversals(originalSplits, 5000, 10000);

      const artistReversal = reversals.find(r => r.recipientType === 'artist');
      expect(artistReversal?.originalRoyalty).toBe(2500);
      expect(artistReversal?.reversedAmount).toBe(1250); // 50%
      expect(artistReversal?.remainingRoyalty).toBe(1250);
      expect(artistReversal?.refundRatio).toBe(0.5);
    });

    it('should calculate full reversal on full refund', () => {
      const reversals = service.calculateRoyaltyReversals(originalSplits, 10000, 10000);

      reversals.forEach(reversal => {
        expect(reversal.reversedAmount).toBe(reversal.originalRoyalty);
        expect(reversal.remainingRoyalty).toBe(0);
        expect(reversal.refundRatio).toBe(1);
      });
    });
  });

  describe('saveRoyaltyReversal', () => {
    it('should save reversals to database', async () => {
      const mockPool = DatabaseService.getPool();
      const reversals = [
        {
          recipientId: 'artist-1',
          recipientType: 'artist',
          originalRoyalty: 2500,
          reversedAmount: 1250,
          remainingRoyalty: 1250,
          refundRatio: 0.5,
        },
      ];

      await service.saveRoyaltyReversal('refund-123', 'payment-456', reversals, 'tenant-789');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO royalty_reversals'),
        expect.arrayContaining(['refund-123', 'payment-456', 'artist-1'])
      );
    });
  });

  describe('calculateTransferAmounts', () => {
    it('should map splits to transfer objects', () => {
      const splits: PaymentSplit[] = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue1',
          grossAmount: 7000,
          stripeFee: 224,
          platformFee: 350,
          netAmount: 6426,
        },
      ];

      const transfers = service.calculateTransferAmounts(splits);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].stripeAccountId).toBe('acct_venue1');
      expect(transfers[0].amount).toBe(6426);
      expect(transfers[0].metadata.recipient_id).toBe('venue-1');
      expect(transfers[0].metadata.recipient_type).toBe('venue');
    });
  });

  describe('validateSplitPercentages', () => {
    it('should return true for valid splits summing to 100%', () => {
      const recipients: SplitRecipient[] = [
        { id: 'v1', type: 'venue', stripeAccountId: 'a1', percentage: 0.7 },
        { id: 'a1', type: 'artist', stripeAccountId: 'a2', percentage: 0.3 },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(true);
    });

    it('should return false for invalid splits', () => {
      const recipients: SplitRecipient[] = [
        { id: 'v1', type: 'venue', stripeAccountId: 'a1', percentage: 0.7 },
        { id: 'a1', type: 'artist', stripeAccountId: 'a2', percentage: 0.2 },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(false);
    });

    it('should return true for recipients with no percentages', () => {
      const recipients: SplitRecipient[] = [
        { id: 'v1', type: 'venue', stripeAccountId: 'a1' },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(true);
    });

    it('should allow small rounding errors', () => {
      const recipients: SplitRecipient[] = [
        { id: 'v1', type: 'venue', stripeAccountId: 'a1', percentage: 0.333 },
        { id: 'v2', type: 'artist', stripeAccountId: 'a2', percentage: 0.333 },
        { id: 'v3', type: 'promoter', stripeAccountId: 'a3', percentage: 0.334 },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(true);
    });
  });

  describe('isCurrencySupported', () => {
    it('should return true for supported currencies', () => {
      expect(service.isCurrencySupported('USD')).toBe(true);
      expect(service.isCurrencySupported('EUR')).toBe(true);
      expect(service.isCurrencySupported('GBP')).toBe(true);
      expect(service.isCurrencySupported('JPY')).toBe(true);
    });

    it('should return false for unsupported currencies', () => {
      expect(service.isCurrencySupported('XYZ')).toBe(false);
      expect(service.isCurrencySupported('BTC')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(service.isCurrencySupported('usd')).toBe(true);
      expect(service.isCurrencySupported('Eur')).toBe(true);
    });
  });

  describe('getCurrencyConfig', () => {
    it('should return config for supported currency', () => {
      const config = service.getCurrencyConfig('USD');
      
      expect(config).not.toBeNull();
      expect(config?.code).toBe('USD');
      expect(config?.stripePercentage).toBe(0.029);
      expect(config?.stripeFixedFee).toBe(30);
    });

    it('should return null for unsupported currency', () => {
      expect(service.getCurrencyConfig('XYZ')).toBeNull();
    });
  });

  describe('createDefaultSplits', () => {
    it('should create venue and artist splits', () => {
      const splits = service.createDefaultSplits(
        'acct_venue',
        'venue-123',
        'acct_artist',
        'artist-456'
      );

      expect(splits).toHaveLength(2);
      expect(splits[0].type).toBe('venue');
      expect(splits[0].percentage).toBe(0.70);
      expect(splits[1].type).toBe('artist');
      expect(splits[1].percentage).toBe(0.25);
    });

    it('should give venue full share when no artist', () => {
      const splits = service.createDefaultSplits('acct_venue', 'venue-123');

      expect(splits).toHaveLength(1);
      expect(splits[0].type).toBe('venue');
      expect(splits[0].percentage).toBe(0.95); // 70% + 25%
    });
  });

  describe('Custom Configuration', () => {
    it('should accept custom fee configuration', () => {
      const customService = new FeeCalculationService({
        stripePercentage: 0.025,
        stripeFixedFee: 25,
        platformPercentage: 0.03,
        platformMinFee: 50,
      });

      // With custom config: 2.5% + $0.25, 3% platform
      const stripeFee = customService.calculateStripeFee(10000);
      const platformFee = customService.calculatePlatformFee(10000);

      expect(stripeFee).toBe(275); // 10000 * 0.025 + 25
      expect(platformFee).toBe(300); // 10000 * 0.03
    });
  });

  describe('Singleton Export', () => {
    it('should export feeCalculationService singleton', () => {
      expect(feeCalculationService).toBeDefined();
      expect(feeCalculationService).toBeInstanceOf(FeeCalculationService);
    });
  });

  describe('Helper Functions', () => {
    describe('formatCurrency', () => {
      it('should format USD amounts', () => {
        expect(formatCurrency(10000, 'USD')).toBe('$100.00');
        expect(formatCurrency(1050, 'USD')).toBe('$10.50');
        expect(formatCurrency(99, 'USD')).toBe('$0.99');
      });

      it('should format other currencies', () => {
        expect(formatCurrency(10000, 'EUR')).toContain('100');
        expect(formatCurrency(10000, 'GBP')).toContain('100');
      });
    });

    describe('calculateGrossFromNet', () => {
      it('should calculate gross amount needed for target net', () => {
        // If we want $100 net after 2.9% + $0.30 fees:
        // gross = (10000 + 30) / (1 - 0.029) = 10030 / 0.971 ≈ 10329
        const gross = calculateGrossFromNet(10000);
        expect(gross).toBeGreaterThan(10000);
        
        // Verify: gross - fees ≈ net
        const service = new FeeCalculationService();
        const fee = service.calculateStripeFee(gross);
        expect(gross - fee).toBeGreaterThanOrEqual(10000);
      });

      it('should handle small amounts', () => {
        const gross = calculateGrossFromNet(100);
        expect(gross).toBeGreaterThan(100);
      });
    });
  });

  describe('SUPPORTED_CURRENCIES constant', () => {
    it('should have required properties for all currencies', () => {
      Object.values(SUPPORTED_CURRENCIES).forEach(currency => {
        expect(currency.code).toBeDefined();
        expect(currency.stripePercentage).toBeDefined();
        expect(currency.stripeFixedFee).toBeDefined();
        expect(currency.minorUnitsPerMajor).toBeDefined();
        expect(currency.symbol).toBeDefined();
      });
    });

    it('should have JPY with no minor units', () => {
      expect(SUPPORTED_CURRENCIES.JPY.minorUnitsPerMajor).toBe(1);
      expect(SUPPORTED_CURRENCIES.JPY.stripeFixedFee).toBe(0);
    });
  });
});
