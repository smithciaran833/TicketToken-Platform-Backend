import { TaxService } from '../../src/services/taxService';

/**
 * INTEGRATION TESTS FOR TAX SERVICE
 * Tests tax calculation for all states
 */

describe('TaxService Integration Tests', () => {
  let taxService: TaxService;

  beforeAll(() => {
    taxService = new TaxService();
  });

  describe('calculateOrderTax', () => {
    it('should calculate tax for California', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000, // $100.00
        'CA'
      );

      // CA: 7.25% state + 2.25% local = 9.5%
      expect(result.stateTaxCents).toBe(725);
      expect(result.localTaxCents).toBe(225);
      expect(result.totalTaxCents).toBe(950);
      expect(result.taxRate).toBe(9.5);
    });

    it('should calculate tax for New York', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'NY'
      );

      // NY: 4% state + 4.5% local = 8.5%
      expect(result.stateTaxCents).toBe(400);
      expect(result.localTaxCents).toBe(450);
      expect(result.totalTaxCents).toBe(850);
      expect(result.taxRate).toBe(8.5);
    });

    it('should calculate tax for Texas', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'TX'
      );

      // TX: 6.25% state + 2% local = 8.25%
      expect(result.stateTaxCents).toBe(625);
      expect(result.localTaxCents).toBe(200);
      expect(result.totalTaxCents).toBe(825);
    });

    it('should calculate tax for states with no sales tax', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'DE' // Delaware has no sales tax
      );

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    it('should calculate tax for Oregon (no sales tax)', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'OR'
      );

      expect(result.totalTaxCents).toBe(0);
    });

    it('should calculate tax for Montana (no sales tax)', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'MT'
      );

      expect(result.totalTaxCents).toBe(0);
    });

    it('should handle small amounts correctly', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        100, // $1.00
        'CA'
      );

      expect(result.stateTaxCents).toBe(7); // Rounded
      expect(result.localTaxCents).toBe(2);
      expect(result.totalTaxCents).toBe(9);
    });

    it('should handle large amounts correctly', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        1000000, // $10,000.00
        'CA'
      );

      expect(result.stateTaxCents).toBe(72500);
      expect(result.localTaxCents).toBe(22500);
      expect(result.totalTaxCents).toBe(95000);
    });

    it('should provide breakdown for California', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'CA'
      );

      expect(result.breakdown.state).toBeDefined();
      expect(result.breakdown.state.name).toBe('CA Sales Tax');
      expect(result.breakdown.state.rate).toBe(7.25);
      expect(result.breakdown.state.amountCents).toBe(725);

      expect(result.breakdown.local).toBeDefined();
      expect(result.breakdown.local.name).toBe('Local Tax');
      expect(result.breakdown.local.rate).toBe(2.25);
    });

    it('should have null local breakdown for states without local tax', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'FL' // Florida has state tax but no local in this setup
      );

      expect(result.breakdown.state).toBeDefined();
      expect(result.breakdown.local).toBeNull();
    });

    it('should calculate tax for Illinois', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'IL'
      );

      // IL: 6.25% state + 2.75% local = 9%
      expect(result.stateTaxCents).toBe(625);
      expect(result.localTaxCents).toBe(275);
      expect(result.totalTaxCents).toBe(900);
    });

    it('should calculate tax for Tennessee', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'TN'
      );

      // TN: 7% state + 2.25% local = 9.25%
      expect(result.stateTaxCents).toBe(700);
      expect(result.localTaxCents).toBe(225);
      expect(result.totalTaxCents).toBe(925);
    });

    it('should handle unknown state as zero tax', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'ZZ' // Invalid state code
      );

      expect(result.totalTaxCents).toBe(0);
    });

    it('should round fractional cents correctly', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        333, // $3.33
        'CA'
      );

      // 333 * 7.25% = 24.1425 -> rounds to 24
      // 333 * 2.25% = 7.4925 -> rounds to 7
      expect(result.stateTaxCents).toBe(24);
      expect(result.localTaxCents).toBe(7);
      expect(result.totalTaxCents).toBe(31);
    });

    it('should calculate tax for all 50 states', async () => {
      const states = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
      ];

      for (const state of states) {
        const result = await taxService.calculateOrderTax(
          'event-123',
          10000,
          state
        );

        // All should return valid results
        expect(result).toBeDefined();
        expect(result.totalTaxCents).toBeGreaterThanOrEqual(0);
        expect(result.taxRate).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have consistent cent calculations (no float errors)', async () => {
      // Test that repeated calculations give same results
      const result1 = await taxService.calculateOrderTax('event-123', 12345, 'CA');
      const result2 = await taxService.calculateOrderTax('event-123', 12345, 'CA');

      expect(result1.totalTaxCents).toBe(result2.totalTaxCents);
      expect(result1.stateTaxCents).toBe(result2.stateTaxCents);
      expect(result1.localTaxCents).toBe(result2.localTaxCents);
    });

    it('should handle zero amount', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        0,
        'CA'
      );

      expect(result.totalTaxCents).toBe(0);
      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
    });

    it('should calculate tax for Washington', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'WA'
      );

      // WA: 6.5% state
      expect(result.stateTaxCents).toBe(650);
      expect(result.totalTaxCents).toBeGreaterThanOrEqual(650);
    });

    it('should calculate tax for Massachusetts', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'MA'
      );

      // MA: 6.25% state
      expect(result.stateTaxCents).toBe(625);
    });

    it('should calculate tax for Pennsylvania', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'PA'
      );

      // PA: 6% state
      expect(result.stateTaxCents).toBe(600);
    });

    it('should calculate tax for New Jersey', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'NJ'
      );

      // NJ: 6.625% state
      expect(result.stateTaxCents).toBe(663); // Rounded from 662.5
    });

    it('should calculate tax for Mississippi', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'MS'
      );

      // MS: 7% state
      expect(result.stateTaxCents).toBe(700);
    });

    it('should calculate tax for Rhode Island', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'RI'
      );

      // RI: 7% state
      expect(result.stateTaxCents).toBe(700);
    });

    it('should calculate tax for Indiana', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'IN'
      );

      // IN: 7% state
      expect(result.stateTaxCents).toBe(700);
    });

    it('should use integer math throughout calculation', async () => {
      // Test various amounts to ensure no floating point errors
      const amounts = [1, 99, 100, 999, 1000, 9999, 10000, 123456];

      for (const amount of amounts) {
        const result = await taxService.calculateOrderTax(
          'event-123',
          amount,
          'CA'
        );

        // All values should be integers
        expect(Number.isInteger(result.stateTaxCents)).toBe(true);
        expect(Number.isInteger(result.localTaxCents)).toBe(true);
        expect(Number.isInteger(result.totalTaxCents)).toBe(true);
      }
    });

    it('should handle case-sensitive state codes', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'ca' // lowercase
      );

      // Should return 0 as 'ca' !== 'CA'
      expect(result.totalTaxCents).toBe(0);
    });

    it('should provide complete breakdown structure', async () => {
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000,
        'NY'
      );

      expect(result).toHaveProperty('stateTaxCents');
      expect(result).toHaveProperty('localTaxCents');
      expect(result).toHaveProperty('totalTaxCents');
      expect(result).toHaveProperty('taxRate');
      expect(result).toHaveProperty('breakdown');
      expect(result.breakdown).toHaveProperty('state');
      expect(result.breakdown).toHaveProperty('local');
    });

    it('should calculate combined rate correctly for all local tax states', async () => {
      const localTaxStates = ['TN', 'TX', 'CA', 'NY', 'IL'];

      for (const state of localTaxStates) {
        const result = await taxService.calculateOrderTax(
          'event-123',
          10000,
          state
        );

        // Combined rate should equal state + local
        const calculatedRate = (result.stateTaxCents + result.localTaxCents) / 100;
        expect(Math.abs(result.taxRate - calculatedRate)).toBeLessThan(0.01);
      }
    });
  });
});
