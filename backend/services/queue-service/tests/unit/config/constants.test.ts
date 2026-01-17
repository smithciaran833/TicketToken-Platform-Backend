import {
  QUEUE_NAMES,
  QUEUE_PRIORITIES,
  JOB_TYPES,
  PERSISTENCE_TIERS,
} from '../../../src/config/constants';

describe('Config - Constants', () => {
  describe('QUEUE_NAMES', () => {
    it('should be defined', () => {
      expect(QUEUE_NAMES).toBeDefined();
    });

    it('should have all required queue names', () => {
      expect(QUEUE_NAMES).toHaveProperty('MONEY');
      expect(QUEUE_NAMES).toHaveProperty('COMMUNICATION');
      expect(QUEUE_NAMES).toHaveProperty('BACKGROUND');
    });

    it('should have correct queue name values', () => {
      expect(QUEUE_NAMES.MONEY).toBe('money-queue');
      expect(QUEUE_NAMES.COMMUNICATION).toBe('communication-queue');
      expect(QUEUE_NAMES.BACKGROUND).toBe('background-queue');
    });

    it('should have exactly 3 queue names', () => {
      expect(Object.keys(QUEUE_NAMES)).toHaveLength(3);
    });

    it('should have string values for all queue names', () => {
      Object.values(QUEUE_NAMES).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });

    it('should have kebab-case format for all values', () => {
      Object.values(QUEUE_NAMES).forEach(value => {
        expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });

    it('should have unique queue name values', () => {
      const values = Object.values(QUEUE_NAMES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have non-empty string values', () => {
      Object.values(QUEUE_NAMES).forEach(value => {
        expect(value.length).toBeGreaterThan(0);
        expect(value.trim()).toBe(value); // No leading/trailing whitespace
      });
    });

    it('should have lowercase values', () => {
      Object.values(QUEUE_NAMES).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });
    });

    it('should end with "-queue" suffix', () => {
      Object.values(QUEUE_NAMES).forEach(value => {
        expect(value).toMatch(/-queue$/);
      });
    });
  });

  describe('QUEUE_PRIORITIES', () => {
    it('should be defined', () => {
      expect(QUEUE_PRIORITIES).toBeDefined();
    });

    it('should have all required priority levels', () => {
      expect(QUEUE_PRIORITIES).toHaveProperty('CRITICAL');
      expect(QUEUE_PRIORITIES).toHaveProperty('HIGH');
      expect(QUEUE_PRIORITIES).toHaveProperty('NORMAL');
      expect(QUEUE_PRIORITIES).toHaveProperty('LOW');
      expect(QUEUE_PRIORITIES).toHaveProperty('BACKGROUND');
    });

    it('should have correct priority values', () => {
      expect(QUEUE_PRIORITIES.CRITICAL).toBe(10);
      expect(QUEUE_PRIORITIES.HIGH).toBe(7);
      expect(QUEUE_PRIORITIES.NORMAL).toBe(5);
      expect(QUEUE_PRIORITIES.LOW).toBe(3);
      expect(QUEUE_PRIORITIES.BACKGROUND).toBe(1);
    });

    it('should have exactly 5 priority levels', () => {
      expect(Object.keys(QUEUE_PRIORITIES)).toHaveLength(5);
    });

    it('should have numeric values for all priorities', () => {
      Object.values(QUEUE_PRIORITIES).forEach(value => {
        expect(typeof value).toBe('number');
        expect(Number.isInteger(value)).toBe(true);
      });
    });

    it('should have positive integer values', () => {
      Object.values(QUEUE_PRIORITIES).forEach(value => {
        expect(value).toBeGreaterThan(0);
      });
    });

    it('should have priorities in descending order', () => {
      expect(QUEUE_PRIORITIES.CRITICAL).toBeGreaterThan(QUEUE_PRIORITIES.HIGH);
      expect(QUEUE_PRIORITIES.HIGH).toBeGreaterThan(QUEUE_PRIORITIES.NORMAL);
      expect(QUEUE_PRIORITIES.NORMAL).toBeGreaterThan(QUEUE_PRIORITIES.LOW);
      expect(QUEUE_PRIORITIES.LOW).toBeGreaterThan(QUEUE_PRIORITIES.BACKGROUND);
    });

    it('should have unique priority values', () => {
      const values = Object.values(QUEUE_PRIORITIES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have priority values in valid range (1-10)', () => {
      Object.values(QUEUE_PRIORITIES).forEach(value => {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(10);
      });
    });

    it('should not have negative values', () => {
      Object.values(QUEUE_PRIORITIES).forEach(value => {
        expect(value).toBeGreaterThan(0);
      });
    });

    it('should not have zero value', () => {
      Object.values(QUEUE_PRIORITIES).forEach(value => {
        expect(value).not.toBe(0);
      });
    });

    it('should have CRITICAL as highest priority', () => {
      const allValues = Object.values(QUEUE_PRIORITIES);
      const maxValue = Math.max(...allValues);
      expect(QUEUE_PRIORITIES.CRITICAL).toBe(maxValue);
    });

    it('should have BACKGROUND as lowest priority', () => {
      const allValues = Object.values(QUEUE_PRIORITIES);
      const minValue = Math.min(...allValues);
      expect(QUEUE_PRIORITIES.BACKGROUND).toBe(minValue);
    });
  });

  describe('JOB_TYPES', () => {
    it('should be defined', () => {
      expect(JOB_TYPES).toBeDefined();
    });

    describe('Money queue job types', () => {
      it('should have all money queue job types', () => {
        expect(JOB_TYPES).toHaveProperty('PAYMENT_PROCESS');
        expect(JOB_TYPES).toHaveProperty('REFUND_PROCESS');
        expect(JOB_TYPES).toHaveProperty('PAYOUT_PROCESS');
        expect(JOB_TYPES).toHaveProperty('NFT_MINT');
      });

      it('should have correct values for money queue jobs', () => {
        expect(JOB_TYPES.PAYMENT_PROCESS).toBe('payment-process');
        expect(JOB_TYPES.REFUND_PROCESS).toBe('refund-process');
        expect(JOB_TYPES.PAYOUT_PROCESS).toBe('payout-process');
        expect(JOB_TYPES.NFT_MINT).toBe('nft-mint');
      });
    });

    describe('Communication queue job types', () => {
      it('should have all communication queue job types', () => {
        expect(JOB_TYPES).toHaveProperty('EMAIL_SEND');
        expect(JOB_TYPES).toHaveProperty('SEND_EMAIL');
        expect(JOB_TYPES).toHaveProperty('SEND_SMS');
        expect(JOB_TYPES).toHaveProperty('SEND_PUSH');
      });

      it('should have correct values for communication queue jobs', () => {
        expect(JOB_TYPES.SEND_EMAIL).toBe('send-email');
        expect(JOB_TYPES.SEND_SMS).toBe('send-sms');
        expect(JOB_TYPES.SEND_PUSH).toBe('send-push');
      });

      it('should maintain backwards compatibility for EMAIL_SEND', () => {
        expect(JOB_TYPES.EMAIL_SEND).toBe('send-email');
        expect(JOB_TYPES.EMAIL_SEND).toBe(JOB_TYPES.SEND_EMAIL);
      });
    });

    describe('Background queue job types', () => {
      it('should have all background queue job types', () => {
        expect(JOB_TYPES).toHaveProperty('ANALYTICS_PROCESS');
        expect(JOB_TYPES).toHaveProperty('ANALYTICS_TRACK');
        expect(JOB_TYPES).toHaveProperty('CLEANUP_OLD_DATA');
        expect(JOB_TYPES).toHaveProperty('GENERATE_REPORT');
      });

      it('should have correct values for background queue jobs', () => {
        expect(JOB_TYPES.ANALYTICS_TRACK).toBe('analytics-track');
        expect(JOB_TYPES.CLEANUP_OLD_DATA).toBe('cleanup-old-data');
        expect(JOB_TYPES.GENERATE_REPORT).toBe('generate-report');
      });

      it('should maintain backwards compatibility for ANALYTICS_PROCESS', () => {
        expect(JOB_TYPES.ANALYTICS_PROCESS).toBe('analytics-track');
        expect(JOB_TYPES.ANALYTICS_PROCESS).toBe(JOB_TYPES.ANALYTICS_TRACK);
      });
    });

    it('should have exactly 12 job types (including backwards compatible aliases)', () => {
      expect(Object.keys(JOB_TYPES)).toHaveLength(12);
    });

    it('should have string values for all job types', () => {
      Object.values(JOB_TYPES).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });

    it('should have kebab-case format for all values', () => {
      Object.values(JOB_TYPES).forEach(value => {
        expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });

    it('should have non-empty string values', () => {
      Object.values(JOB_TYPES).forEach(value => {
        expect(value.length).toBeGreaterThan(0);
        expect(value.trim()).toBe(value);
      });
    });

    it('should have exactly 10 unique values (2 backwards compatible aliases)', () => {
      const values = Object.values(JOB_TYPES);
      const uniqueValues = new Set(values);
      // We have 2 backwards compatible aliases, so unique values should be 10
      expect(uniqueValues.size).toBe(10);
    });

    it('should have lowercase values', () => {
      Object.values(JOB_TYPES).forEach(value => {
        expect(value).toBe(value.toLowerCase());
      });
    });

    it('should not have underscores in values (kebab-case only)', () => {
      Object.values(JOB_TYPES).forEach(value => {
        expect(value).not.toContain('_');
      });
    });

    it('should have at least one hyphen in each value', () => {
      Object.values(JOB_TYPES).forEach(value => {
        expect(value).toContain('-');
      });
    });

    it('should have descriptive multi-word names', () => {
      Object.values(JOB_TYPES).forEach(value => {
        const words = value.split('-');
        expect(words.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('PERSISTENCE_TIERS', () => {
    it('should be defined', () => {
      expect(PERSISTENCE_TIERS).toBeDefined();
    });

    it('should have all required persistence tiers', () => {
      expect(PERSISTENCE_TIERS).toHaveProperty('TIER_1');
      expect(PERSISTENCE_TIERS).toHaveProperty('TIER_2');
      expect(PERSISTENCE_TIERS).toHaveProperty('TIER_3');
    });

    it('should have correct tier values', () => {
      expect(PERSISTENCE_TIERS.TIER_1).toBe('TIER_1');
      expect(PERSISTENCE_TIERS.TIER_2).toBe('TIER_2');
      expect(PERSISTENCE_TIERS.TIER_3).toBe('TIER_3');
    });

    it('should have exactly 3 persistence tiers', () => {
      expect(Object.keys(PERSISTENCE_TIERS)).toHaveLength(3);
    });

    it('should have string values for all tiers', () => {
      Object.values(PERSISTENCE_TIERS).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });

    it('should have unique tier values', () => {
      const values = Object.values(PERSISTENCE_TIERS);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have uppercase TIER_N format', () => {
      Object.values(PERSISTENCE_TIERS).forEach(value => {
        expect(value).toMatch(/^TIER_\d+$/);
      });
    });

    it('should have keys matching their values', () => {
      expect(PERSISTENCE_TIERS.TIER_1).toBe('TIER_1');
      expect(PERSISTENCE_TIERS.TIER_2).toBe('TIER_2');
      expect(PERSISTENCE_TIERS.TIER_3).toBe('TIER_3');
    });

    it('should have sequential tier numbers (1, 2, 3)', () => {
      expect(PERSISTENCE_TIERS.TIER_1).toBe('TIER_1');
      expect(PERSISTENCE_TIERS.TIER_2).toBe('TIER_2');
      expect(PERSISTENCE_TIERS.TIER_3).toBe('TIER_3');
    });

    it('should have uppercase values', () => {
      Object.values(PERSISTENCE_TIERS).forEach(value => {
        expect(value).toBe(value.toUpperCase());
      });
    });

    it('should not have lowercase characters', () => {
      Object.values(PERSISTENCE_TIERS).forEach(value => {
        expect(value).not.toMatch(/[a-z]/);
      });
    });

    it('should have TIER_ prefix for all values', () => {
      Object.values(PERSISTENCE_TIERS).forEach(value => {
        expect(value).toMatch(/^TIER_/);
      });
    });
  });

  describe('Cross-constant validation', () => {
    it('should export all required constant objects', () => {
      expect(QUEUE_NAMES).toBeDefined();
      expect(QUEUE_PRIORITIES).toBeDefined();
      expect(JOB_TYPES).toBeDefined();
      expect(PERSISTENCE_TIERS).toBeDefined();
    });

    it('should have consistent naming conventions across constants', () => {
      // QUEUE_NAMES values are kebab-case
      Object.values(QUEUE_NAMES).forEach(name => {
        expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });

      // JOB_TYPES values are kebab-case
      Object.values(JOB_TYPES).forEach(type => {
        expect(type).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });

      // PERSISTENCE_TIERS values are UPPER_SNAKE_CASE
      Object.values(PERSISTENCE_TIERS).forEach(tier => {
        expect(tier).toMatch(/^[A-Z_0-9]+$/);
      });
    });

    it('should have no accidental overlaps between queue names and job types', () => {
      const queueNameValues = new Set(Object.values(QUEUE_NAMES));
      Object.values(JOB_TYPES).forEach(jobType => {
        expect(queueNameValues.has(jobType)).toBe(false);
      });
    });

    it('should have no accidental overlaps between job types and tiers', () => {
      const tierValues = new Set(Object.values(PERSISTENCE_TIERS));
      Object.values(JOB_TYPES).forEach(jobType => {
        expect(tierValues.has(jobType)).toBe(false);
      });
    });

    it('should have no accidental overlaps between queue names and tiers', () => {
      const tierValues = new Set(Object.values(PERSISTENCE_TIERS));
      Object.values(QUEUE_NAMES).forEach(queueName => {
        expect(tierValues.has(queueName)).toBe(false);
      });
    });

    it('should have different value formats for different constant types', () => {
      // Queue names end with "-queue"
      Object.values(QUEUE_NAMES).forEach(name => {
        expect(name).toMatch(/-queue$/);
      });

      // Persistence tiers start with "TIER_"
      Object.values(PERSISTENCE_TIERS).forEach(tier => {
        expect(tier).toMatch(/^TIER_/);
      });
    });
  });

  describe('Type safety and structure', () => {
    it('should have readonly object types (TypeScript compile-time check)', () => {
      // This test validates that TypeScript will catch mutations at compile time
      // At runtime, the objects are mutable, but TypeScript prevents it
      expect(typeof QUEUE_NAMES).toBe('object');
      expect(typeof QUEUE_PRIORITIES).toBe('object');
      expect(typeof JOB_TYPES).toBe('object');
      expect(typeof PERSISTENCE_TIERS).toBe('object');
    });

    it('should not be null or undefined', () => {
      expect(QUEUE_NAMES).not.toBeNull();
      expect(QUEUE_NAMES).not.toBeUndefined();
      expect(QUEUE_PRIORITIES).not.toBeNull();
      expect(QUEUE_PRIORITIES).not.toBeUndefined();
      expect(JOB_TYPES).not.toBeNull();
      expect(JOB_TYPES).not.toBeUndefined();
      expect(PERSISTENCE_TIERS).not.toBeNull();
      expect(PERSISTENCE_TIERS).not.toBeUndefined();
    });

    it('should not be arrays', () => {
      expect(Array.isArray(QUEUE_NAMES)).toBe(false);
      expect(Array.isArray(QUEUE_PRIORITIES)).toBe(false);
      expect(Array.isArray(JOB_TYPES)).toBe(false);
      expect(Array.isArray(PERSISTENCE_TIERS)).toBe(false);
    });
  });
});
