describe('Config - Monitoring Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear module cache to allow fresh imports with new env vars
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  // Helper to get fresh module
  const getConfig = () => {
    return require('../../../src/config/monitoring.config').MONITORING_CONFIG;
  };

  describe('Structure validation', () => {
    it('should be defined', () => {
      const config = getConfig();
      expect(config).toBeDefined();
    });

    it('should have all required top-level properties', () => {
      const config = getConfig();
      expect(config).toHaveProperty('thresholds');
      expect(config).toHaveProperty('cooldowns');
      expect(config).toHaveProperty('intervals');
      expect(config).toHaveProperty('retention');
    });

    it('should have exactly 4 top-level properties', () => {
      const config = getConfig();
      expect(Object.keys(config)).toHaveLength(4);
    });

    it('should not be null or undefined', () => {
      const config = getConfig();
      expect(config).not.toBeNull();
      expect(config).not.toBeUndefined();
    });

    it('should be an object', () => {
      const config = getConfig();
      expect(typeof config).toBe('object');
      expect(Array.isArray(config)).toBe(false);
    });
  });

  describe('Thresholds configuration', () => {
    describe('Structure', () => {
      it('should have thresholds for all queue types', () => {
        const config = getConfig();
        expect(config.thresholds).toHaveProperty('money');
        expect(config.thresholds).toHaveProperty('communication');
        expect(config.thresholds).toHaveProperty('background');
      });

      it('should have exactly 3 queue type thresholds', () => {
        const config = getConfig();
        expect(Object.keys(config.thresholds)).toHaveLength(3);
      });

      it('should have all required properties for each queue type', () => {
        const config = getConfig();
        const queueTypes = ['money', 'communication', 'background'];
        
        queueTypes.forEach(type => {
          expect(config.thresholds[type]).toHaveProperty('queueDepth');
          expect(config.thresholds[type]).toHaveProperty('jobAgeMinutes');
          expect(config.thresholds[type]).toHaveProperty('failureCount');
        });
      });

      it('should have exactly 3 properties per queue type', () => {
        const config = getConfig();
        expect(Object.keys(config.thresholds.money)).toHaveLength(3);
        expect(Object.keys(config.thresholds.communication)).toHaveLength(3);
        expect(Object.keys(config.thresholds.background)).toHaveLength(3);
      });
    });

    describe('Money queue thresholds', () => {
      it('should have default queueDepth of 50', () => {
        delete process.env.ALERT_THRESHOLD_MONEY_QUEUE;
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBe(50);
      });

      it('should parse queueDepth from ALERT_THRESHOLD_MONEY_QUEUE env var', () => {
        process.env.ALERT_THRESHOLD_MONEY_QUEUE = '100';
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBe(100);
      });

      it('should have default jobAgeMinutes of 10', () => {
        delete process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES;
        const config = getConfig();
        expect(config.thresholds.money.jobAgeMinutes).toBe(10);
      });

      it('should parse jobAgeMinutes from ALERT_THRESHOLD_MONEY_AGE_MINUTES env var', () => {
        process.env.ALERT_THRESHOLD_MONEY_AGE_MINUTES = '15';
        const config = getConfig();
        expect(config.thresholds.money.jobAgeMinutes).toBe(15);
      });

      it('should have failureCount of 10', () => {
        const config = getConfig();
        expect(config.thresholds.money.failureCount).toBe(10);
      });

      it('should have all numeric values', () => {
        const config = getConfig();
        expect(typeof config.thresholds.money.queueDepth).toBe('number');
        expect(typeof config.thresholds.money.jobAgeMinutes).toBe('number');
        expect(typeof config.thresholds.money.failureCount).toBe('number');
      });

      it('should have all positive values', () => {
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBeGreaterThan(0);
        expect(config.thresholds.money.jobAgeMinutes).toBeGreaterThan(0);
        expect(config.thresholds.money.failureCount).toBeGreaterThan(0);
      });

      it('should handle invalid env var (NaN) for queueDepth', () => {
        process.env.ALERT_THRESHOLD_MONEY_QUEUE = 'invalid';
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBeNaN();
      });

      it('should use default when env var is empty string (|| operator treats as falsy)', () => {
        process.env.ALERT_THRESHOLD_MONEY_QUEUE = '';
        const config = getConfig();
        // Empty string is falsy, so || operator uses default '50'
        expect(config.thresholds.money.queueDepth).toBe(50);
      });

      it('should handle negative env var for queueDepth', () => {
        process.env.ALERT_THRESHOLD_MONEY_QUEUE = '-50';
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBe(-50);
      });

      it('should handle decimal env var for queueDepth (parseInt truncates)', () => {
        process.env.ALERT_THRESHOLD_MONEY_QUEUE = '50.9';
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBe(50);
      });

      it('should handle zero env var for queueDepth', () => {
        process.env.ALERT_THRESHOLD_MONEY_QUEUE = '0';
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBe(0);
      });

      it('should handle large numbers for queueDepth', () => {
        process.env.ALERT_THRESHOLD_MONEY_QUEUE = '999999';
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBe(999999);
      });
    });

    describe('Communication queue thresholds', () => {
      it('should have default queueDepth of 5000', () => {
        delete process.env.ALERT_THRESHOLD_COMM_QUEUE;
        const config = getConfig();
        expect(config.thresholds.communication.queueDepth).toBe(5000);
      });

      it('should parse queueDepth from ALERT_THRESHOLD_COMM_QUEUE env var', () => {
        process.env.ALERT_THRESHOLD_COMM_QUEUE = '10000';
        const config = getConfig();
        expect(config.thresholds.communication.queueDepth).toBe(10000);
      });

      it('should have hardcoded jobAgeMinutes of 30', () => {
        const config = getConfig();
        expect(config.thresholds.communication.jobAgeMinutes).toBe(30);
      });

      it('should have hardcoded failureCount of 100', () => {
        const config = getConfig();
        expect(config.thresholds.communication.failureCount).toBe(100);
      });

      it('should have all numeric values', () => {
        const config = getConfig();
        expect(typeof config.thresholds.communication.queueDepth).toBe('number');
        expect(typeof config.thresholds.communication.jobAgeMinutes).toBe('number');
        expect(typeof config.thresholds.communication.failureCount).toBe('number');
      });

      it('should have all positive values', () => {
        const config = getConfig();
        expect(config.thresholds.communication.queueDepth).toBeGreaterThan(0);
        expect(config.thresholds.communication.jobAgeMinutes).toBeGreaterThan(0);
        expect(config.thresholds.communication.failureCount).toBeGreaterThan(0);
      });
    });

    describe('Background queue thresholds', () => {
      it('should have default queueDepth of 50000', () => {
        delete process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE;
        const config = getConfig();
        expect(config.thresholds.background.queueDepth).toBe(50000);
      });

      it('should parse queueDepth from ALERT_THRESHOLD_BACKGROUND_QUEUE env var', () => {
        process.env.ALERT_THRESHOLD_BACKGROUND_QUEUE = '100000';
        const config = getConfig();
        expect(config.thresholds.background.queueDepth).toBe(100000);
      });

      it('should have hardcoded jobAgeMinutes of 120', () => {
        const config = getConfig();
        expect(config.thresholds.background.jobAgeMinutes).toBe(120);
      });

      it('should have hardcoded failureCount of 1000', () => {
        const config = getConfig();
        expect(config.thresholds.background.failureCount).toBe(1000);
      });

      it('should have all numeric values', () => {
        const config = getConfig();
        expect(typeof config.thresholds.background.queueDepth).toBe('number');
        expect(typeof config.thresholds.background.jobAgeMinutes).toBe('number');
        expect(typeof config.thresholds.background.failureCount).toBe('number');
      });

      it('should have all positive values', () => {
        const config = getConfig();
        expect(config.thresholds.background.queueDepth).toBeGreaterThan(0);
        expect(config.thresholds.background.jobAgeMinutes).toBeGreaterThan(0);
        expect(config.thresholds.background.failureCount).toBeGreaterThan(0);
      });
    });

    describe('Threshold ordering validation', () => {
      it('should have money queue as most strict (lowest queueDepth)', () => {
        const config = getConfig();
        expect(config.thresholds.money.queueDepth).toBeLessThan(config.thresholds.communication.queueDepth);
        expect(config.thresholds.money.queueDepth).toBeLessThan(config.thresholds.background.queueDepth);
      });

      it('should have background queue as least strict (highest queueDepth)', () => {
        const config = getConfig();
        expect(config.thresholds.background.queueDepth).toBeGreaterThan(config.thresholds.money.queueDepth);
        expect(config.thresholds.background.queueDepth).toBeGreaterThan(config.thresholds.communication.queueDepth);
      });

      it('should have money queue with shortest age tolerance', () => {
        const config = getConfig();
        expect(config.thresholds.money.jobAgeMinutes).toBeLessThan(config.thresholds.communication.jobAgeMinutes);
        expect(config.thresholds.money.jobAgeMinutes).toBeLessThan(config.thresholds.background.jobAgeMinutes);
      });

      it('should have background queue with longest age tolerance', () => {
        const config = getConfig();
        expect(config.thresholds.background.jobAgeMinutes).toBeGreaterThan(config.thresholds.money.jobAgeMinutes);
        expect(config.thresholds.background.jobAgeMinutes).toBeGreaterThan(config.thresholds.communication.jobAgeMinutes);
      });
    });
  });

  describe('Cooldowns configuration', () => {
    it('should have all required cooldown types', () => {
      const config = getConfig();
      expect(config.cooldowns).toHaveProperty('critical');
      expect(config.cooldowns).toHaveProperty('warning');
      expect(config.cooldowns).toHaveProperty('info');
    });

    it('should have exactly 3 cooldown types', () => {
      const config = getConfig();
      expect(Object.keys(config.cooldowns)).toHaveLength(3);
    });

    it('should have critical cooldown of 5 minutes (300000ms)', () => {
      const config = getConfig();
      expect(config.cooldowns.critical).toBe(300000);
      expect(config.cooldowns.critical).toBe(5 * 60 * 1000);
    });

    it('should have warning cooldown of 1 hour (3600000ms)', () => {
      const config = getConfig();
      expect(config.cooldowns.warning).toBe(3600000);
      expect(config.cooldowns.warning).toBe(60 * 60 * 1000);
    });

    it('should have info cooldown of 24 hours (86400000ms)', () => {
      const config = getConfig();
      expect(config.cooldowns.info).toBe(86400000);
      expect(config.cooldowns.info).toBe(24 * 60 * 60 * 1000);
    });

    it('should have all numeric values', () => {
      const config = getConfig();
      expect(typeof config.cooldowns.critical).toBe('number');
      expect(typeof config.cooldowns.warning).toBe('number');
      expect(typeof config.cooldowns.info).toBe('number');
    });

    it('should have all positive values', () => {
      const config = getConfig();
      expect(config.cooldowns.critical).toBeGreaterThan(0);
      expect(config.cooldowns.warning).toBeGreaterThan(0);
      expect(config.cooldowns.info).toBeGreaterThan(0);
    });

    it('should have cooldowns in ascending order (critical < warning < info)', () => {
      const config = getConfig();
      expect(config.cooldowns.critical).toBeLessThan(config.cooldowns.warning);
      expect(config.cooldowns.warning).toBeLessThan(config.cooldowns.info);
    });

    it('should have all integer values', () => {
      const config = getConfig();
      expect(Number.isInteger(config.cooldowns.critical)).toBe(true);
      expect(Number.isInteger(config.cooldowns.warning)).toBe(true);
      expect(Number.isInteger(config.cooldowns.info)).toBe(true);
    });
  });

  describe('Intervals configuration', () => {
    it('should have all required interval types', () => {
      const config = getConfig();
      expect(config.intervals).toHaveProperty('healthCheck');
      expect(config.intervals).toHaveProperty('metricCleanup');
    });

    it('should have exactly 2 interval types', () => {
      const config = getConfig();
      expect(Object.keys(config.intervals)).toHaveLength(2);
    });

    it('should have healthCheck interval of 30 seconds (30000ms)', () => {
      const config = getConfig();
      expect(config.intervals.healthCheck).toBe(30000);
    });

    it('should have metricCleanup interval of 1 hour (3600000ms)', () => {
      const config = getConfig();
      expect(config.intervals.metricCleanup).toBe(3600000);
    });

    it('should have all numeric values', () => {
      const config = getConfig();
      expect(typeof config.intervals.healthCheck).toBe('number');
      expect(typeof config.intervals.metricCleanup).toBe('number');
    });

    it('should have all positive values', () => {
      const config = getConfig();
      expect(config.intervals.healthCheck).toBeGreaterThan(0);
      expect(config.intervals.metricCleanup).toBeGreaterThan(0);
    });

    it('should have metricCleanup interval much larger than healthCheck', () => {
      const config = getConfig();
      expect(config.intervals.metricCleanup).toBeGreaterThan(config.intervals.healthCheck);
    });

    it('should have all integer values', () => {
      const config = getConfig();
      expect(Number.isInteger(config.intervals.healthCheck)).toBe(true);
      expect(Number.isInteger(config.intervals.metricCleanup)).toBe(true);
    });

    it('should have reasonable healthCheck interval (not too short or too long)', () => {
      const config = getConfig();
      expect(config.intervals.healthCheck).toBeGreaterThanOrEqual(1000); // At least 1 second
      expect(config.intervals.healthCheck).toBeLessThanOrEqual(300000); // At most 5 minutes
    });

    it('should have reasonable metricCleanup interval', () => {
      const config = getConfig();
      expect(config.intervals.metricCleanup).toBeGreaterThanOrEqual(60000); // At least 1 minute
      expect(config.intervals.metricCleanup).toBeLessThanOrEqual(86400000); // At most 24 hours
    });
  });

  describe('Retention configuration', () => {
    it('should have all required retention types', () => {
      const config = getConfig();
      expect(config.retention).toHaveProperty('metrics');
      expect(config.retention).toHaveProperty('alerts');
      expect(config.retention).toHaveProperty('jobHistory');
    });

    it('should have exactly 3 retention types', () => {
      const config = getConfig();
      expect(Object.keys(config.retention)).toHaveLength(3);
    });

    it('should have metrics retention of 30 days', () => {
      const config = getConfig();
      expect(config.retention.metrics).toBe(30);
    });

    it('should have alerts retention of 7 days', () => {
      const config = getConfig();
      expect(config.retention.alerts).toBe(7);
    });

    it('should have jobHistory retention of 90 days', () => {
      const config = getConfig();
      expect(config.retention.jobHistory).toBe(90);
    });

    it('should have all numeric values', () => {
      const config = getConfig();
      expect(typeof config.retention.metrics).toBe('number');
      expect(typeof config.retention.alerts).toBe('number');
      expect(typeof config.retention.jobHistory).toBe('number');
    });

    it('should have all positive values', () => {
      const config = getConfig();
      expect(config.retention.metrics).toBeGreaterThan(0);
      expect(config.retention.alerts).toBeGreaterThan(0);
      expect(config.retention.jobHistory).toBeGreaterThan(0);
    });

    it('should have all integer values', () => {
      const config = getConfig();
      expect(Number.isInteger(config.retention.metrics)).toBe(true);
      expect(Number.isInteger(config.retention.alerts)).toBe(true);
      expect(Number.isInteger(config.retention.jobHistory)).toBe(true);
    });

    it('should have jobHistory retention longest (most important data)', () => {
      const config = getConfig();
      expect(config.retention.jobHistory).toBeGreaterThan(config.retention.metrics);
      expect(config.retention.jobHistory).toBeGreaterThan(config.retention.alerts);
    });

    it('should have alerts retention shortest (least important data)', () => {
      const config = getConfig();
      expect(config.retention.alerts).toBeLessThan(config.retention.metrics);
      expect(config.retention.alerts).toBeLessThan(config.retention.jobHistory);
    });
  });

  describe('Cross-section validation', () => {
    it('should have consistent time units (milliseconds for cooldowns/intervals, days for retention)', () => {
      const config = getConfig();
      
      // Cooldowns and intervals should be in milliseconds (large numbers)
      expect(config.cooldowns.critical).toBeGreaterThan(1000);
      expect(config.intervals.healthCheck).toBeGreaterThan(1000);
      
      // Retention should be in days (smaller numbers)
      expect(config.retention.alerts).toBeLessThan(1000);
      expect(config.retention.metrics).toBeLessThan(1000);
    });

    it('should have realistic value relationships', () => {
      const config = getConfig();
      
      // Health check should be more frequent than metric cleanup
      expect(config.intervals.healthCheck).toBeLessThan(config.intervals.metricCleanup);
      
      // Critical alerts should cool down faster than warning alerts
      expect(config.cooldowns.critical).toBeLessThan(config.cooldowns.warning);
    });

    it('should export a single configuration object', () => {
      const module = require('../../../src/config/monitoring.config');
      expect(Object.keys(module)).toContain('MONITORING_CONFIG');
      expect(Object.keys(module)).toHaveLength(1);
    });
  });
});
