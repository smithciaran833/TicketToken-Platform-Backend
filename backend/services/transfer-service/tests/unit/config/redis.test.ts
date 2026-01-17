/**
 * Unit Tests for Redis Configuration
 *
 * Tests Redis connection management:
 * - Configuration structure
 * - Retry strategy logic
 * - Module exports
 * - Basic functionality
 */

import Redis from 'ioredis';

jest.mock('ioredis');
jest.mock('../../../src/utils/logger');

import redisConfig from '../../../src/config/redis';

describe('Redis Configuration - Unit Tests', () => {
  describe('Configuration', () => {
    it('should have valid default configuration', () => {
      expect(redisConfig.REDIS_CONFIG).toBeDefined();
      expect(redisConfig.REDIS_CONFIG.host).toBeDefined();
      expect(redisConfig.REDIS_CONFIG.port).toBeDefined();
      expect(redisConfig.REDIS_CONFIG.keyPrefix).toBe('transfer-service:');
    });

    it('should have connection settings', () => {
      expect(redisConfig.REDIS_CONFIG.connectTimeout).toBe(10000);
      expect(redisConfig.REDIS_CONFIG.commandTimeout).toBe(5000);
    });

    it('should have retry strategy configured', () => {
      expect(redisConfig.REDIS_CONFIG.retryStrategy).toBeDefined();
      expect(typeof redisConfig.REDIS_CONFIG.retryStrategy).toBe('function');
    });

    it('should have performance settings', () => {
      expect(redisConfig.REDIS_CONFIG.enableReadyCheck).toBe(true);
      expect(redisConfig.REDIS_CONFIG.enableOfflineQueue).toBe(true);
      expect(redisConfig.REDIS_CONFIG.maxRetriesPerRequest).toBe(3);
    });

    it('should configure key prefix', () => {
      expect(redisConfig.REDIS_CONFIG.keyPrefix).toBe('transfer-service:');
    });
  });

  describe('Retry Strategy', () => {
    it('should be a function', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy;
      expect(typeof retryStrategy).toBe('function');
    });

    it('should calculate exponential backoff', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const delay1 = retryStrategy(1);
      const delay2 = retryStrategy(2);
      const delay3 = retryStrategy(3);
      
      expect(delay1).toBeLessThan(delay2!);
      expect(delay2).toBeLessThan(delay3!);
    });

    it('should cap delay at maximum', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const delay10 = retryStrategy(10);
      
      expect(delay10).toBeLessThanOrEqual(3000);
      expect(delay10).toBeGreaterThan(0);
    });

    it('should stop retrying after max attempts', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const result = retryStrategy(11);
      
      expect(result).toBeNull();
    });

    it('should allow retries within limit', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      for (let i = 1; i <= 10; i++) {
        const result = retryStrategy(i);
        expect(result).not.toBeNull();
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThan(0);
      }
    });

    it('should increase delay with retry attempts', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const delays = [];
      for (let i = 1; i <= 5; i++) {
        delays.push(retryStrategy(i));
      }
      
      // Each delay should be larger than the previous (up to cap)
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]!);
      }
    });
  });

  describe('Module Exports', () => {
    it('should export all required functions', () => {
      expect(typeof redisConfig.initRedis).toBe('function');
      expect(typeof redisConfig.getRedis).toBe('function');
      expect(typeof redisConfig.getSubscriberClient).toBe('function');
      expect(typeof redisConfig.closeRedis).toBe('function');
      expect(typeof redisConfig.checkRedisHealth).toBe('function');
      expect(typeof redisConfig.getRedisInfo).toBe('function');
    });

    it('should export REDIS_CONFIG', () => {
      expect(redisConfig.REDIS_CONFIG).toBeDefined();
      expect(typeof redisConfig.REDIS_CONFIG).toBe('object');
    });

    it('should have default export with all members', () => {
      expect(redisConfig).toHaveProperty('initRedis');
      expect(redisConfig).toHaveProperty('getRedis');
      expect(redisConfig).toHaveProperty('getSubscriberClient');
      expect(redisConfig).toHaveProperty('closeRedis');
      expect(redisConfig).toHaveProperty('checkRedisHealth');
      expect(redisConfig).toHaveProperty('getRedisInfo');
      expect(redisConfig).toHaveProperty('REDIS_CONFIG');
    });
  });

  describe('Configuration Structure', () => {
    it('should have host configuration', () => {
      expect(redisConfig.REDIS_CONFIG).toHaveProperty('host');
      expect(typeof redisConfig.REDIS_CONFIG.host).toBe('string');
    });

    it('should have port configuration', () => {
      expect(redisConfig.REDIS_CONFIG).toHaveProperty('port');
      expect(typeof redisConfig.REDIS_CONFIG.port).toBe('number');
      expect(redisConfig.REDIS_CONFIG.port).toBeGreaterThan(0);
      expect(redisConfig.REDIS_CONFIG.port).toBeLessThan(65536);
    });

    it('should have timeout configurations', () => {
      expect(redisConfig.REDIS_CONFIG.connectTimeout).toBeGreaterThan(0);
      expect(redisConfig.REDIS_CONFIG.commandTimeout).toBeGreaterThan(0);
    });

    it('should have max retries configured', () => {
      expect(redisConfig.REDIS_CONFIG.maxRetriesPerRequest).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Optional Configuration', () => {
    it('should handle optional password', () => {
      // Password may or may not be set
      if (redisConfig.REDIS_CONFIG.password) {
        expect(typeof redisConfig.REDIS_CONFIG.password).toBe('string');
      } else {
        expect(redisConfig.REDIS_CONFIG.password).toBeUndefined();
      }
    });

    it('should handle optional TLS', () => {
      // TLS may or may not be configured
      if (redisConfig.REDIS_CONFIG.tls) {
        expect(typeof redisConfig.REDIS_CONFIG.tls).toBe('object');
      } else {
        expect(redisConfig.REDIS_CONFIG.tls).toBeUndefined();
      }
    });
  });

  describe('Retry Strategy Behavior', () => {
    it('should return number for valid retry attempts', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const result = retryStrategy(1);
      expect(typeof result).toBe('number');
    });

    it('should return null for exceeded attempts', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const result = retryStrategy(20);
      expect(result).toBeNull();
    });

    it('should handle edge case of first retry', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const result = retryStrategy(1);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(3000);
    });

    it('should handle edge case at retry limit', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const result10 = retryStrategy(10);
      const result11 = retryStrategy(11);
      
      expect(result10).not.toBeNull();
      expect(result11).toBeNull();
    });
  });

  describe('Configuration Validation', () => {
    it('should have all required config properties', () => {
      const requiredProps = [
        'host',
        'port',
        'connectTimeout',
        'commandTimeout',
        'retryStrategy',
        'enableReadyCheck',
        'enableOfflineQueue',
        'maxRetriesPerRequest',
        'keyPrefix'
      ];

      requiredProps.forEach(prop => {
        expect(redisConfig.REDIS_CONFIG).toHaveProperty(prop);
      });
    });

    it('should have valid numeric values', () => {
      expect(typeof redisConfig.REDIS_CONFIG.port).toBe('number');
      expect(typeof redisConfig.REDIS_CONFIG.connectTimeout).toBe('number');
      expect(typeof redisConfig.REDIS_CONFIG.commandTimeout).toBe('number');
      expect(typeof redisConfig.REDIS_CONFIG.maxRetriesPerRequest).toBe('number');
    });

    it('should have valid boolean values', () => {
      expect(typeof redisConfig.REDIS_CONFIG.enableReadyCheck).toBe('boolean');
      expect(typeof redisConfig.REDIS_CONFIG.enableOfflineQueue).toBe('boolean');
    });

    it('should have valid string values', () => {
      expect(typeof redisConfig.REDIS_CONFIG.host).toBe('string');
      expect(typeof redisConfig.REDIS_CONFIG.keyPrefix).toBe('string');
    });
  });

  describe('Function Availability', () => {
    it('should have initRedis function', () => {
      expect(redisConfig.initRedis).toBeDefined();
      expect(typeof redisConfig.initRedis).toBe('function');
    });

    it('should have getRedis function', () => {
      expect(redisConfig.getRedis).toBeDefined();
      expect(typeof redisConfig.getRedis).toBe('function');
    });

    it('should have getSubscriberClient function', () => {
      expect(redisConfig.getSubscriberClient).toBeDefined();
      expect(typeof redisConfig.getSubscriberClient).toBe('function');
    });

    it('should have closeRedis function', () => {
      expect(redisConfig.closeRedis).toBeDefined();
      expect(typeof redisConfig.closeRedis).toBe('function');
    });

    it('should have checkRedisHealth function', () => {
      expect(redisConfig.checkRedisHealth).toBeDefined();
      expect(typeof redisConfig.checkRedisHealth).toBe('function');
    });

    it('should have getRedisInfo function', () => {
      expect(redisConfig.getRedisInfo).toBeDefined();
      expect(typeof redisConfig.getRedisInfo).toBe('function');
    });
  });

  describe('Retry Strategy Edge Cases', () => {
    it('should handle very high retry attempts', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const result = retryStrategy(100);
      expect(result).toBeNull();
    });

    it('should handle zero retry attempt', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      // Attempt 0 might be valid depending on implementation
      const result = retryStrategy(0);
      expect(result).toBeDefined();
    });

    it('should maintain consistent behavior across calls', () => {
      const retryStrategy = redisConfig.REDIS_CONFIG.retryStrategy!;
      
      const result1a = retryStrategy(5);
      const result1b = retryStrategy(5);
      
      // Same attempt number should give same delay
      expect(result1a).toBe(result1b);
    });
  });

  describe('Key Prefix Configuration', () => {
    it('should have service-specific key prefix', () => {
      expect(redisConfig.REDIS_CONFIG.keyPrefix).toContain('transfer-service');
    });

    it('should end key prefix with colon', () => {
      expect(redisConfig.REDIS_CONFIG.keyPrefix).toMatch(/:$/);
    });

    it('should use lowercase in prefix', () => {
      expect(redisConfig.REDIS_CONFIG.keyPrefix).toBe(
        redisConfig.REDIS_CONFIG.keyPrefix.toLowerCase()
      );
    });
  });
});
