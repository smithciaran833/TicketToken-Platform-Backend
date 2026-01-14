/**
 * Compliance Config Integration Tests
 *
 * Tests the compliance configuration including:
 * - Tax config (Tennessee rates, nexus states, digital asset reporting)
 * - AML config (thresholds, suspicious patterns)
 * - KYC config (basic and enhanced tiers)
 */

import { complianceConfig } from '../../../src/config/compliance';

describe('config/compliance', () => {
  // ==========================================================================
  // tax.tennessee
  // ==========================================================================
  describe('tax.tennessee', () => {
    it('should have stateSalesRate as 7.0', () => {
      expect(complianceConfig.tax.tennessee.stateSalesRate).toBe(7.0);
    });

    it('should have nashville local rate as 2.25', () => {
      expect(complianceConfig.tax.tennessee.localRates.nashville).toBe(2.25);
    });

    it('should have memphis local rate as 2.75', () => {
      expect(complianceConfig.tax.tennessee.localRates.memphis).toBe(2.75);
    });

    it('should have knoxville local rate as 2.5', () => {
      expect(complianceConfig.tax.tennessee.localRates.knoxville).toBe(2.5);
    });

    it('should have positive tax rates', () => {
      expect(complianceConfig.tax.tennessee.stateSalesRate).toBeGreaterThan(0);
      Object.values(complianceConfig.tax.tennessee.localRates).forEach(rate => {
        expect(rate).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // tax.nexusStates
  // ==========================================================================
  describe('tax.nexusStates', () => {
    it('should contain TN', () => {
      expect(complianceConfig.tax.nexusStates).toContain('TN');
    });

    it('should contain CA', () => {
      expect(complianceConfig.tax.nexusStates).toContain('CA');
    });

    it('should contain NY', () => {
      expect(complianceConfig.tax.nexusStates).toContain('NY');
    });

    it('should contain TX', () => {
      expect(complianceConfig.tax.nexusStates).toContain('TX');
    });

    it('should contain FL', () => {
      expect(complianceConfig.tax.nexusStates).toContain('FL');
    });

    it('should contain IL', () => {
      expect(complianceConfig.tax.nexusStates).toContain('IL');
    });

    it('should contain PA', () => {
      expect(complianceConfig.tax.nexusStates).toContain('PA');
    });

    it('should have 7 nexus states', () => {
      expect(complianceConfig.tax.nexusStates).toHaveLength(7);
    });

    it('should have all states as 2-letter codes', () => {
      complianceConfig.tax.nexusStates.forEach(state => {
        expect(state).toMatch(/^[A-Z]{2}$/);
      });
    });
  });

  // ==========================================================================
  // tax.digitalAssetReporting
  // ==========================================================================
  describe('tax.digitalAssetReporting', () => {
    it('should have form as 1099-DA', () => {
      expect(complianceConfig.tax.digitalAssetReporting.form).toBe('1099-DA');
    });

    it('should have threshold as 600', () => {
      expect(complianceConfig.tax.digitalAssetReporting.threshold).toBe(600);
    });

    it('should have startDate as Date instance', () => {
      expect(complianceConfig.tax.digitalAssetReporting.startDate).toBeInstanceOf(Date);
    });

    it('should have startDate as January 1, 2025', () => {
      const startDate = complianceConfig.tax.digitalAssetReporting.startDate;
      expect(startDate.getFullYear()).toBe(2025);
      expect(startDate.getMonth()).toBe(0); // January
      expect(startDate.getDate()).toBe(1);
    });

    it('should have positive threshold', () => {
      expect(complianceConfig.tax.digitalAssetReporting.threshold).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // aml
  // ==========================================================================
  describe('aml', () => {
    it('should have transactionThreshold as 10000', () => {
      expect(complianceConfig.aml.transactionThreshold).toBe(10000);
    });

    it('should have aggregateThreshold as 50000', () => {
      expect(complianceConfig.aml.aggregateThreshold).toBe(50000);
    });

    it('should have aggregateThreshold greater than transactionThreshold', () => {
      expect(complianceConfig.aml.aggregateThreshold).toBeGreaterThan(complianceConfig.aml.transactionThreshold);
    });

    it('should contain rapid_high_value pattern', () => {
      expect(complianceConfig.aml.suspiciousPatterns).toContain('rapid_high_value');
    });

    it('should contain structured_transactions pattern', () => {
      expect(complianceConfig.aml.suspiciousPatterns).toContain('structured_transactions');
    });

    it('should contain unusual_geography pattern', () => {
      expect(complianceConfig.aml.suspiciousPatterns).toContain('unusual_geography');
    });

    it('should have 3 suspicious patterns', () => {
      expect(complianceConfig.aml.suspiciousPatterns).toHaveLength(3);
    });
  });

  // ==========================================================================
  // kyc.basic
  // ==========================================================================
  describe('kyc.basic', () => {
    it('should have monthlyLimit as 20000', () => {
      expect(complianceConfig.kyc.basic.monthlyLimit).toBe(20000);
    });

    it('should require email', () => {
      expect(complianceConfig.kyc.basic.requirements).toContain('email');
    });

    it('should require phone', () => {
      expect(complianceConfig.kyc.basic.requirements).toContain('phone');
    });

    it('should have 2 requirements', () => {
      expect(complianceConfig.kyc.basic.requirements).toHaveLength(2);
    });
  });

  // ==========================================================================
  // kyc.enhanced
  // ==========================================================================
  describe('kyc.enhanced', () => {
    it('should have monthlyLimit as 100000', () => {
      expect(complianceConfig.kyc.enhanced.monthlyLimit).toBe(100000);
    });

    it('should have higher limit than basic', () => {
      expect(complianceConfig.kyc.enhanced.monthlyLimit).toBeGreaterThan(complianceConfig.kyc.basic.monthlyLimit);
    });

    it('should require id', () => {
      expect(complianceConfig.kyc.enhanced.requirements).toContain('id');
    });

    it('should require address', () => {
      expect(complianceConfig.kyc.enhanced.requirements).toContain('address');
    });

    it('should require ssn', () => {
      expect(complianceConfig.kyc.enhanced.requirements).toContain('ssn');
    });

    it('should have 3 requirements', () => {
      expect(complianceConfig.kyc.enhanced.requirements).toHaveLength(3);
    });

    it('should have more requirements than basic', () => {
      expect(complianceConfig.kyc.enhanced.requirements.length).toBeGreaterThan(complianceConfig.kyc.basic.requirements.length);
    });
  });
});
