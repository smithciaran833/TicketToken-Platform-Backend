/**
 * Fee Calculation Service Unit Tests
 * 
 * HIGH FIX: Comprehensive tests for fee calculation including:
 * - Stripe fee calculation
 * - Platform fee calculation
 * - Payment splits
 * - Refund adjustments
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  FeeCalculationService,
  feeCalculationService,
  formatCurrency,
  calculateGrossFromNet,
  SplitRecipient,
  PaymentSplit,
} from '../../src/services/fee-calculation.service';

describe('FeeCalculationService', () => {
  let service: FeeCalculationService;

  beforeEach(() => {
    service = new FeeCalculationService();
  });

  describe('calculateStripeFee', () => {
    it('should calculate Stripe fee correctly for standard amount', () => {
      // $100.00 = 10000 cents
      // Fee = (10000 * 0.029) + 30 = 290 + 30 = 320 cents = $3.20
      const fee = service.calculateStripeFee(10000);
      expect(fee).toBe(320);
    });

    it('should calculate Stripe fee for minimum amount', () => {
      // $0.50 = 50 cents
      // Fee = (50 * 0.029) + 30 = 1.45 + 30 = ~31 cents (rounded)
      const fee = service.calculateStripeFee(50);
      expect(fee).toBe(31);
    });

    it('should calculate Stripe fee for large amount', () => {
      // $1000.00 = 100000 cents
      // Fee = (100000 * 0.029) + 30 = 2900 + 30 = 2930 cents = $29.30
      const fee = service.calculateStripeFee(100000);
      expect(fee).toBe(2930);
    });

    it('should handle custom fee configuration', () => {
      const customService = new FeeCalculationService({
        stripePercentage: 0.025, // 2.5%
        stripeFixedFee: 25,      // $0.25
      });
      
      // $100.00 = 10000 cents
      // Fee = (10000 * 0.025) + 25 = 250 + 25 = 275 cents = $2.75
      const fee = customService.calculateStripeFee(10000);
      expect(fee).toBe(275);
    });
  });

  describe('calculatePlatformFee', () => {
    it('should calculate platform fee correctly', () => {
      // $100.00 = 10000 cents
      // Fee = 10000 * 0.05 = 500 cents = $5.00
      const fee = service.calculatePlatformFee(10000);
      expect(fee).toBe(500);
    });

    it('should enforce minimum platform fee', () => {
      // $10.00 = 1000 cents
      // Fee would be 1000 * 0.05 = 50 cents, but min is $1.00 = 100 cents
      const fee = service.calculatePlatformFee(1000);
      expect(fee).toBe(100);
    });

    it('should calculate correctly above minimum', () => {
      // $30.00 = 3000 cents
      // Fee = 3000 * 0.05 = 150 cents = $1.50
      const fee = service.calculatePlatformFee(3000);
      expect(fee).toBe(150);
    });
  });

  describe('calculateFees', () => {
    it('should calculate complete fee breakdown', () => {
      const recipients: SplitRecipient[] = [
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1', percentage: 0.70 },
        { id: 'artist-1', type: 'artist', stripeAccountId: 'acct_artist1', percentage: 0.30 },
      ];

      const breakdown = service.calculateFees(10000, recipients);

      expect(breakdown.totalAmount).toBe(10000);
      expect(breakdown.stripeFee).toBe(320);
      expect(breakdown.platformFee).toBe(500);
      expect(breakdown.netDistributable).toBe(10000 - 320 - 500);
      expect(breakdown.splits).toHaveLength(2);
    });

    it('should split amounts according to percentages', () => {
      const recipients: SplitRecipient[] = [
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1', percentage: 0.70 },
        { id: 'artist-1', type: 'artist', stripeAccountId: 'acct_artist1', percentage: 0.30 },
      ];

      const breakdown = service.calculateFees(10000, recipients);
      const netDistributable = breakdown.netDistributable;

      // Venue gets 70%
      expect(breakdown.splits[0].grossAmount).toBeCloseTo(netDistributable * 0.7, -1);
      // Artist gets 30%
      expect(breakdown.splits[1].grossAmount).toBeCloseTo(netDistributable * 0.3, -1);
    });

    it('should handle single recipient', () => {
      const recipients: SplitRecipient[] = [
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1', percentage: 1.0 },
      ];

      const breakdown = service.calculateFees(10000, recipients);

      expect(breakdown.splits).toHaveLength(1);
      expect(breakdown.splits[0].grossAmount).toBe(breakdown.netDistributable);
    });

    it('should return empty splits when amount is less than fees', () => {
      const recipients: SplitRecipient[] = [
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1', percentage: 1.0 },
      ];

      // Amount too small to cover fees
      const breakdown = service.calculateFees(50, recipients);

      expect(breakdown.netDistributable).toBe(0);
      expect(breakdown.splits).toHaveLength(0);
    });

    it('should handle fixed amount recipients', () => {
      const recipients: SplitRecipient[] = [
        { id: 'fee-1', type: 'other', stripeAccountId: 'acct_fee', fixedAmount: 500 },
        { id: 'venue-1', type: 'venue', stripeAccountId: 'acct_venue1' }, // Gets remainder
      ];

      const breakdown = service.calculateFees(10000, recipients);

      expect(breakdown.splits[0].grossAmount).toBe(500);
      expect(breakdown.splits[1].grossAmount).toBe(breakdown.netDistributable - 500);
    });
  });

  describe('calculateRefundAdjustments', () => {
    it('should calculate proportional refund adjustments', () => {
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

      const refundAmount = 5000; // 50% refund
      const adjustments = service.calculateRefundAdjustments(originalSplits, refundAmount);

      expect(adjustments).toHaveLength(2);
      
      // Venue had 70%, so should refund 70% of refund amount
      expect(adjustments[0].refundedAmount).toBe(3500);
      expect(adjustments[0].adjustment).toBe(-3500);
      
      // Artist had 30%, so should refund 30% of refund amount
      expect(adjustments[1].refundedAmount).toBe(1500);
      expect(adjustments[1].adjustment).toBe(-1500);
    });

    it('should handle full refund', () => {
      const originalSplits: PaymentSplit[] = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue1',
          grossAmount: 10000,
          stripeFee: 320,
          platformFee: 500,
          netAmount: 10000,
        },
      ];

      const adjustments = service.calculateRefundAdjustments(originalSplits, 10000);

      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].refundedAmount).toBe(10000);
      expect(adjustments[0].adjustment).toBe(-10000);
    });

    it('should return empty array for empty splits', () => {
      const adjustments = service.calculateRefundAdjustments([], 5000);
      expect(adjustments).toHaveLength(0);
    });
  });

  describe('calculateTransferAmounts', () => {
    it('should generate transfer data with metadata', () => {
      const splits: PaymentSplit[] = [
        {
          recipientId: 'venue-1',
          recipientType: 'venue',
          stripeAccountId: 'acct_venue1',
          grossAmount: 7000,
          stripeFee: 224,
          platformFee: 350,
          netAmount: 7000,
        },
      ];

      const transfers = service.calculateTransferAmounts(splits);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].stripeAccountId).toBe('acct_venue1');
      expect(transfers[0].amount).toBe(7000);
      expect(transfers[0].metadata.recipient_id).toBe('venue-1');
      expect(transfers[0].metadata.recipient_type).toBe('venue');
    });
  });

  describe('validateSplitPercentages', () => {
    it('should return true for valid percentages summing to 1', () => {
      const recipients: SplitRecipient[] = [
        { id: 'v', type: 'venue', stripeAccountId: 'a', percentage: 0.70 },
        { id: 'a', type: 'artist', stripeAccountId: 'b', percentage: 0.30 },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(true);
    });

    it('should return false for invalid percentages', () => {
      const recipients: SplitRecipient[] = [
        { id: 'v', type: 'venue', stripeAccountId: 'a', percentage: 0.70 },
        { id: 'a', type: 'artist', stripeAccountId: 'b', percentage: 0.20 },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(false);
    });

    it('should return true for recipients without percentages', () => {
      const recipients: SplitRecipient[] = [
        { id: 'v', type: 'venue', stripeAccountId: 'a', fixedAmount: 500 },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(true);
    });

    it('should allow small rounding errors', () => {
      const recipients: SplitRecipient[] = [
        { id: '1', type: 'venue', stripeAccountId: 'a', percentage: 0.333 },
        { id: '2', type: 'artist', stripeAccountId: 'b', percentage: 0.333 },
        { id: '3', type: 'other', stripeAccountId: 'c', percentage: 0.334 },
      ];

      expect(service.validateSplitPercentages(recipients)).toBe(true);
    });
  });

  describe('createDefaultSplits', () => {
    it('should create splits for venue and artist', () => {
      const splits = service.createDefaultSplits(
        'acct_venue1',
        'venue-id-1',
        'acct_artist1',
        'artist-id-1'
      );

      expect(splits).toHaveLength(2);
      expect(splits[0].type).toBe('venue');
      expect(splits[0].percentage).toBe(0.70);
      expect(splits[1].type).toBe('artist');
      expect(splits[1].percentage).toBe(0.25);
    });

    it('should give venue full share when no artist', () => {
      const splits = service.createDefaultSplits(
        'acct_venue1',
        'venue-id-1'
      );

      expect(splits).toHaveLength(1);
      expect(splits[0].type).toBe('venue');
      expect(splits[0].percentage).toBe(0.95); // 70% + 25%
    });
  });
});

describe('Helper Functions', () => {
  describe('formatCurrency', () => {
    it('should format cents to currency string', () => {
      expect(formatCurrency(10000)).toBe('$100.00');
      expect(formatCurrency(1234)).toBe('$12.34');
      expect(formatCurrency(50)).toBe('$0.50');
    });

    it('should handle different currencies', () => {
      expect(formatCurrency(10000, 'EUR')).toContain('100');
      expect(formatCurrency(10000, 'GBP')).toContain('100');
    });
  });

  describe('calculateGrossFromNet', () => {
    it('should calculate gross needed to achieve net amount', () => {
      // To get $100 net after 2.9% + $0.30
      // gross = (10000 + 30) / (1 - 0.029) = 10030 / 0.971 ≈ 10330
      const gross = calculateGrossFromNet(10000);
      
      // Verify by calculating fee on gross
      const service = new FeeCalculationService();
      const fee = service.calculateStripeFee(gross);
      const net = gross - fee;
      
      expect(net).toBeGreaterThanOrEqual(10000);
    });

    it('should handle small amounts', () => {
      const gross = calculateGrossFromNet(100);
      expect(gross).toBeGreaterThan(100);
    });
  });
});

describe('Singleton Instance', () => {
  it('should export a singleton instance', () => {
    expect(feeCalculationService).toBeInstanceOf(FeeCalculationService);
  });

  it('should calculate fees correctly', () => {
    const fee = feeCalculationService.calculateStripeFee(10000);
    expect(fee).toBe(320);
  });
});
