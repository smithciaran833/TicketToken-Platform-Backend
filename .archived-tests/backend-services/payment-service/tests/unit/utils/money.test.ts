// =============================================================================
// TEST SUITE: money utilities
// =============================================================================

import { percentOfCents, addCents, subtractCents } from '../../../src/utils/money';

describe('money utilities', () => {
  // ===========================================================================
  // percentOfCents() - 8 test cases
  // ===========================================================================

  describe('percentOfCents()', () => {
    it('should calculate 7% of amount in cents', () => {
      const result = percentOfCents(10000, 700);

      expect(result).toBe(700);
    });

    it('should calculate 2.9% of amount (Stripe fee)', () => {
      const result = percentOfCents(10000, 290);

      expect(result).toBe(290);
    });

    it('should round to nearest cent', () => {
      const result = percentOfCents(10003, 290); // 290.087 -> 290

      expect(result).toBe(290);
    });

    it('should handle zero cents', () => {
      const result = percentOfCents(0, 700);

      expect(result).toBe(0);
    });

    it('should handle zero basis points', () => {
      const result = percentOfCents(10000, 0);

      expect(result).toBe(0);
    });

    it('should calculate 100% (10000 basis points)', () => {
      const result = percentOfCents(5000, 10000);

      expect(result).toBe(5000);
    });

    it('should calculate 0.5% (50 basis points)', () => {
      const result = percentOfCents(10000, 50);

      expect(result).toBe(50);
    });

    it('should handle large amounts', () => {
      const result = percentOfCents(1000000, 700); // $10,000 * 7%

      expect(result).toBe(70000); // $700
    });
  });

  // ===========================================================================
  // addCents() - 7 test cases
  // ===========================================================================

  describe('addCents()', () => {
    it('should add two amounts together', () => {
      const result = addCents(1000, 2000);

      expect(result).toBe(3000);
    });

    it('should add multiple amounts together', () => {
      const result = addCents(1000, 2000, 3000, 4000);

      expect(result).toBe(10000);
    });

    it('should handle single amount', () => {
      const result = addCents(5000);

      expect(result).toBe(5000);
    });

    it('should handle zero amounts', () => {
      const result = addCents(0, 0, 0);

      expect(result).toBe(0);
    });

    it('should handle no arguments', () => {
      const result = addCents();

      expect(result).toBe(0);
    });

    it('should handle negative amounts', () => {
      const result = addCents(5000, -2000, 3000);

      expect(result).toBe(6000);
    });

    it('should handle large number of amounts', () => {
      const amounts = Array(100).fill(100);
      const result = addCents(...amounts);

      expect(result).toBe(10000);
    });
  });

  // ===========================================================================
  // subtractCents() - 6 test cases
  // ===========================================================================

  describe('subtractCents()', () => {
    it('should subtract two amounts', () => {
      const result = subtractCents(5000, 2000);

      expect(result).toBe(3000);
    });

    it('should handle result of zero', () => {
      const result = subtractCents(5000, 5000);

      expect(result).toBe(0);
    });

    it('should handle negative result', () => {
      const result = subtractCents(2000, 5000);

      expect(result).toBe(-3000);
    });

    it('should handle zero minuend', () => {
      const result = subtractCents(0, 1000);

      expect(result).toBe(-1000);
    });

    it('should handle zero subtrahend', () => {
      const result = subtractCents(5000, 0);

      expect(result).toBe(5000);
    });

    it('should handle large amounts', () => {
      const result = subtractCents(1000000, 250000);

      expect(result).toBe(750000);
    });
  });
});
