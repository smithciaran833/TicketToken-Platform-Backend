/**
 * Unit Tests: Order Configuration
 * Tests all order config settings and validation
 */

describe('Order Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ============================================
  // Fee Configuration - Defaults
  // ============================================
  describe('Fee Configuration - Defaults', () => {
    it('should have default platform fee of 5%', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.platformFeePercentage).toBe(5);
    });

    it('should have default processing fee of 2.9%', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.processingFeePercentage).toBe(2.9);
    });

    it('should have default fixed processing fee of 30 cents', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.processingFeeFixedCents).toBe(30);
    });

    it('should have default tax rate of 8%', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.defaultTaxRate).toBe(8);
    });
  });

  // ============================================
  // Fee Configuration - Environment Overrides
  // ============================================
  describe('Fee Configuration - Environment Overrides', () => {
    it('should use PLATFORM_FEE_PERCENTAGE from environment', () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '10';
      jest.resetModules();
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.platformFeePercentage).toBe(10);
    });

    it('should use PROCESSING_FEE_PERCENTAGE from environment', () => {
      process.env.PROCESSING_FEE_PERCENTAGE = '3.5';
      jest.resetModules();
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.processingFeePercentage).toBe(3.5);
    });

    it('should use PROCESSING_FEE_FIXED_CENTS from environment', () => {
      process.env.PROCESSING_FEE_FIXED_CENTS = '50';
      jest.resetModules();
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.processingFeeFixedCents).toBe(50);
    });

    it('should use DEFAULT_TAX_RATE from environment', () => {
      process.env.DEFAULT_TAX_RATE = '10';
      jest.resetModules();
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.fees.defaultTaxRate).toBe(10);
    });
  });

  // ============================================
  // Reservation Configuration
  // ============================================
  describe('Reservation Configuration', () => {
    it('should have default duration of 15 minutes', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.reservation.durationMinutes).toBe(15);
    });

    it('should have VIP duration of 30 minutes', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.reservation.vipDurationMinutes).toBe(30);
    });

    it('should have grace period of 2 minutes', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.reservation.gracePeriodMinutes).toBe(2);
    });

    it('should use RESERVATION_DURATION_MINUTES from environment', () => {
      process.env.RESERVATION_DURATION_MINUTES = '20';
      jest.resetModules();
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.reservation.durationMinutes).toBe(20);
    });
  });

  // ============================================
  // Order Limits
  // ============================================
  describe('Order Limits', () => {
    it('should have max order value of $100,000', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.limits.maxOrderValueCents).toBe(10000000);
    });

    it('should have min order value of $1', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.limits.minOrderValueCents).toBe(100);
    });

    it('should have max 50 items per order', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.limits.maxItemsPerOrder).toBe(50);
    });

    it('should have max 10 quantity per item', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.limits.maxQuantityPerItem).toBe(10);
    });

    it('should have max 20 orders per user per day', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.limits.maxOrdersPerUserPerDay).toBe(20);
    });

    it('should have max 5 orders per user per event', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.limits.maxOrdersPerUserPerEvent).toBe(5);
    });
  });

  // ============================================
  // Refund Configuration
  // ============================================
  describe('Refund Configuration', () => {
    it('should have 24 hour refund cutoff', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.refunds.cutoffHours).toBe(24);
    });

    it('should retain 2.5% processing fee on refunds', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.refunds.processingFeeRetentionPercentage).toBe(2.5);
    });

    it('should auto-approve refunds under $500', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.refunds.autoApproveThresholdCents).toBe(50000);
    });
  });

  // ============================================
  // Currency Configuration
  // ============================================
  describe('Currency Configuration', () => {
    it('should default to USD', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.currency.default).toBe('USD');
    });

    it('should support USD, EUR, GBP by default', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.currency.supported).toContain('USD');
      expect(orderConfig.currency.supported).toContain('EUR');
      expect(orderConfig.currency.supported).toContain('GBP');
    });
  });

  // ============================================
  // Pagination Configuration
  // ============================================
  describe('Pagination Configuration', () => {
    it('should have default limit of 50', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.pagination.defaultLimit).toBe(50);
    });

    it('should have max limit of 100', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.pagination.maxLimit).toBe(100);
    });
  });

  // ============================================
  // Background Jobs Configuration
  // ============================================
  describe('Background Jobs Configuration', () => {
    it('should check expiration every 1 minute', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.jobs.expirationCheckIntervalMinutes).toBe(1);
    });

    it('should aggregate metrics every 5 minutes', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.jobs.metricsAggregationIntervalMinutes).toBe(5);
    });
  });

  // ============================================
  // Archiving Configuration
  // ============================================
  describe('Archiving Configuration', () => {
    it('should be disabled by default', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.enabled).toBe(false);
    });

    it('should retain orders for 90 days', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.retentionDays).toBe(90);
    });

    it('should process in batches of 1000', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.batchSize).toBe(1000);
    });

    it('should archive max 10000 orders per run', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.maxOrdersPerRun).toBe(10000);
    });

    it('should archive completed lifecycle statuses', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.archivableStatuses).toContain('COMPLETED');
      expect(orderConfig.archiving.archivableStatuses).toContain('CANCELLED');
      expect(orderConfig.archiving.archivableStatuses).toContain('EXPIRED');
      expect(orderConfig.archiving.archivableStatuses).toContain('REFUNDED');
    });

    it('should run at 3:00 AM by default', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.schedule).toBe('0 3 * * *');
    });

    it('should not delete archived orders by default', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.deleteAfterDays).toBe(0);
    });

    it('should not be in dry run mode by default', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.archiving.dryRun).toBe(false);
    });
  });

  // ============================================
  // Distributed Lock Configuration
  // ============================================
  describe('Distributed Lock Configuration', () => {
    it('should have 30 second TTL', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.distributedLock.ttlSeconds).toBe(30);
    });

    it('should retry 3 times', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.distributedLock.retryAttempts).toBe(3);
    });

    it('should have 100ms retry delay', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.distributedLock.retryDelayMs).toBe(100);
    });
  });

  // ============================================
  // Rate Limiting Configuration
  // ============================================
  describe('Rate Limiting Configuration', () => {
    it('should allow 10 order creations per minute', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.rateLimit.createOrderPerMinute).toBe(10);
    });

    it('should allow 20 reservations per minute', () => {
      const { orderConfig } = require('../../../src/config/order.config');
      expect(orderConfig.rateLimit.reserveOrderPerMinute).toBe(20);
    });
  });

  // ============================================
  // validateOrderConfig
  // ============================================
  describe('validateOrderConfig', () => {
    it('should pass with default configuration', () => {
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).not.toThrow();
    });

    it('should throw if platform fee is negative', () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '-5';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Platform fee percentage must be between 0 and 100');
    });

    it('should throw if platform fee exceeds 100', () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '150';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Platform fee percentage must be between 0 and 100');
    });

    it('should throw if processing fee is negative', () => {
      process.env.PROCESSING_FEE_PERCENTAGE = '-2';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Processing fee percentage must be between 0 and 100');
    });

    it('should throw if processing fee exceeds 100', () => {
      process.env.PROCESSING_FEE_PERCENTAGE = '110';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Processing fee percentage must be between 0 and 100');
    });

    it('should throw if tax rate is negative', () => {
      process.env.DEFAULT_TAX_RATE = '-8';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Tax rate must be between 0 and 100');
    });

    it('should throw if tax rate exceeds 100', () => {
      process.env.DEFAULT_TAX_RATE = '120';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Tax rate must be between 0 and 100');
    });

    it('should throw if max order value is not greater than min', () => {
      process.env.MAX_ORDER_VALUE_CENTS = '50';
      process.env.MIN_ORDER_VALUE_CENTS = '100';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Max order value must be greater than min order value');
    });

    it('should throw if max items per order is less than 1', () => {
      process.env.MAX_ITEMS_PER_ORDER = '0';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Max items per order must be at least 1');
    });

    it('should throw if reservation duration is less than 1', () => {
      process.env.RESERVATION_DURATION_MINUTES = '0';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow('Reservation duration must be at least 1 minute');
    });

    it('should allow zero fees', () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '0';
      process.env.PROCESSING_FEE_PERCENTAGE = '0';
      process.env.DEFAULT_TAX_RATE = '0';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).not.toThrow();
    });

    it('should collect multiple errors', () => {
      process.env.PLATFORM_FEE_PERCENTAGE = '-5';
      process.env.PROCESSING_FEE_PERCENTAGE = '-2';
      process.env.DEFAULT_TAX_RATE = '-1';
      jest.resetModules();
      const { validateOrderConfig } = require('../../../src/config/order.config');
      expect(() => validateOrderConfig()).toThrow(/Platform fee.*Processing fee.*Tax rate/s);
    });
  });
});
