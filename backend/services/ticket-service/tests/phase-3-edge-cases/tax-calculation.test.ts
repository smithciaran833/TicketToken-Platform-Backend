/**
 * Phase 3 Edge Cases: Tax Calculation Tests
 *
 * Tests tax calculation logic:
 * - Multi-jurisdiction taxes
 * - State and local rates
 * - Tax exemptions
 * - Rounding rules
 * - Tax-inclusive vs exclusive
 */

import { taxService } from '../../src/services/taxService';

describe('Phase 3: Tax Calculation', () => {
  describe('1. Multi-Jurisdiction Tax Calculation', () => {
    it('should calculate state + local taxes correctly', async () => {
      // Tennessee: 7% state + 2.25% local = 9.25%
      const result = await taxService.calculateOrderTax(
        'event-123',
        10000, // $100
        'TN'
      );

      expect(result.stateTaxCents).toBe(700); // $7
      expect(result.localTaxCents).toBe(225); // $2.25
      expect(result.totalTaxCents).toBe(925); // $9.25
      expect(result.taxRate).toBe(9.25);
    });

    it('should handle state without local tax', async () => {
      // Florida: 6% state, no local
      const result = await taxService.calculateOrderTax(
        'event-456',
        5000, // $50
        'FL'
      );

      expect(result.stateTaxCents).toBe(300); // $3
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(300);
      expect(result.taxRate).toBe(6.0);
    });
  });

  describe('2. State/Province Tax Rates', () => {
    it('should apply correct state tax rate for California', async () => {
      // California: 7.25% state + 2.25% local
      const result = await taxService.calculateOrderTax(
        'event-789',
        20000, // $200
        'CA'
      );

      expect(result.stateTaxCents).toBe(1450); // $14.50
      expect(result.localTaxCents).toBe(450); // $4.50
      expect(result.totalTaxCents).toBe(1900); // $19.00
    });

    it('should apply correct state tax rate for New York', async () => {
      // New York: 4% state + 4.5% local (NYC)
      const result = await taxService.calculateOrderTax(
        'event-101',
        15000, // $150
        'NY'
      );

      expect(result.stateTaxCents).toBe(600); // $6
      expect(result.localTaxCents).toBe(675); // $6.75
      expect(result.totalTaxCents).toBe(1275); // $12.75
    });
  });

  describe('3. Local Municipality Taxes', () => {
    it('should add Chicago local tax to Illinois state tax', async () => {
      // Illinois: 6.25% state + 2.75% local (Chicago)
      const result = await taxService.calculateOrderTax(
        'event-202',
        10000, // $100
        'IL'
      );

      expect(result.stateTaxCents).toBe(625); // $6.25
      expect(result.localTaxCents).toBe(275); // $2.75
      expect(result.totalTaxCents).toBe(900); // $9.00
      expect(result.breakdown.local).toBeTruthy();
      expect(result.breakdown.local.name).toBe('Local Tax');
    });

    it('should add Austin local tax to Texas state tax', async () => {
      // Texas: 6.25% state + 2% local
      const result = await taxService.calculateOrderTax(
        'event-303',
        8000, // $80
        'TX'
      );

      expect(result.stateTaxCents).toBe(500); // $5
      expect(result.localTaxCents).toBe(160); // $1.60
      expect(result.totalTaxCents).toBe(660); // $6.60
    });
  });

  describe('4. Tax Exemption Handling', () => {
    it('should calculate zero tax for Delaware (no sales tax)', async () => {
      // Delaware: 0% tax
      const result = await taxService.calculateOrderTax(
        'event-404',
        10000, // $100
        'DE'
      );

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
      expect(result.taxRate).toBe(0);
    });

    it('should calculate zero tax for Oregon (no sales tax)', async () => {
      // Oregon: 0% tax
      const result = await taxService.calculateOrderTax(
        'event-505',
        5000, // $50
        'OR'
      );

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });
  });

  describe('5. Tax Rounding Rules', () => {
    it('should round tax calculations correctly', async () => {
      // Test with amount that causes rounding
      // California 7.25% on $33.33 = $2.416425 should round to $2.42
      const result = await taxService.calculateOrderTax(
        'event-606',
        3333, // $33.33
        'CA'
      );

      // 3333 * 7.25 / 100 = 241.6425 rounds to 242 cents
      expect(result.stateTaxCents).toBe(242);
      
      // 3333 * 2.25 / 100 = 74.9925 rounds to 75 cents
      expect(result.localTaxCents).toBe(75);
      
      expect(result.totalTaxCents).toBe(317); // $3.17
    });

    it('should handle fractional cent rounding consistently', async () => {
      // Massachusetts 6.25% on $17.77 = $1.110625
      const result = await taxService.calculateOrderTax(
        'event-707',
        1777, // $17.77
        'MA'
      );

      // 1777 * 6.25 / 100 = 111.0625 rounds to 111 cents
      expect(result.stateTaxCents).toBe(111); // $1.11
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(111);
    });
  });

  describe('6. Zero-Tax Jurisdictions', () => {
    it('should handle Alaska (no state sales tax)', async () => {
      const result = await taxService.calculateOrderTax(
        'event-808',
        10000,
        'AK'
      );

      expect(result.stateTaxCents).toBe(0);
      expect(result.localTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });

    it('should handle Montana (no sales tax)', async () => {
      const result = await taxService.calculateOrderTax(
        'event-909',
        25000, // $250
        'MT'
      );

      expect(result.stateTaxCents).toBe(0);
      expect(result.totalTaxCents).toBe(0);
    });
  });
});
