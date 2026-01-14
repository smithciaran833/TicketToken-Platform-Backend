import { REDIS_DATABASES } from '../../../src/config/redis-databases.config';

describe('RedisDatabase Configuration', () => {
  describe('REDIS_DATABASES', () => {
    it('should have all queue tier databases', () => {
      expect(REDIS_DATABASES.QUEUE_MONEY).toBeDefined();
      expect(REDIS_DATABASES.QUEUE_COMMUNICATION).toBeDefined();
      expect(REDIS_DATABASES.QUEUE_BACKGROUND).toBeDefined();
    });

    it('should have supporting service databases', () => {
      expect(REDIS_DATABASES.IDEMPOTENCY).toBeDefined();
      expect(REDIS_DATABASES.RATE_LIMITING).toBeDefined();
    });

    it('should have optional databases', () => {
      expect(REDIS_DATABASES.CACHE).toBeDefined();
      expect(REDIS_DATABASES.SESSIONS).toBeDefined();
    });

    it('should have valid database numbers (0-15)', () => {
      Object.values(REDIS_DATABASES).forEach(db => {
        expect(db).toBeGreaterThanOrEqual(0);
        expect(db).toBeLessThanOrEqual(15);
      });
    });

    it('should have different databases for critical tiers', () => {
      const money = REDIS_DATABASES.QUEUE_MONEY;
      const comm = REDIS_DATABASES.QUEUE_COMMUNICATION;
      const bg = REDIS_DATABASES.QUEUE_BACKGROUND;

      expect(money).not.toBe(comm);
      expect(money).not.toBe(bg);
      expect(comm).not.toBe(bg);
    });
  });
});
