/**
 * FeeCalculatorService Integration Tests
 */

import { FeeCalculatorService, feeCalculatorService } from '../../../src/services/fee-calculator.service';

describe('FeeCalculatorService', () => {
  describe('calculateFees', () => {
    it('should calculate fees with default tier', async () => {
      const result = await feeCalculatorService.calculateFees(100, 2);

      expect(result.subtotal).toBe(100);
      expect(result.serviceFeePercentage).toBe(10);
      expect(result.serviceFee).toBe(10); // 10% of 100
      expect(result.perTicketFee).toBe(4); // 2 * $2
      expect(result.total).toBeGreaterThan(100);
    });

    it('should calculate processing fee on subtotal + fees', async () => {
      const result = await feeCalculatorService.calculateFees(100, 1);

      // subtotal: 100, serviceFee: 10, perTicketFee: 2
      // processingFee = (100 + 10 + 2) * 2.9% = 3.248 rounded to 3.25
      expect(result.processingFee).toBeCloseTo(3.25, 2);
    });

    it('should round all values to 2 decimal places', async () => {
      const result = await feeCalculatorService.calculateFees(33.33, 3);

      expect(result.serviceFee).toBe(Math.round(3.333 * 100) / 100);
      expect(result.total.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    });

    it('should calculate venue payout as subtotal', async () => {
      const result = await feeCalculatorService.calculateFees(200, 4);

      expect(result.venuePayout).toBe(200);
    });

    it('should calculate platform revenue', async () => {
      const result = await feeCalculatorService.calculateFees(100, 1);

      // Platform gets serviceFee + processingFee
      expect(result.platformRevenue).toBe(result.serviceFee + result.processingFee);
    });

    it('should handle zero subtotal', async () => {
      const result = await feeCalculatorService.calculateFees(0, 1);

      expect(result.subtotal).toBe(0);
      expect(result.serviceFee).toBe(0);
      expect(result.perTicketFee).toBe(2);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should handle large ticket counts', async () => {
      const result = await feeCalculatorService.calculateFees(1000, 100);

      expect(result.perTicketFee).toBe(200); // 100 * $2
    });
  });

  describe('getFeeBreakdown', () => {
    it('should return formatted breakdown', async () => {
      const result = await feeCalculatorService.getFeeBreakdown(100, 2);

      expect(result.subtotal).toBe('$100.00');
      expect(result.fees.serviceFee.label).toContain('Service Fee');
      expect(result.fees.perTicketFee.label).toContain('Per Ticket Fee');
      expect(result.totalFees).toMatch(/^\$\d+\.\d{2}$/);
      expect(result.total).toMatch(/^\$\d+\.\d{2}$/);
    });
  });

  describe('toCents and toDollars', () => {
    it('should convert dollars to cents', () => {
      expect(feeCalculatorService.toCents(10.50)).toBe(1050);
      expect(feeCalculatorService.toCents(0.01)).toBe(1);
      expect(feeCalculatorService.toCents(99.99)).toBe(9999);
    });

    it('should convert cents to dollars', () => {
      expect(feeCalculatorService.toDollars(1050)).toBe(10.50);
      expect(feeCalculatorService.toDollars(1)).toBe(0.01);
      expect(feeCalculatorService.toDollars(9999)).toBe(99.99);
    });

    it('should handle rounding correctly', () => {
      expect(feeCalculatorService.toCents(10.555)).toBe(1056);
      expect(feeCalculatorService.toCents(10.554)).toBe(1055);
    });
  });
});
