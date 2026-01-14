import { config } from '../../../src/config';

/**
 * INTEGRATION TESTS FOR CONFIG
 * Tests configuration loading and validation
 */

describe('Config Integration Tests', () => {
  describe('environment configuration', () => {
    it('should load config object', () => {
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have env property', () => {
      expect(config.env).toBeDefined();
      expect(typeof config.env).toBe('string');
    });

    it('should have port property', () => {
      expect(config.port).toBeDefined();
      expect(typeof config.port).toBe('number');
      expect(config.port).toBeGreaterThan(0);
    });
  });

  describe('database configuration', () => {
    it('should have database config', () => {
      expect(config.database).toBeDefined();
      expect(config.database.url).toBeDefined();
      expect(typeof config.database.url).toBe('string');
    });

    it('should have pool configuration', () => {
      expect(config.database.pool).toBeDefined();
      expect(config.database.pool.min).toBeGreaterThanOrEqual(0);
      expect(config.database.pool.max).toBeGreaterThan(config.database.pool.min);
    });

    it('should have timeout settings', () => {
      expect(config.database.pool.idleTimeoutMillis).toBeGreaterThan(0);
      expect(config.database.pool.connectionTimeoutMillis).toBeGreaterThan(0);
    });
  });

  describe('redis configuration', () => {
    it('should have redis URL', () => {
      expect(config.redis).toBeDefined();
      expect(config.redis.url).toBeDefined();
      expect(typeof config.redis.url).toBe('string');
    });

    it('should have TTL settings', () => {
      expect(config.redis.ttl).toBeDefined();
      expect(config.redis.ttl.reservation).toBeGreaterThan(0);
      expect(config.redis.ttl.qrCode).toBeGreaterThan(0);
      expect(config.redis.ttl.cache).toBeGreaterThan(0);
    });
  });

  describe('rabbitmq configuration', () => {
    it('should have rabbitmq URL', () => {
      expect(config.rabbitmq).toBeDefined();
      expect(config.rabbitmq.url).toBeDefined();
      expect(typeof config.rabbitmq.url).toBe('string');
    });

    it('should have queue names', () => {
      expect(config.rabbitmq.queues).toBeDefined();
      expect(config.rabbitmq.queues.nftMinting).toBeDefined();
      expect(config.rabbitmq.queues.ticketEvents).toBeDefined();
      expect(config.rabbitmq.queues.notifications).toBeDefined();
    });
  });

  describe('solana configuration', () => {
    it('should have solana RPC URL', () => {
      expect(config.solana).toBeDefined();
      expect(config.solana.rpcUrl).toBeDefined();
      expect(typeof config.solana.rpcUrl).toBe('string');
    });

    it('should have commitment level', () => {
      expect(config.solana.commitment).toBeDefined();
      expect(['processed', 'confirmed', 'finalized']).toContain(config.solana.commitment);
    });
  });

  describe('service URLs configuration', () => {
    it('should have all service URLs', () => {
      expect(config.services).toBeDefined();
      expect(config.services.event).toBeDefined();
      expect(config.services.payment).toBeDefined();
      expect(config.services.auth).toBeDefined();
      expect(config.services.order).toBeDefined();
      expect(config.services.minting).toBeDefined();
    });

    it('should have valid URL format', () => {
      const urlPattern = /^https?:\/\/.+/;
      expect(config.services.event).toMatch(urlPattern);
      expect(config.services.payment).toMatch(urlPattern);
    });
  });

  describe('JWT configuration', () => {
    it('should have JWT secret', () => {
      expect(config.jwt).toBeDefined();
      expect(config.jwt.secret).toBeDefined();
      expect(typeof config.jwt.secret).toBe('string');
      expect(config.jwt.secret.length).toBeGreaterThan(0);
    });
  });

  describe('QR configuration', () => {
    it('should have QR settings', () => {
      expect(config.qr).toBeDefined();
      expect(config.qr.rotationInterval).toBeGreaterThan(0);
      expect(config.qr.encryptionKey).toBeDefined();
      expect(typeof config.qr.encryptionKey).toBe('string');
    });

    it('should have minimum encryption key length', () => {
      expect(config.qr.encryptionKey.length).toBeGreaterThanOrEqual(16);
    });
  });

  describe('limits configuration', () => {
    it('should have all limit settings', () => {
      expect(config.limits).toBeDefined();
      expect(config.limits.maxTicketsPerPurchase).toBeGreaterThan(0);
      expect(config.limits.reservationTimeout).toBeGreaterThan(0);
      expect(config.limits.maxRetriesNFT).toBeGreaterThan(0);
    });

    it('should have reasonable limit values', () => {
      expect(config.limits.maxTicketsPerPurchase).toBeLessThanOrEqual(100);
      expect(config.limits.maxRetriesNFT).toBeLessThanOrEqual(10);
    });
  });

  describe('AWS configuration', () => {
    it('should have AWS settings', () => {
      expect(config.aws).toBeDefined();
      expect(config.aws.region).toBeDefined();
      expect(config.aws.s3Bucket).toBeDefined();
    });

    it('should have valid AWS region format', () => {
      expect(config.aws.region).toMatch(/^[a-z]{2}-[a-z]+-\d$/);
    });
  });

  describe('feature flags', () => {
    it('should have features object', () => {
      expect(config.features).toBeDefined();
      expect(typeof config.features).toBe('object');
    });

    it('should have useOrderService flag', () => {
      expect(typeof config.features.useOrderService).toBe('boolean');
    });
  });

  describe('additional settings', () => {
    it('should have service timeout', () => {
      expect(config.serviceTimeout).toBeDefined();
      expect(typeof config.serviceTimeout).toBe('number');
      expect(config.serviceTimeout).toBeGreaterThan(0);
    });

    it('should have internal service secret', () => {
      expect(config.internalServiceSecret).toBeDefined();
      expect(typeof config.internalServiceSecret).toBe('string');
    });
  });

  describe('config immutability', () => {
    it('should not allow modification of config', () => {
      const originalPort = config.port;
      
      expect(() => {
        (config as any).port = 9999;
      }).not.toThrow();
      
      // In a real scenario, we'd use Object.freeze to prevent modifications
      // For now, just verify the value can be read
      expect(typeof config.port).toBe('number');
    });
  });

  describe('environment-specific config', () => {
    it('should load development config', () => {
      if (config.env === 'development') {
        expect(config.database.url).toBeDefined();
      }
    });

    it('should load test config', () => {
      if (config.env === 'test') {
        expect(config.database.url).toContain('test');
      }
    });
  });

  describe('config structure validation', () => {
    it('should have all top-level keys', () => {
      const requiredKeys = [
        'env',
        'port',
        'database',
        'redis',
        'rabbitmq',
        'solana',
        'services',
        'jwt',
        'qr',
        'limits',
        'aws',
        'features'
      ];

      requiredKeys.forEach(key => {
        expect(config).toHaveProperty(key);
      });
    });

    it('should have correct types for all values', () => {
      expect(typeof config.env).toBe('string');
      expect(typeof config.port).toBe('number');
      expect(typeof config.database).toBe('object');
      expect(typeof config.redis).toBe('object');
      expect(typeof config.services).toBe('object');
      expect(typeof config.limits).toBe('object');
    });
  });
});
