/**
 * Unit Tests for src/config/index.ts
 */

describe('config/index', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set minimum required env vars
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-64-characters-long-for-testing-purposes';
    process.env.QR_ENCRYPTION_KEY = '12345678901234567890123456789012';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-that-is-at-least-64-characters-long-testing';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('config object', () => {
    it('exports config with expected shape', () => {
      const { config } = require('../../../src/config/index');

      expect(config).toHaveProperty('env');
      expect(config).toHaveProperty('port');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('jwt');
      expect(config).toHaveProperty('qr');
      expect(config).toHaveProperty('services');
      expect(config).toHaveProperty('limits');
      expect(config).toHaveProperty('features');
      expect(config).toHaveProperty('rateLimit');
      expect(config).toHaveProperty('proxy');
    });

    it('uses default port 3004', () => {
      delete process.env.PORT;
      const { config } = require('../../../src/config/index');
      expect(config.port).toBe(3004);
    });

    it('parses PORT from env', () => {
      process.env.PORT = '4000';
      const { config } = require('../../../src/config/index');
      expect(config.port).toBe(4000);
    });

    it('uses NODE_ENV from environment', () => {
      process.env.NODE_ENV = 'test';
      const { config } = require('../../../src/config/index');
      expect(config.env).toBe('test');
    });
  });

  describe('database config', () => {
    it('has pool configuration', () => {
      const { config } = require('../../../src/config/index');

      expect(config.database.pool).toHaveProperty('min');
      expect(config.database.pool).toHaveProperty('max');
      expect(config.database.pool).toHaveProperty('idleTimeoutMillis');
      expect(config.database.pool).toHaveProperty('connectionTimeoutMillis');
    });

    it('has timeout configurations', () => {
      const { config } = require('../../../src/config/index');

      expect(config.database.statementTimeout).toBeDefined();
      expect(config.database.lockTimeout).toBeDefined();
    });
  });

  describe('redis config', () => {
    it('has TTL configurations', () => {
      const { config } = require('../../../src/config/index');

      expect(config.redis.ttl).toHaveProperty('reservation');
      expect(config.redis.ttl).toHaveProperty('qrCode');
      expect(config.redis.ttl).toHaveProperty('cache');
    });
  });

  describe('jwt config', () => {
    it('requires JWT_SECRET', () => {
      const { config } = require('../../../src/config/index');
      expect(config.jwt.secret).toBeDefined();
    });

    it('has issuer and audience', () => {
      const { config } = require('../../../src/config/index');

      expect(config.jwt.issuer).toBeDefined();
      expect(config.jwt.audience).toBeDefined();
    });
  });

  describe('limits config', () => {
    it('has business logic limits', () => {
      const { config } = require('../../../src/config/index');

      expect(config.limits.maxTicketsPerPurchase).toBeGreaterThan(0);
      expect(config.limits.reservationTimeout).toBeGreaterThan(0);
      expect(config.limits.maxRetriesNFT).toBeGreaterThan(0);
    });
  });

  describe('features config', () => {
    it('has feature flags', () => {
      const { config } = require('../../../src/config/index');

      expect(typeof config.features.useOrderService).toBe('boolean');
      expect(typeof config.features.enableBlockchainSync).toBe('boolean');
      expect(typeof config.features.enableMetrics).toBe('boolean');
      expect(typeof config.features.enableTracing).toBe('boolean');
    });
  });

  describe('rateLimit config', () => {
    it('has rate limiting configuration', () => {
      const { config } = require('../../../src/config/index');

      expect(typeof config.rateLimit.enabled).toBe('boolean');
      expect(config.rateLimit.windowMs).toBeGreaterThan(0);
      expect(config.rateLimit.max).toBeGreaterThan(0);
    });
  });

  describe('proxy config', () => {
    it('has trusted proxies configuration', () => {
      const { config } = require('../../../src/config/index');

      expect(Array.isArray(config.proxy.trustedProxies)).toBe(true);
      expect(config.proxy.maxHops).toBeGreaterThan(0);
    });
  });

  describe('services config', () => {
    it('has service URLs', () => {
      const { config } = require('../../../src/config/index');

      expect(config.services).toHaveProperty('event');
      expect(config.services).toHaveProperty('payment');
      expect(config.services).toHaveProperty('auth');
      expect(config.services).toHaveProperty('order');
    });
  });
});
