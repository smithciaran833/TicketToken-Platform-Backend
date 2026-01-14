/**
 * Fees Config Integration Tests
 *
 * Tests the fee configuration including:
 * - Fee tiers (starter, pro, enterprise)
 * - Instant payout fees
 * - International payment fees
 * - Group payment fees
 * - ACH fees
 * - Chargeback reserves
 * - Payout thresholds
 */

import { feeConfig, chargebackReserves, payoutThresholds } from '../../../src/config/fees';

describe('config/fees', () => {
  // ==========================================================================
  // tiers.starter
  // ==========================================================================
  describe('tiers.starter', () => {
    it('should have name as Starter', () => {
      expect(feeConfig.tiers.starter.name).toBe('Starter');
    });

    it('should have percentage as number', () => {
      expect(typeof feeConfig.tiers.starter.percentage).toBe('number');
    });

    it('should have positive percentage', () => {
      expect(feeConfig.tiers.starter.percentage).toBeGreaterThan(0);
    });

    it('should have monthlyVolumeMax as number', () => {
      expect(typeof feeConfig.tiers.starter.monthlyVolumeMax).toBe('number');
    });

    it('should have positive monthlyVolumeMax', () => {
      expect(feeConfig.tiers.starter.monthlyVolumeMax).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // tiers.pro
  // ==========================================================================
  describe('tiers.pro', () => {
    it('should have name as Pro', () => {
      expect(feeConfig.tiers.pro.name).toBe('Pro');
    });

    it('should have percentage as number', () => {
      expect(typeof feeConfig.tiers.pro.percentage).toBe('number');
    });

    it('should have positive percentage', () => {
      expect(feeConfig.tiers.pro.percentage).toBeGreaterThan(0);
    });

    it('should have lower percentage than starter', () => {
      expect(feeConfig.tiers.pro.percentage).toBeLessThanOrEqual(feeConfig.tiers.starter.percentage);
    });

    it('should have monthlyVolumeMin as number', () => {
      expect(typeof feeConfig.tiers.pro.monthlyVolumeMin).toBe('number');
    });

    it('should have monthlyVolumeMax as number', () => {
      expect(typeof feeConfig.tiers.pro.monthlyVolumeMax).toBe('number');
    });

    it('should have monthlyVolumeMin equal to starter monthlyVolumeMax', () => {
      expect(feeConfig.tiers.pro.monthlyVolumeMin).toBe(feeConfig.tiers.starter.monthlyVolumeMax);
    });

    it('should have monthlyVolumeMax greater than monthlyVolumeMin', () => {
      expect(feeConfig.tiers.pro.monthlyVolumeMax).toBeGreaterThan(feeConfig.tiers.pro.monthlyVolumeMin);
    });
  });

  // ==========================================================================
  // tiers.enterprise
  // ==========================================================================
  describe('tiers.enterprise', () => {
    it('should have name as Enterprise', () => {
      expect(feeConfig.tiers.enterprise.name).toBe('Enterprise');
    });

    it('should have percentage as number', () => {
      expect(typeof feeConfig.tiers.enterprise.percentage).toBe('number');
    });

    it('should have positive percentage', () => {
      expect(feeConfig.tiers.enterprise.percentage).toBeGreaterThan(0);
    });

    it('should have lower percentage than pro', () => {
      expect(feeConfig.tiers.enterprise.percentage).toBeLessThanOrEqual(feeConfig.tiers.pro.percentage);
    });

    it('should have monthlyVolumeMin as number', () => {
      expect(typeof feeConfig.tiers.enterprise.monthlyVolumeMin).toBe('number');
    });

    it('should have monthlyVolumeMin equal to pro monthlyVolumeMax', () => {
      expect(feeConfig.tiers.enterprise.monthlyVolumeMin).toBe(feeConfig.tiers.pro.monthlyVolumeMax);
    });
  });

  // ==========================================================================
  // tier progression
  // ==========================================================================
  describe('tier progression', () => {
    it('should have fees in descending order (starter > pro > enterprise)', () => {
      expect(feeConfig.tiers.starter.percentage).toBeGreaterThanOrEqual(feeConfig.tiers.pro.percentage);
      expect(feeConfig.tiers.pro.percentage).toBeGreaterThanOrEqual(feeConfig.tiers.enterprise.percentage);
    });

    it('should have volume thresholds in ascending order', () => {
      expect(feeConfig.tiers.starter.monthlyVolumeMax).toBeLessThan(feeConfig.tiers.pro.monthlyVolumeMax);
      expect(feeConfig.tiers.pro.monthlyVolumeMax).toBe(feeConfig.tiers.enterprise.monthlyVolumeMin);
    });
  });

  // ==========================================================================
  // instantPayout
  // ==========================================================================
  describe('instantPayout', () => {
    it('should have percentage as 1.0', () => {
      expect(feeConfig.instantPayout.percentage).toBe(1.0);
    });

    it('should have minimum as 0.50', () => {
      expect(feeConfig.instantPayout.minimum).toBe(0.50);
    });

    it('should have positive percentage', () => {
      expect(feeConfig.instantPayout.percentage).toBeGreaterThan(0);
    });

    it('should have positive minimum', () => {
      expect(feeConfig.instantPayout.minimum).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // internationalPayment
  // ==========================================================================
  describe('internationalPayment', () => {
    it('should have percentage as 2.0', () => {
      expect(feeConfig.internationalPayment.percentage).toBe(2.0);
    });

    it('should have positive percentage', () => {
      expect(feeConfig.internationalPayment.percentage).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // groupPayment
  // ==========================================================================
  describe('groupPayment', () => {
    it('should have perMember as 0.50', () => {
      expect(feeConfig.groupPayment.perMember).toBe(0.50);
    });

    it('should have positive perMember fee', () => {
      expect(feeConfig.groupPayment.perMember).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // ach
  // ==========================================================================
  describe('ach', () => {
    it('should have fixed as 0.80', () => {
      expect(feeConfig.ach.fixed).toBe(0.80);
    });

    it('should have positive fixed fee', () => {
      expect(feeConfig.ach.fixed).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // chargebackReserves
  // ==========================================================================
  describe('chargebackReserves', () => {
    it('should have low as 5', () => {
      expect(chargebackReserves.low).toBe(5);
    });

    it('should have medium as 10', () => {
      expect(chargebackReserves.medium).toBe(10);
    });

    it('should have high as 15', () => {
      expect(chargebackReserves.high).toBe(15);
    });

    it('should have reserves in ascending order (low < medium < high)', () => {
      expect(chargebackReserves.low).toBeLessThan(chargebackReserves.medium);
      expect(chargebackReserves.medium).toBeLessThan(chargebackReserves.high);
    });

    it('should have all positive reserves', () => {
      expect(chargebackReserves.low).toBeGreaterThan(0);
      expect(chargebackReserves.medium).toBeGreaterThan(0);
      expect(chargebackReserves.high).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // payoutThresholds
  // ==========================================================================
  describe('payoutThresholds', () => {
    it('should have minimum as 100', () => {
      expect(payoutThresholds.minimum).toBe(100);
    });

    it('should have maximumDaily as 50000', () => {
      expect(payoutThresholds.maximumDaily).toBe(50000);
    });

    it('should have maximumDaily greater than minimum', () => {
      expect(payoutThresholds.maximumDaily).toBeGreaterThan(payoutThresholds.minimum);
    });

    it('should have positive minimum', () => {
      expect(payoutThresholds.minimum).toBeGreaterThan(0);
    });

    it('should have positive maximumDaily', () => {
      expect(payoutThresholds.maximumDaily).toBeGreaterThan(0);
    });
  });
});
