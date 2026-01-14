/**
 * Unit Tests: Money Utilities
 *
 * Tests currency conversion, formatting, and calculation functions
 */

import {
  dollarsToCents,
  centsToDollars,
  formatCents,
  calculatePercentage,
  addFixedFee,
} from '../../../src/utils/money';

describe('Money Utilities', () => {
  // ============================================
  // dollarsToCents
  // ============================================
  describe('dollarsToCents', () => {
    it('should convert whole dollars to cents', () => {
      expect(dollarsToCents(1)).toBe(100);
      expect(dollarsToCents(10)).toBe(1000);
      expect(dollarsToCents(100)).toBe(10000);
    });

    it('should convert dollars with cents to cents', () => {
      expect(dollarsToCents(1.5)).toBe(150);
      expect(dollarsToCents(19.99)).toBe(1999);
      expect(dollarsToCents(99.95)).toBe(9995);
    });

    it('should handle zero', () => {
      expect(dollarsToCents(0)).toBe(0);
    });

    it('should handle negative amounts', () => {
      expect(dollarsToCents(-10)).toBe(-1000);
      expect(dollarsToCents(-19.99)).toBe(-1999);
    });

    it('should round to nearest cent for floating point precision issues', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS
      expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    });

    it('should round correctly for values with more than 2 decimal places', () => {
      expect(dollarsToCents(1.234)).toBe(123);
      expect(dollarsToCents(1.235)).toBe(124); // rounds up
      expect(dollarsToCents(1.994)).toBe(199);
      expect(dollarsToCents(1.995)).toBe(200); // rounds up
    });

    it('should handle large amounts', () => {
      expect(dollarsToCents(999999.99)).toBe(99999999);
      expect(dollarsToCents(1000000)).toBe(100000000);
    });

    it('should handle small fractional amounts', () => {
      expect(dollarsToCents(0.01)).toBe(1);
      expect(dollarsToCents(0.001)).toBe(0); // rounds to 0
      expect(dollarsToCents(0.005)).toBe(1); // rounds up
    });
  });

  // ============================================
  // centsToDollars
  // ============================================
  describe('centsToDollars', () => {
    it('should convert cents to dollars', () => {
      expect(centsToDollars(100)).toBe(1);
      expect(centsToDollars(1000)).toBe(10);
      expect(centsToDollars(10000)).toBe(100);
    });

    it('should handle cents that result in fractional dollars', () => {
      expect(centsToDollars(150)).toBe(1.5);
      expect(centsToDollars(1999)).toBe(19.99);
      expect(centsToDollars(9995)).toBe(99.95);
    });

    it('should handle zero', () => {
      expect(centsToDollars(0)).toBe(0);
    });

    it('should handle negative amounts', () => {
      expect(centsToDollars(-1000)).toBe(-10);
      expect(centsToDollars(-1999)).toBe(-19.99);
    });

    it('should handle single cent', () => {
      expect(centsToDollars(1)).toBe(0.01);
    });

    it('should handle large amounts', () => {
      expect(centsToDollars(99999999)).toBe(999999.99);
      expect(centsToDollars(100000000)).toBe(1000000);
    });
  });

  // ============================================
  // formatCents
  // ============================================
  describe('formatCents', () => {
    it('should format cents as USD currency string by default', () => {
      expect(formatCents(1000)).toBe('$10.00');
      expect(formatCents(1999)).toBe('$19.99');
      expect(formatCents(100)).toBe('$1.00');
    });

    it('should handle zero', () => {
      expect(formatCents(0)).toBe('$0.00');
    });

    it('should handle single cent', () => {
      expect(formatCents(1)).toBe('$0.01');
    });

    it('should handle negative amounts', () => {
      expect(formatCents(-1000)).toBe('-$10.00');
      expect(formatCents(-1999)).toBe('-$19.99');
    });

    it('should format with thousands separator for large amounts', () => {
      expect(formatCents(100000)).toBe('$1,000.00');
      expect(formatCents(1000000)).toBe('$10,000.00');
      expect(formatCents(99999999)).toBe('$999,999.99');
    });

    it('should format EUR currency', () => {
      const formatted = formatCents(1999, 'EUR');
      // EUR formatting varies by locale, check it contains the amount
      expect(formatted).toMatch(/19[.,]99/);
    });

    it('should format GBP currency', () => {
      const formatted = formatCents(1999, 'GBP');
      // Should contain the amount
      expect(formatted).toMatch(/19[.,]99/);
    });

    it('should format JPY currency', () => {
      const formatted = formatCents(1999, 'JPY');
      // JPY doesn't use decimal places typically
      expect(formatted).toBeDefined();
    });

    it('should handle explicit USD parameter', () => {
      expect(formatCents(1000, 'USD')).toBe('$10.00');
    });
  });

  // ============================================
  // calculatePercentage
  // ============================================
  describe('calculatePercentage', () => {
    it('should calculate percentage correctly', () => {
      expect(calculatePercentage(1000, 10)).toBe(100); // 10% of 1000
      expect(calculatePercentage(1000, 25)).toBe(250); // 25% of 1000
      expect(calculatePercentage(1000, 50)).toBe(500); // 50% of 1000
    });

    it('should handle 100%', () => {
      expect(calculatePercentage(1000, 100)).toBe(1000);
    });

    it('should handle 0%', () => {
      expect(calculatePercentage(1000, 0)).toBe(0);
    });

    it('should round to nearest cent', () => {
      expect(calculatePercentage(1000, 33)).toBe(330); // 33% of 1000 = 330
      expect(calculatePercentage(100, 33)).toBe(33); // 33% of 100 = 33
      expect(calculatePercentage(10, 33)).toBe(3); // 33% of 10 = 3.3 -> 3
    });

    it('should handle fractional percentages', () => {
      expect(calculatePercentage(1000, 2.5)).toBe(25); // 2.5% of 1000
      expect(calculatePercentage(10000, 2.9)).toBe(290); // 2.9% of 10000
    });

    it('should handle zero amount', () => {
      expect(calculatePercentage(0, 50)).toBe(0);
    });

    it('should handle negative amounts', () => {
      expect(calculatePercentage(-1000, 10)).toBe(-100);
    });

    it('should handle percentages over 100%', () => {
      expect(calculatePercentage(1000, 150)).toBe(1500); // 150% of 1000
      expect(calculatePercentage(1000, 200)).toBe(2000); // 200% of 1000
    });

    it('should round correctly for edge cases', () => {
      // 1% of 99 = 0.99, rounds to 1
      expect(calculatePercentage(99, 1)).toBe(1);
      // 1% of 49 = 0.49, rounds to 0
      expect(calculatePercentage(49, 1)).toBe(0);
      // 1% of 50 = 0.5, rounds to 1 (banker's rounding may vary)
      expect(calculatePercentage(50, 1)).toBe(1);
    });
  });

  // ============================================
  // addFixedFee
  // ============================================
  describe('addFixedFee', () => {
    it('should add fixed fee to amount', () => {
      expect(addFixedFee(1000, 50)).toBe(1050);
      expect(addFixedFee(1000, 100)).toBe(1100);
      expect(addFixedFee(5000, 299)).toBe(5299);
    });

    it('should handle zero fee', () => {
      expect(addFixedFee(1000, 0)).toBe(1000);
    });

    it('should handle zero amount', () => {
      expect(addFixedFee(0, 50)).toBe(50);
    });

    it('should handle both zero', () => {
      expect(addFixedFee(0, 0)).toBe(0);
    });

    it('should handle negative fee (discount)', () => {
      expect(addFixedFee(1000, -50)).toBe(950);
    });

    it('should handle negative amount', () => {
      expect(addFixedFee(-1000, 50)).toBe(-950);
    });

    it('should handle large amounts', () => {
      expect(addFixedFee(99999999, 1)).toBe(100000000);
    });
  });

  // ============================================
  // Round-trip conversions
  // ============================================
  describe('Round-trip conversions', () => {
    it('should maintain value through dollars -> cents -> dollars', () => {
      const original = 19.99;
      const cents = dollarsToCents(original);
      const backToDollars = centsToDollars(cents);
      expect(backToDollars).toBe(original);
    });

    it('should maintain value through cents -> dollars -> cents', () => {
      const original = 1999;
      const dollars = centsToDollars(original);
      const backToCents = dollarsToCents(dollars);
      expect(backToCents).toBe(original);
    });

    it('should handle common price points', () => {
      const prices = [0.99, 1.99, 9.99, 19.99, 49.99, 99.99, 149.99, 199.99];
      prices.forEach((price) => {
        const cents = dollarsToCents(price);
        const backToDollars = centsToDollars(cents);
        expect(backToDollars).toBe(price);
      });
    });
  });

  // ============================================
  // Fee calculation scenarios
  // ============================================
  describe('Fee calculation scenarios', () => {
    it('should calculate platform fee + processing fee correctly', () => {
      const subtotal = 10000; // $100.00
      const platformFeePercent = 5; // 5%
      const processingFeePercent = 2.9; // 2.9%
      const fixedProcessingFee = 30; // $0.30

      const platformFee = calculatePercentage(subtotal, platformFeePercent);
      const processingFeePercAmount = calculatePercentage(subtotal, processingFeePercent);
      const totalProcessingFee = addFixedFee(processingFeePercAmount, fixedProcessingFee);

      expect(platformFee).toBe(500); // $5.00
      expect(processingFeePercAmount).toBe(290); // $2.90
      expect(totalProcessingFee).toBe(320); // $3.20
    });

    it('should calculate total order with fees', () => {
      const subtotal = 15000; // $150.00
      const platformFee = calculatePercentage(subtotal, 5); // 5%
      const processingFee = addFixedFee(calculatePercentage(subtotal, 2.9), 30);
      const total = subtotal + platformFee + processingFee;

      expect(platformFee).toBe(750); // $7.50
      expect(processingFee).toBe(465); // $4.35 + $0.30 = $4.65
      expect(total).toBe(16215); // $162.15
    });
  });
});
