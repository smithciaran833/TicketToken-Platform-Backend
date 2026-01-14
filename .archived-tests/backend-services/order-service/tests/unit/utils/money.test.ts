import {
  dollarsToCents,
  centsToDollars,
  formatCents,
  calculatePercentage,
  addFixedFee,
} from '../../../src/utils/money';

describe('Money Utils', () => {
  describe('dollarsToCents', () => {
    it('should convert dollars to cents', () => {
      expect(dollarsToCents(10)).toBe(1000);
      expect(dollarsToCents(5.50)).toBe(550);
      expect(dollarsToCents(0)).toBe(0);
    });

    it('should handle decimal precision', () => {
      expect(dollarsToCents(10.99)).toBe(1099);
      expect(dollarsToCents(10.999)).toBe(1100); // Rounds
    });
  });

  describe('centsToDollars', () => {
    it('should convert cents to dollars', () => {
      expect(centsToDollars(1000)).toBe(10);
      expect(centsToDollars(550)).toBe(5.5);
      expect(centsToDollars(0)).toBe(0);
    });
  });

  describe('formatCents', () => {
    it('should format cents as USD by default', () => {
      expect(formatCents(1000)).toBe('$10.00');
      expect(formatCents(550)).toBe('$5.50');
      expect(formatCents(1099)).toBe('$10.99');
    });

    it('should format cents as specified currency', () => {
      expect(formatCents(1000, 'EUR')).toContain('10.00');
      expect(formatCents(1000, 'GBP')).toContain('10.00');
    });

    it('should handle zero', () => {
      expect(formatCents(0)).toBe('$0.00');
    });
  });

  describe('calculatePercentage', () => {
    it('should calculate percentage of amount', () => {
      expect(calculatePercentage(10000, 5)).toBe(500); // 5% of $100
      expect(calculatePercentage(10000, 10)).toBe(1000); // 10% of $100
      expect(calculatePercentage(5000, 2.9)).toBe(145); // 2.9% of $50
    });

    it('should round to nearest cent', () => {
      expect(calculatePercentage(1000, 2.9)).toBe(29); // Rounds 29 cents
      expect(calculatePercentage(1000, 8.5)).toBe(85); // 8.5% of $10
    });

    it('should handle zero', () => {
      expect(calculatePercentage(0, 5)).toBe(0);
      expect(calculatePercentage(1000, 0)).toBe(0);
    });
  });

  describe('addFixedFee', () => {
    it('should add fixed fee to amount', () => {
      expect(addFixedFee(1000, 30)).toBe(1030);
      expect(addFixedFee(5000, 100)).toBe(5100);
    });

    it('should handle zero fee', () => {
      expect(addFixedFee(1000, 0)).toBe(1000);
    });

    it('should handle zero amount', () => {
      expect(addFixedFee(0, 30)).toBe(30);
    });
  });
});
