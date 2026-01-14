// =============================================================================
// TEST SUITE: fees config
// =============================================================================

describe('fees config', () => {
  let feeConfig: any;
  let chargebackReserves: any;
  let payoutThresholds: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Fee Tiers - Starter - 3 test cases
  // ===========================================================================

  describe('Fee Tiers - Starter', () => {
    it('should have default starter tier percentage', () => {
      delete process.env.FEE_TIER_STARTER;
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.starter.percentage).toBe(8.2);
    });

    it('should use FEE_TIER_STARTER env var when provided', () => {
      process.env.FEE_TIER_STARTER = '9.0';
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.starter.percentage).toBe(9.0);
    });

    it('should have starter tier name and monthly volume max', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.starter.name).toBe('Starter');
      expect(feeConfig.tiers.starter.monthlyVolumeMax).toBeDefined();
    });
  });

  // ===========================================================================
  // Fee Tiers - Pro - 4 test cases
  // ===========================================================================

  describe('Fee Tiers - Pro', () => {
    it('should have default pro tier percentage', () => {
      delete process.env.FEE_TIER_PRO;
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.pro.percentage).toBe(7.9);
    });

    it('should use FEE_TIER_PRO env var when provided', () => {
      process.env.FEE_TIER_PRO = '8.5';
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.pro.percentage).toBe(8.5);
    });

    it('should have pro tier name', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.pro.name).toBe('Pro');
    });

    it('should have pro tier volume min and max', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.pro.monthlyVolumeMin).toBeDefined();
      expect(feeConfig.tiers.pro.monthlyVolumeMax).toBeDefined();
    });
  });

  // ===========================================================================
  // Fee Tiers - Enterprise - 3 test cases
  // ===========================================================================

  describe('Fee Tiers - Enterprise', () => {
    it('should have default enterprise tier percentage', () => {
      delete process.env.FEE_TIER_ENTERPRISE;
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.enterprise.percentage).toBe(7.5);
    });

    it('should use FEE_TIER_ENTERPRISE env var when provided', () => {
      process.env.FEE_TIER_ENTERPRISE = '7.0';
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.enterprise.percentage).toBe(7.0);
    });

    it('should have enterprise tier name and volume min', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.tiers.enterprise.name).toBe('Enterprise');
      expect(feeConfig.tiers.enterprise.monthlyVolumeMin).toBeDefined();
    });
  });

  // ===========================================================================
  // Additional Fees - 5 test cases
  // ===========================================================================

  describe('Additional Fees', () => {
    it('should have instant payout configuration', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.instantPayout.percentage).toBe(1.0);
      expect(feeConfig.instantPayout.minimum).toBe(0.50);
    });

    it('should have international payment percentage', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.internationalPayment.percentage).toBe(2.0);
    });

    it('should have group payment per member fee', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.groupPayment.perMember).toBe(0.50);
    });

    it('should have ACH fixed fee', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig.ach.fixed).toBe(0.80);
    });

    it('should have all additional fee categories', () => {
      feeConfig = require('../../../src/config/fees').feeConfig;

      expect(feeConfig).toHaveProperty('instantPayout');
      expect(feeConfig).toHaveProperty('internationalPayment');
      expect(feeConfig).toHaveProperty('groupPayment');
      expect(feeConfig).toHaveProperty('ach');
    });
  });

  // ===========================================================================
  // Chargeback Reserves - 3 test cases
  // ===========================================================================

  describe('Chargeback Reserves', () => {
    it('should have low risk reserve of 5%', () => {
      chargebackReserves = require('../../../src/config/fees').chargebackReserves;

      expect(chargebackReserves.low).toBe(5);
    });

    it('should have medium risk reserve of 10%', () => {
      chargebackReserves = require('../../../src/config/fees').chargebackReserves;

      expect(chargebackReserves.medium).toBe(10);
    });

    it('should have high risk reserve of 15%', () => {
      chargebackReserves = require('../../../src/config/fees').chargebackReserves;

      expect(chargebackReserves.high).toBe(15);
    });
  });

  // ===========================================================================
  // Payout Thresholds - 2 test cases
  // ===========================================================================

  describe('Payout Thresholds', () => {
    it('should have minimum payout of $100', () => {
      payoutThresholds = require('../../../src/config/fees').payoutThresholds;

      expect(payoutThresholds.minimum).toBe(100);
    });

    it('should have maximum daily payout of $50k', () => {
      payoutThresholds = require('../../../src/config/fees').payoutThresholds;

      expect(payoutThresholds.maximumDaily).toBe(50000);
    });
  });
});
