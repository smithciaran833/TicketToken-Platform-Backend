/**
 * Money Utility Integration Tests
 * 100% code coverage
 */

import {
  percentOfCents,
  addCents,
  subtractCents,
} from '../../../src/utils/money';

describe('Money Utilities', () => {
  describe('percentOfCents()', () => {
    it('should calculate 7% (700 basis points)', () => {
      const result = percentOfCents(10000, 700);
      expect(result).toBe(700); // 7% of $100 = $7
    });

    it('should calculate 10% (1000 basis points)', () => {
      const result = percentOfCents(5000, 1000);
      expect(result).toBe(500); // 10% of $50 = $5
    });

    it('should calculate 2.5% (250 basis points)', () => {
      const result = percentOfCents(10000, 250);
      expect(result).toBe(250); // 2.5% of $100 = $2.50
    });

    it('should calculate 100% (10000 basis points)', () => {
      const result = percentOfCents(5000, 10000);
      expect(result).toBe(5000); // 100% of $50 = $50
    });

    it('should calculate 0%', () => {
      const result = percentOfCents(10000, 0);
      expect(result).toBe(0);
    });

    it('should handle 0 cents', () => {
      const result = percentOfCents(0, 700);
      expect(result).toBe(0);
    });

    it('should round to nearest cent', () => {
      // 7% of $1.00 = $0.07
      expect(percentOfCents(100, 700)).toBe(7);

      // 7% of $1.01 = $0.0707 -> rounds to $0.07
      expect(percentOfCents(101, 700)).toBe(7);

      // 7% of $1.50 = $0.105 -> rounds to $0.11
      expect(percentOfCents(150, 700)).toBe(11);
    });

    it('should handle large amounts', () => {
      const result = percentOfCents(100000000, 500); // 5% of $1M
      expect(result).toBe(5000000); // $50,000
    });

    it('should handle small basis points', () => {
      const result = percentOfCents(10000, 1); // 0.01% of $100
      expect(result).toBe(1); // $0.01
    });

    it('should handle fractional basis points result', () => {
      // 1 basis point of $1.00 = $0.0001 -> rounds to 0
      expect(percentOfCents(100, 1)).toBe(0);

      // 1 basis point of $100.00 = $0.01 -> rounds to 1
      expect(percentOfCents(10000, 1)).toBe(1);
    });

    it('should calculate Stripe fee (2.9%)', () => {
      const result = percentOfCents(10000, 290);
      expect(result).toBe(290); // $2.90
    });

    it('should calculate platform fee (5%)', () => {
      const result = percentOfCents(10000, 500);
      expect(result).toBe(500); // $5.00
    });
  });

  describe('addCents()', () => {
    it('should add two amounts', () => {
      const result = addCents(1000, 500);
      expect(result).toBe(1500);
    });

    it('should add multiple amounts', () => {
      const result = addCents(1000, 500, 250, 100);
      expect(result).toBe(1850);
    });

    it('should handle single amount', () => {
      const result = addCents(1000);
      expect(result).toBe(1000);
    });

    it('should handle no amounts', () => {
      const result = addCents();
      expect(result).toBe(0);
    });

    it('should handle zeros', () => {
      const result = addCents(0, 0, 0);
      expect(result).toBe(0);
    });

    it('should handle negative amounts', () => {
      const result = addCents(1000, -500);
      expect(result).toBe(500);
    });

    it('should handle large amounts', () => {
      const result = addCents(100000000, 50000000, 25000000);
      expect(result).toBe(175000000);
    });

    it('should calculate total payment with fees', () => {
      const basePrice = 5000; // $50
      const platformFee = 250; // $2.50
      const taxAmount = 350; // $3.50
      const gasFee = 50; // $0.50

      const total = addCents(basePrice, platformFee, taxAmount, gasFee);
      expect(total).toBe(5650); // $56.50
    });
  });

  describe('subtractCents()', () => {
    it('should subtract two amounts', () => {
      const result = subtractCents(1000, 300);
      expect(result).toBe(700);
    });

    it('should handle equal amounts', () => {
      const result = subtractCents(500, 500);
      expect(result).toBe(0);
    });

    it('should handle larger subtrahend (negative result)', () => {
      const result = subtractCents(500, 1000);
      expect(result).toBe(-500);
    });

    it('should handle zero minuend', () => {
      const result = subtractCents(0, 500);
      expect(result).toBe(-500);
    });

    it('should handle zero subtrahend', () => {
      const result = subtractCents(1000, 0);
      expect(result).toBe(1000);
    });

    it('should handle negative amounts', () => {
      const result = subtractCents(1000, -500);
      expect(result).toBe(1500);
    });

    it('should handle large amounts', () => {
      const result = subtractCents(100000000, 25000000);
      expect(result).toBe(75000000);
    });

    it('should calculate venue payout', () => {
      const totalPayment = 10000; // $100
      const platformFee = 500; // $5

      const venuePayout = subtractCents(totalPayment, platformFee);
      expect(venuePayout).toBe(9500); // $95
    });

    it('should calculate refund amount', () => {
      const originalPayment = 7500; // $75
      const processingFee = 225; // $2.25 (non-refundable)

      const refundAmount = subtractCents(originalPayment, processingFee);
      expect(refundAmount).toBe(7275); // $72.75
    });
  });

  describe('combined operations', () => {
    it('should calculate complex payment breakdown', () => {
      const ticketPrice = 5000; // $50.00
      const quantity = 2;
      const subtotal = ticketPrice * quantity; // $100.00

      const platformFee = percentOfCents(subtotal, 500); // 5% = $5.00
      const stripeFee = addCents(percentOfCents(subtotal, 290), 30); // 2.9% + $0.30 = $3.20
      const tax = percentOfCents(subtotal, 825); // 8.25% = $8.25

      const total = addCents(subtotal, platformFee, stripeFee, tax);
      const venuePayout = subtractCents(subtotal, platformFee);

      expect(platformFee).toBe(500);
      expect(stripeFee).toBe(320);
      expect(tax).toBe(825);
      expect(total).toBe(11645); // $116.45
      expect(venuePayout).toBe(9500); // $95.00
    });

    it('should handle partial refund calculation', () => {
      const originalTotal = 10000; // $100.00
      const refundPercentage = 5000; // 50%
      
      const refundAmount = percentOfCents(originalTotal, refundPercentage);
      const remaining = subtractCents(originalTotal, refundAmount);

      expect(refundAmount).toBe(5000); // $50.00
      expect(remaining).toBe(5000); // $50.00
    });
  });
});
