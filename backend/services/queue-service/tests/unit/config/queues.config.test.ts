describe('Config - Queues Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const getModule = () => {
    return require('../../../src/config/queues.config');
  };

  describe('QUEUE_CONFIGS structure', () => {
    it('should be defined', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS).toBeDefined();
    });

    it('should have all required queue configurations', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS).toHaveProperty('MONEY_QUEUE');
      expect(QUEUE_CONFIGS).toHaveProperty('COMMUNICATION_QUEUE');
      expect(QUEUE_CONFIGS).toHaveProperty('BACKGROUND_QUEUE');
    });

    it('should have exactly 3 queue configurations', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(Object.keys(QUEUE_CONFIGS)).toHaveLength(3);
    });

    it('should have all required properties for each queue', () => {
      const { QUEUE_CONFIGS } = getModule();
      Object.values(QUEUE_CONFIGS).forEach((config: any) => {
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('persistenceTier');
        expect(config).toHaveProperty('retryLimit');
        expect(config).toHaveProperty('retryDelay');
        expect(config).toHaveProperty('retryBackoff');
        expect(config).toHaveProperty('expireInSeconds');
      });
    });

    it('should have exactly 6 properties per queue', () => {
      const { QUEUE_CONFIGS } = getModule();
      Object.values(QUEUE_CONFIGS).forEach((config: any) => {
        expect(Object.keys(config)).toHaveLength(6);
      });
    });
  });

  describe('MONEY_QUEUE configuration', () => {
    it('should have correct name from constants', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.name).toBe('money-queue');
    });

    it('should use TIER_1 persistence', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.persistenceTier).toBe('TIER_1');
    });

    it('should have default retryLimit of 10', () => {
      delete process.env.RETRY_PAYMENT;
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryLimit).toBe(10);
    });

    it('should parse retryLimit from RETRY_PAYMENT env var', () => {
      process.env.RETRY_PAYMENT = '15';
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryLimit).toBe(15);
    });

    it('should have retryDelay of 2000ms', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryDelay).toBe(2000);
    });

    it('should have exponential backoff enabled', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryBackoff).toBe(true);
    });

    it('should expire after 24 hours', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.expireInSeconds).toBe(86400);
      expect(QUEUE_CONFIGS.MONEY_QUEUE.expireInSeconds).toBe(3600 * 24);
    });

    it('should have all numeric values for numeric fields', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(typeof QUEUE_CONFIGS.MONEY_QUEUE.retryLimit).toBe('number');
      expect(typeof QUEUE_CONFIGS.MONEY_QUEUE.retryDelay).toBe('number');
      expect(typeof QUEUE_CONFIGS.MONEY_QUEUE.expireInSeconds).toBe('number');
    });

    it('should have boolean retryBackoff', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(typeof QUEUE_CONFIGS.MONEY_QUEUE.retryBackoff).toBe('boolean');
    });
  });

  describe('COMMUNICATION_QUEUE configuration', () => {
    it('should have correct name from constants', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.name).toBe('communication-queue');
    });

    it('should use TIER_2 persistence', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.persistenceTier).toBe('TIER_2');
    });

    it('should have default retryLimit of 5', () => {
      delete process.env.RETRY_EMAIL;
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryLimit).toBe(5);
    });

    it('should parse retryLimit from RETRY_EMAIL env var', () => {
      process.env.RETRY_EMAIL = '8';
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryLimit).toBe(8);
    });

    it('should have retryDelay of 5000ms', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryDelay).toBe(5000);
    });

    it('should have exponential backoff disabled (fixed delay)', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryBackoff).toBe(false);
    });

    it('should expire after 12 hours', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.expireInSeconds).toBe(43200);
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.expireInSeconds).toBe(3600 * 12);
    });
  });

  describe('BACKGROUND_QUEUE configuration', () => {
    it('should have correct name from constants', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.name).toBe('background-queue');
    });

    it('should use TIER_3 persistence', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.persistenceTier).toBe('TIER_3');
    });

    it('should have default retryLimit of 2', () => {
      delete process.env.RETRY_ANALYTICS;
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.retryLimit).toBe(2);
    });

    it('should parse retryLimit from RETRY_ANALYTICS env var', () => {
      process.env.RETRY_ANALYTICS = '3';
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.retryLimit).toBe(3);
    });

    it('should have retryDelay of 10000ms', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.retryDelay).toBe(10000);
    });

    it('should have exponential backoff disabled (fixed delay)', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.retryBackoff).toBe(false);
    });

    it('should expire after 6 hours', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.expireInSeconds).toBe(21600);
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.expireInSeconds).toBe(3600 * 6);
    });
  });

  describe('Queue ordering and patterns', () => {
    it('should have decreasing persistence tiers by priority (TIER_1 > TIER_2 > TIER_3)', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.persistenceTier).toBe('TIER_1');
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.persistenceTier).toBe('TIER_2');
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.persistenceTier).toBe('TIER_3');
    });

    it('should have decreasing retry limits by priority', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryLimit).toBeGreaterThan(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryLimit);
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryLimit).toBeGreaterThan(QUEUE_CONFIGS.BACKGROUND_QUEUE.retryLimit);
    });

    it('should have increasing retry delays by priority (money fastest)', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryDelay).toBeLessThan(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryDelay);
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryDelay).toBeLessThan(QUEUE_CONFIGS.BACKGROUND_QUEUE.retryDelay);
    });

    it('should have decreasing expiration times by priority', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.expireInSeconds).toBeGreaterThan(QUEUE_CONFIGS.COMMUNICATION_QUEUE.expireInSeconds);
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.expireInSeconds).toBeGreaterThan(QUEUE_CONFIGS.BACKGROUND_QUEUE.expireInSeconds);
    });

    it('should use exponential backoff only for money queue', () => {
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryBackoff).toBe(true);
      expect(QUEUE_CONFIGS.COMMUNICATION_QUEUE.retryBackoff).toBe(false);
      expect(QUEUE_CONFIGS.BACKGROUND_QUEUE.retryBackoff).toBe(false);
    });

    it('should have all positive retry delays', () => {
      const { QUEUE_CONFIGS } = getModule();
      Object.values(QUEUE_CONFIGS).forEach((config: any) => {
        expect(config.retryDelay).toBeGreaterThan(0);
      });
    });

    it('should have all positive expiration times', () => {
      const { QUEUE_CONFIGS } = getModule();
      Object.values(QUEUE_CONFIGS).forEach((config: any) => {
        expect(config.expireInSeconds).toBeGreaterThan(0);
      });
    });
  });

  describe('PG_BOSS_CONFIG', () => {
    it('should be defined', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG).toBeDefined();
    });

    it('should have all required properties', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG).toHaveProperty('connectionString');
      expect(PG_BOSS_CONFIG).toHaveProperty('schema');
      expect(PG_BOSS_CONFIG).toHaveProperty('noSupervisor');
      expect(PG_BOSS_CONFIG).toHaveProperty('noScheduling');
      expect(PG_BOSS_CONFIG).toHaveProperty('deleteAfterDays');
      expect(PG_BOSS_CONFIG).toHaveProperty('retentionDays');
      expect(PG_BOSS_CONFIG).toHaveProperty('monitorStateIntervalSeconds');
      expect(PG_BOSS_CONFIG).toHaveProperty('archiveCompletedAfterSeconds');
    });

    it('should use DATABASE_URL for connection', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost/testdb';
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.connectionString).toBe('postgresql://test:test@localhost/testdb');
    });

    it('should use pgboss schema', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.schema).toBe('pgboss');
    });

    it('should have supervisor enabled', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.noSupervisor).toBe(false);
    });

    it('should have scheduling enabled', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.noScheduling).toBe(false);
    });

    it('should delete after 7 days', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.deleteAfterDays).toBe(7);
    });

    it('should retain for 30 days', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.retentionDays).toBe(30);
    });

    it('should monitor state every 60 seconds', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.monitorStateIntervalSeconds).toBe(60);
    });

    it('should archive after 24 hours', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.archiveCompletedAfterSeconds).toBe(86400);
      expect(PG_BOSS_CONFIG.archiveCompletedAfterSeconds).toBe(3600 * 24);
    });

    it('should have numeric values for all numeric fields', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(typeof PG_BOSS_CONFIG.deleteAfterDays).toBe('number');
      expect(typeof PG_BOSS_CONFIG.retentionDays).toBe('number');
      expect(typeof PG_BOSS_CONFIG.monitorStateIntervalSeconds).toBe('number');
      expect(typeof PG_BOSS_CONFIG.archiveCompletedAfterSeconds).toBe('number');
    });

    it('should have boolean values for flags', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(typeof PG_BOSS_CONFIG.noSupervisor).toBe('boolean');
      expect(typeof PG_BOSS_CONFIG.noScheduling).toBe('boolean');
    });

    it('should have retentionDays greater than deleteAfterDays', () => {
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.retentionDays).toBeGreaterThan(PG_BOSS_CONFIG.deleteAfterDays);
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle invalid RETRY_PAYMENT env var', () => {
      process.env.RETRY_PAYMENT = 'invalid';
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryLimit).toBeNaN();
    });

    it('should handle negative retry values', () => {
      process.env.RETRY_PAYMENT = '-5';
      const { QUEUE_CONFIGS } = getModule();
      expect(QUEUE_CONFIGS.MONEY_QUEUE.retryLimit).toBe(-5);
    });

    it('should handle undefined DATABASE_URL', () => {
      delete process.env.DATABASE_URL;
      const { PG_BOSS_CONFIG } = getModule();
      expect(PG_BOSS_CONFIG.connectionString).toBeUndefined();
    });
  });
});
