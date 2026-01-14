/**
 * Unit Tests for src/services/taxService.ts
 */

import { TaxService, taxService } from '../../../src/services/taxService';

describe('services/taxService', () => {
  describe('calculateOrderTax()', () => {
    it('calculates state tax correctly', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'CA');

      // CA rate is 7.25%
      expect(result.stateTaxCents).toBe(725);
    });

    it('calculates local tax when applicable', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'CA');

      // CA local rate is 2.25%
      expect(result.localTaxCents).toBe(225);
    });

    it('returns 0 tax for states with no sales tax', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'OR');

      // Oregon has no sales tax
      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });

    it('calculates total tax as sum of state and local', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'NY');

      // NY: 4% state + 4.5% local = 8.5%
      expect(result.totalTaxCents).toBe(result.stateTaxCents + result.localTaxCents);
      expect(result.totalTaxCents).toBe(850);
    });

    it('returns effective tax rate', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'TX');

      // TX: 6.25% state + 2% local = 8.25%
      expect(result.taxRate).toBe(8.25);
    });

    it('uses pure integer math (no floating point errors)', async () => {
      // Test with amount that could cause floating point issues
      const result = await taxService.calculateOrderTax('event-1', 9999, 'CA');

      // Should be whole numbers
      expect(Number.isInteger(result.stateTaxCents)).toBe(true);
      expect(Number.isInteger(result.localTaxCents)).toBe(true);
      expect(Number.isInteger(result.totalTaxCents)).toBe(true);
    });

    it('returns breakdown with state info', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'FL');

      expect(result.breakdown.state).toEqual({
        name: 'FL Sales Tax',
        rate: 6.0,
        amountCents: 600,
      });
    });

    it('returns null local breakdown when no local tax', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'FL');

      // FL has no local tax in this implementation
      expect(result.breakdown.local).toBeNull();
    });

    it('returns local breakdown when local tax exists', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'TN');

      expect(result.breakdown.local).toEqual({
        name: 'Local Tax',
        rate: 2.25,
        amountCents: 225,
      });
    });

    it('handles unknown state with 0 tax', async () => {
      const result = await taxService.calculateOrderTax('event-1', 10000, 'XX');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
    });

    it('handles zero subtotal', async () => {
      const result = await taxService.calculateOrderTax('event-1', 0, 'CA');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });
  });
});
