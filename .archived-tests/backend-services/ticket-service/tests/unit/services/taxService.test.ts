import { TaxService, taxService } from '../../../src/services/taxService';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('TaxService', () => {
  let service: TaxService;

  beforeEach(() => {
    service = new TaxService();
  });

  // =============================================================================
  // calculateOrderTax() - 30+ test cases
  // =============================================================================

  describe('calculateOrderTax()', () => {
    const eventId = 'event-123';

    // =============================================================================
    // Basic calculation tests
    // =============================================================================

    it('should calculate tax for California', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'CA'); // $100

      expect(result.stateTaxCents).toBe(725); // 7.25%
      expect(result.localTaxCents).toBe(225); // 2.25%
      expect(result.totalTaxCents).toBe(950); // $9.50 total
      expect(result.taxRate).toBe(9.5);
    });

    it('should calculate tax for Texas', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'TX');

      expect(result.stateTaxCents).toBe(625); // 6.25%
      expect(result.localTaxCents).toBe(200); // 2.0%
      expect(result.totalTaxCents).toBe(825);
      expect(result.taxRate).toBe(8.25);
    });

    it('should calculate tax for New York', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'NY');

      expect(result.stateTaxCents).toBe(400); // 4.0%
      expect(result.localTaxCents).toBe(450); // 4.5%
      expect(result.totalTaxCents).toBe(850);
      expect(result.taxRate).toBe(8.5);
    });

    it('should calculate tax for Tennessee', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'TN');

      expect(result.stateTaxCents).toBe(700); // 7.0%
      expect(result.localTaxCents).toBe(225); // 2.25%
      expect(result.totalTaxCents).toBe(925);
      expect(result.taxRate).toBe(9.25);
    });

    it('should calculate tax for Illinois', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'IL');

      expect(result.stateTaxCents).toBe(625); // 6.25%
      expect(result.localTaxCents).toBe(275); // 2.75%
      expect(result.totalTaxCents).toBe(900);
      expect(result.taxRate).toBe(9.0);
    });

    // =============================================================================
    // Zero tax states
    // =============================================================================

    it('should return zero tax for Alaska', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'AK');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    it('should return zero tax for Delaware', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'DE');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    it('should return zero tax for Montana', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'MT');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    it('should return zero tax for New Hampshire', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'NH');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    it('should return zero tax for Oregon', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'OR');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    // =============================================================================
    // States with only state tax (no local)
    // =============================================================================

    it('should calculate state tax only for Florida', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'FL');

      expect(result.stateTaxCents).toBe(600); // 6.0%
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(600);
      expect(result.taxRate).toBe(6.0);
    });

    it('should calculate state tax only for Georgia', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'GA');

      expect(result.stateTaxCents).toBe(400); // 4.0%
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(400);
      expect(result.taxRate).toBe(4.0);
    });

    it('should calculate state tax only for Massachusetts', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'MA');

      expect(result.stateTaxCents).toBe(625); // 6.25%
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(625);
      expect(result.taxRate).toBe(6.25);
    });

    it('should calculate state tax only for Pennsylvania', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'PA');

      expect(result.stateTaxCents).toBe(600); // 6.0%
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(600);
      expect(result.taxRate).toBe(6.0);
    });

    // =============================================================================
    // Edge case amounts
    // =============================================================================

    it('should handle zero amount', async () => {
      const result = await service.calculateOrderTax(eventId, 0, 'CA');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });

    it('should handle small amounts (1 cent)', async () => {
      const result = await service.calculateOrderTax(eventId, 1, 'CA');

      expect(result.stateTaxCents).toBe(0); // rounds to 0
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });

    it('should handle large amounts', async () => {
      const result = await service.calculateOrderTax(eventId, 100000000, 'CA'); // $1,000,000

      expect(result.stateTaxCents).toBe(7250000); // $72,500
      expect(result.localTaxCents).toBe(2250000); // $22,500
      expect(result.totalTaxCents).toBe(9500000); // $95,000
    });

    it('should round fractional cents correctly', async () => {
      const result = await service.calculateOrderTax(eventId, 103, 'CA'); // $1.03

      // 103 * 7.25 / 100 = 7.4675 -> rounds to 7
      expect(result.stateTaxCents).toBe(7);
      // 103 * 2.25 / 100 = 2.3175 -> rounds to 2
      expect(result.localTaxCents).toBe(2);
      expect(result.totalTaxCents).toBe(9);
    });

    it('should round up at .5 cents', async () => {
      const result = await service.calculateOrderTax(eventId, 207, 'CA'); // $2.07

      // 207 * 7.25 / 100 = 15.0075 -> rounds to 15
      expect(result.stateTaxCents).toBe(15);
      // 207 * 2.25 / 100 = 4.6575 -> rounds to 5
      expect(result.localTaxCents).toBe(5);
      expect(result.totalTaxCents).toBe(20);
    });

    // =============================================================================
    // Unknown state handling
    // =============================================================================

    it('should return zero tax for unknown state', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'XX');

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    it('should handle lowercase state code', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'ca');

      expect(result.stateTaxCents).toBe(0); // Not found, returns 0
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });

    // =============================================================================
    // Breakdown structure tests
    // =============================================================================

    it('should include breakdown for state with local tax', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'CA');

      expect(result.breakdown).toEqual({
        state: {
          name: 'CA Sales Tax',
          rate: 7.25,
          amountCents: 725,
        },
        local: {
          name: 'Local Tax',
          rate: 2.25,
          amountCents: 225,
        },
      });
    });

    it('should include breakdown for state without local tax', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'FL');

      expect(result.breakdown).toEqual({
        state: {
          name: 'FL Sales Tax',
          rate: 6.0,
          amountCents: 600,
        },
        local: null,
      });
    });

    it('should have null local in breakdown for zero-tax state', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'OR');

      expect(result.breakdown.state.name).toBe('OR Sales Tax');
      expect(result.breakdown.state.rate).toBe(0);
      expect(result.breakdown.local).toBeNull();
    });

    // =============================================================================
    // All states coverage (sample from each region)
    // =============================================================================

    it('should calculate tax for Alabama', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'AL');

      expect(result.stateTaxCents).toBe(400);
      expect(result.taxRate).toBe(4.0);
    });

    it('should calculate tax for Arizona', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'AZ');

      expect(result.stateTaxCents).toBe(560);
      expect(result.taxRate).toBe(5.6);
    });

    it('should calculate tax for Colorado', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'CO');

      expect(result.stateTaxCents).toBe(290);
      expect(result.taxRate).toBe(2.9);
    });

    it('should calculate tax for Connecticut', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'CT');

      expect(result.stateTaxCents).toBe(635);
      expect(result.taxRate).toBe(6.35);
    });

    it('should calculate tax for Washington', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'WA');

      expect(result.stateTaxCents).toBe(650);
      expect(result.taxRate).toBe(6.5);
    });

    it('should calculate tax for Mississippi', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'MS');

      expect(result.stateTaxCents).toBe(700);
      expect(result.taxRate).toBe(7.0);
    });

    it('should calculate tax for Rhode Island', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'RI');

      expect(result.stateTaxCents).toBe(700);
      expect(result.taxRate).toBe(7.0);
    });

    // =============================================================================
    // Integer math precision tests
    // =============================================================================

    it('should maintain precision with integer math', async () => {
      const result = await service.calculateOrderTax(eventId, 9999, 'CA');

      // 9999 * 7.25 / 100 = 724.9275 -> 725
      expect(result.stateTaxCents).toBe(725);
      // 9999 * 2.25 / 100 = 224.9775 -> 225
      expect(result.localTaxCents).toBe(225);
      expect(result.totalTaxCents).toBe(950);
    });

    it('should not lose precision on repeated calculations', async () => {
      const result1 = await service.calculateOrderTax(eventId, 5000, 'CA');
      const result2 = await service.calculateOrderTax(eventId, 5000, 'CA');

      expect(result1.totalTaxCents).toBe(result2.totalTaxCents);
      expect(result1.totalTaxCents).toBe(475); // $4.75
    });

    // =============================================================================
    // Return value structure tests
    // =============================================================================

    it('should return all required fields', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'CA');

      expect(result).toHaveProperty('stateTaxCents');
      expect(result).toHaveProperty('localTaxCents');
      expect(result).toHaveProperty('totalTaxCents');
      expect(result).toHaveProperty('taxRate');
      expect(result).toHaveProperty('breakdown');
    });

    it('should return numbers for all tax amounts', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'CA');

      expect(typeof result.stateTaxCents).toBe('number');
      expect(typeof result.localTaxCents).toBe('number');
      expect(typeof result.totalTaxCents).toBe('number');
      expect(typeof result.taxRate).toBe('number');
    });

    it('should return integers for all cent amounts', async () => {
      const result = await service.calculateOrderTax(eventId, 10000, 'CA');

      expect(Number.isInteger(result.stateTaxCents)).toBe(true);
      expect(Number.isInteger(result.localTaxCents)).toBe(true);
      expect(Number.isInteger(result.totalTaxCents)).toBe(true);
    });
  });

  // =============================================================================
  // Exported instance test
  // =============================================================================

  describe('taxService instance', () => {
    it('should export a singleton instance', () => {
      expect(taxService).toBeInstanceOf(TaxService);
    });

    it('should work with exported instance', async () => {
      const result = await taxService.calculateOrderTax('event-123', 10000, 'CA');

      expect(result.totalTaxCents).toBe(950);
    });
  });
});
