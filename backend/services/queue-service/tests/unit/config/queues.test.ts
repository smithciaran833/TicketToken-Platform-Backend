import { QUEUE_CONFIGS } from '../../../src/config/queues.config';
import { QUEUE_NAMES, PERSISTENCE_TIERS } from '../../../src/config/constants';

describe('Queue Configuration', () => {
  describe('QUEUE_CONFIGS', () => {
    it('should have money queue config', () => {
      const config = QUEUE_CONFIGS.MONEY_QUEUE;
      
      expect(config).toBeDefined();
      expect(config.name).toBe(QUEUE_NAMES.MONEY);
      expect(config.persistenceTier).toBe(PERSISTENCE_TIERS.TIER_1);
    });

    it('should have communication queue config', () => {
      const config = QUEUE_CONFIGS.COMMUNICATION_QUEUE;
      
      expect(config).toBeDefined();
      expect(config.name).toBe(QUEUE_NAMES.COMMUNICATION);
      expect(config.persistenceTier).toBe(PERSISTENCE_TIERS.TIER_2);
    });

    it('should have background queue config', () => {
      const config = QUEUE_CONFIGS.BACKGROUND_QUEUE;
      
      expect(config).toBeDefined();
      expect(config.name).toBe(QUEUE_NAMES.BACKGROUND);
      expect(config.persistenceTier).toBe(PERSISTENCE_TIERS.TIER_3);
    });

    it('should have valid Redis configurations', () => {
      Object.values(QUEUE_CONFIGS).forEach(config => {
        expect(config.redis).toBeDefined();
        expect(config.redis.host).toBeDefined();
        expect(config.redis.port).toBeGreaterThan(0);
        expect(config.redis.db).toBeGreaterThanOrEqual(0);
        expect(config.redis.db).toBeLessThanOrEqual(15);
      });
    });

    it('should have job options', () => {
      Object.values(QUEUE_CONFIGS).forEach(config => {
        expect(config.defaultJobOptions).toBeDefined();
        expect(config.defaultJobOptions.attempts).toBeGreaterThan(0);
        expect(config.defaultJobOptions.backoff).toBeDefined();
      });
    });

    it('should have different Redis DBs per queue', () => {
      const moneyDb = QUEUE_CONFIGS.MONEY_QUEUE.redis.db;
      const commDb = QUEUE_CONFIGS.COMMUNICATION_QUEUE.redis.db;
      const bgDb = QUEUE_CONFIGS.BACKGROUND_QUEUE.redis.db;

      expect(moneyDb).not.toBe(commDb);
      expect(moneyDb).not.toBe(bgDb);
      expect(commDb).not.toBe(bgDb);
    });

    it('should have higher retry attempts for money queue', () => {
      const moneyAttempts = QUEUE_CONFIGS.MONEY_QUEUE.defaultJobOptions.attempts;
      const commAttempts = QUEUE_CONFIGS.COMMUNICATION_QUEUE.defaultJobOptions.attempts;
      const bgAttempts = QUEUE_CONFIGS.BACKGROUND_QUEUE.defaultJobOptions.attempts;

      expect(moneyAttempts).toBeGreaterThanOrEqual(commAttempts);
      expect(moneyAttempts).toBeGreaterThanOrEqual(bgAttempts);
    });
  });
});
