// =============================================================================
// TEST SUITE: compliance config
// =============================================================================

import { complianceConfig } from '../../../src/config/compliance';

describe('compliance config', () => {
  // ===========================================================================
  // Tax Configuration - Tennessee - 4 test cases
  // ===========================================================================

  describe('Tax Configuration - Tennessee', () => {
    it('should have Tennessee state sales rate', () => {
      expect(complianceConfig.tax.tennessee.stateSalesRate).toBe(7.0);
    });

    it('should have Nashville local rate', () => {
      expect(complianceConfig.tax.tennessee.localRates.nashville).toBe(2.25);
    });

    it('should have Memphis local rate', () => {
      expect(complianceConfig.tax.tennessee.localRates.memphis).toBe(2.75);
    });

    it('should have Knoxville local rate', () => {
      expect(complianceConfig.tax.tennessee.localRates.knoxville).toBe(2.5);
    });
  });

  // ===========================================================================
  // Tax Configuration - Nexus States - 2 test cases
  // ===========================================================================

  describe('Tax Configuration - Nexus States', () => {
    it('should have array of nexus states', () => {
      expect(complianceConfig.tax.nexusStates).toBeInstanceOf(Array);
      expect(complianceConfig.tax.nexusStates.length).toBeGreaterThan(0);
    });

    it('should include major states', () => {
      const states = complianceConfig.tax.nexusStates;
      
      expect(states).toContain('TN');
      expect(states).toContain('CA');
      expect(states).toContain('NY');
      expect(states).toContain('TX');
      expect(states).toContain('FL');
    });
  });

  // ===========================================================================
  // Tax Configuration - Digital Asset Reporting - 3 test cases
  // ===========================================================================

  describe('Tax Configuration - Digital Asset Reporting', () => {
    it('should use form 1099-DA', () => {
      expect(complianceConfig.tax.digitalAssetReporting.form).toBe('1099-DA');
    });

    it('should have threshold of $600', () => {
      expect(complianceConfig.tax.digitalAssetReporting.threshold).toBe(600);
    });

    it('should have start date of January 1, 2025', () => {
      expect(complianceConfig.tax.digitalAssetReporting.startDate).toBeInstanceOf(Date);
      expect(complianceConfig.tax.digitalAssetReporting.startDate.getFullYear()).toBe(2025);
      expect(complianceConfig.tax.digitalAssetReporting.startDate.getMonth()).toBe(0);
      expect(complianceConfig.tax.digitalAssetReporting.startDate.getDate()).toBe(1);
    });
  });

  // ===========================================================================
  // AML Configuration - 3 test cases
  // ===========================================================================

  describe('AML Configuration', () => {
    it('should have transaction threshold of $10,000', () => {
      expect(complianceConfig.aml.transactionThreshold).toBe(10000);
    });

    it('should have aggregate threshold of $50,000', () => {
      expect(complianceConfig.aml.aggregateThreshold).toBe(50000);
    });

    it('should have suspicious patterns array', () => {
      expect(complianceConfig.aml.suspiciousPatterns).toBeInstanceOf(Array);
      expect(complianceConfig.aml.suspiciousPatterns).toContain('rapid_high_value');
      expect(complianceConfig.aml.suspiciousPatterns).toContain('structured_transactions');
      expect(complianceConfig.aml.suspiciousPatterns).toContain('unusual_geography');
    });
  });

  // ===========================================================================
  // KYC Configuration - Basic - 2 test cases
  // ===========================================================================

  describe('KYC Configuration - Basic', () => {
    it('should have monthly limit of $20,000', () => {
      expect(complianceConfig.kyc.basic.monthlyLimit).toBe(20000);
    });

    it('should require email and phone', () => {
      expect(complianceConfig.kyc.basic.requirements).toEqual(['email', 'phone']);
    });
  });

  // ===========================================================================
  // KYC Configuration - Enhanced - 2 test cases
  // ===========================================================================

  describe('KYC Configuration - Enhanced', () => {
    it('should have monthly limit of $100,000', () => {
      expect(complianceConfig.kyc.enhanced.monthlyLimit).toBe(100000);
    });

    it('should require id, address, and ssn', () => {
      expect(complianceConfig.kyc.enhanced.requirements).toEqual(['id', 'address', 'ssn']);
    });
  });

  // ===========================================================================
  // Overall Structure - 3 test cases
  // ===========================================================================

  describe('Overall Structure', () => {
    it('should have tax, aml, and kyc sections', () => {
      expect(complianceConfig).toHaveProperty('tax');
      expect(complianceConfig).toHaveProperty('aml');
      expect(complianceConfig).toHaveProperty('kyc');
    });

    it('should have complete tax configuration', () => {
      expect(complianceConfig.tax).toHaveProperty('tennessee');
      expect(complianceConfig.tax).toHaveProperty('nexusStates');
      expect(complianceConfig.tax).toHaveProperty('digitalAssetReporting');
    });

    it('should have complete kyc configuration', () => {
      expect(complianceConfig.kyc).toHaveProperty('basic');
      expect(complianceConfig.kyc).toHaveProperty('enhanced');
    });
  });
});
