/**
 * Unit Tests for Money Utility Functions
 */

import {
  percentOfCents,
  addCents,
  subtractCents,
} from '../../../src/utils/money';

describe('Money Utilities', () => {
  describe('percentOfCents', () => {
    it('should calculate 7% correctly', () => {
      // 700 basis points = 7%
      // 10000 cents * 7% = 700 cents
      expect(percentOfCents(10000, 700)).toBe(700);
    });

    it('should calculate 2.9% correctly', () => {
      // 290 basis points = 2.9%
      // 10000 cents * 2.9% = 290 cents
      expect(percentOfCents(10000, 290)).toBe(290);
    });

    it('should handle small percentages', () => {
      // 1 basis point = 0.01%
      // 10000 cents * 0.01% = 1 cent
      expect(percentOfCents(10000, 1)).toBe(1);
    });

    it('should round correctly', () => {
      // 333 basis points = 3.33%
      // 100 cents * 3.33% = 3.33 -> rounds to 3
      expect(percentOfCents(100, 333)).toBe(3);
    });

    it('should round up at 0.5', () => {
      // 500 basis points = 5%
      // 150 cents * 5% = 7.5 -> rounds to 8
      expect(percentOfCents(150, 500)).toBe(8);
    });

    it('should handle zero cents', () => {
      expect(percentOfCents(0, 700)).toBe(0);
    });

    it('should handle zero basis points', () => {
      expect(percentOfCents(10000, 0)).toBe(0);
    });

    it('should handle 100% (10000 basis points)', () => {
      expect(percentOfCents(5000, 10000)).toBe(5000);
    });

    it('should handle amounts over 100%', () => {
      // 15000 basis points = 150%
      expect(percentOfCents(1000, 15000)).toBe(1500);
    });
  });

  describe('addCents', () => {
    it('should add two amounts', () => {
      expect(addCents(100, 200)).toBe(300);
    });

    it('should add multiple amounts', () => {
      expect(addCents(100, 200, 300, 400)).toBe(1000);
    });

    it('should handle single amount', () => {
      expect(addCents(500)).toBe(500);
    });

    it('should handle no amounts', () => {
      expect(addCents()).toBe(0);
    });

    it('should handle negative amounts', () => {
      expect(addCents(100, -50)).toBe(50);
    });

    it('should handle zeros', () => {
      expect(addCents(0, 0, 100, 0)).toBe(100);
    });

    it('should handle large amounts', () => {
      expect(addCents(1000000, 2000000)).toBe(3000000);
    });
  });

  describe('subtractCents', () => {
    it('should subtract two amounts', () => {
      expect(subtractCents(500, 200)).toBe(300);
    });

    it('should handle subtraction resulting in zero', () => {
      expect(subtractCents(100, 100)).toBe(0);
    });

    it('should handle subtraction resulting in negative', () => {
      expect(subtractCents(100, 200)).toBe(-100);
    });

    it('should subtract zero', () => {
      expect(subtractCents(500, 0)).toBe(500);
    });

    it('should subtract from zero', () => {
      expect(subtractCents(0, 100)).toBe(-100);
    });

    it('should handle negative subtrahend', () => {
      // Subtracting negative is like adding
      expect(subtractCents(100, -50)).toBe(150);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should calculate platform fee (5%)', () => {
      const ticketPrice = 5000; // $50.00
      const platformFee = percentOfCents(ticketPrice, 500); // 500 bp = 5%
      expect(platformFee).toBe(250); // $2.50
    });

    it('should calculate Stripe fee (2.9%)', () => {
      const total = 10000; // $100.00
      const stripeFee = percentOfCents(total, 290); // 290 bp = 2.9%
      expect(stripeFee).toBe(290); // $2.90
    });

    it('should calculate net after fees', () => {
      const gross = 10000; // $100.00
      const stripeFee = percentOfCents(gross, 290);
      const platformFee = percentOfCents(gross, 500);
      const net = subtractCents(gross, addCents(stripeFee, platformFee));
      
      expect(net).toBe(10000 - 290 - 500); // $92.10
    });

    it('should split payment correctly', () => {
      const net = 9210; // After fees
      const venueShare = percentOfCents(net, 7000); // 70%
      const artistShare = percentOfCents(net, 3000); // 30%
      
      expect(venueShare).toBe(6447); // $64.47
      expect(artistShare).toBe(2763); // $27.63
      // Due to rounding, sum may differ slightly
      expect(venueShare + artistShare).toBeCloseTo(net, -1);
    });
  });
});
