import { config, timeoutConfig } from '../../../src/config/index';

describe('index.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('config object', () => {
    it('sets environment from NODE_ENV', () => {
      expect(config.environment).toBe('test');
    });

    it('uses default port when PORT not set', () => {
      delete process.env.PORT;
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.server.port).toBe(3000);
      expect(typeof freshConfig.server.port).toBe('number');
    });

    it('uses PORT env var when set', () => {
      process.env.PORT = '8080';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.server.port).toBe(8080);
    });

    it('uses default host when HOST not set', () => {
      delete process.env.HOST;
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.server.host).toBe('0.0.0.0');
    });

    it('parses REDIS_PORT as number', () => {
      expect(typeof config.redis.port).toBe('number');
      expect(config.redis.port).toBe(6379);
    });

    it('parses REDIS_DB as number', () => {
      expect(typeof config.redis.db).toBe('number');
      expect(config.redis.db).toBeGreaterThanOrEqual(0);
    });

    it('includes all service URLs', () => {
      expect(config.services.auth).toBeDefined();
      expect(config.services.venue).toBeDefined();
      expect(config.services.ticket).toBeDefined();
      expect(config.services.payment).toBeDefined();
      expect(config.services.event).toBeDefined();
      expect(config.services.marketplace).toBeDefined();
    });

    it('uses JWT_SECRET from env', () => {
      expect(config.jwt.secret).toBe('test-jwt-secret-key-for-testing');
    });

    it('falls back to JWT_SECRET for accessSecret when JWT_ACCESS_SECRET not set', () => {
      delete process.env.JWT_ACCESS_SECRET;
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.jwt.accessSecret).toBe(process.env.JWT_SECRET);
    });

    it('uses JWT_ACCESS_SECRET when set', () => {
      process.env.JWT_ACCESS_SECRET = 'custom-access-secret';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.jwt.accessSecret).toBe('custom-access-secret');
    });

    it('parses rate limit max as number', () => {
      expect(typeof config.rateLimit.global.max).toBe('number');
      expect(config.rateLimit.global.max).toBeGreaterThan(0);
    });

    it('parses rate limit time window as number', () => {
      expect(typeof config.rateLimit.global.timeWindow).toBe('number');
      expect(config.rateLimit.global.timeWindow).toBeGreaterThan(0);
    });

    it('enables rate limiting by default', () => {
      delete process.env.RATE_LIMIT_ENABLED;
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.rateLimit.enabled).toBe(true);
    });

    it('disables rate limiting when RATE_LIMIT_ENABLED=false', () => {
      process.env.RATE_LIMIT_ENABLED = 'false';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.rateLimit.enabled).toBe(false);
    });

    it('parses ALLOWED_ORIGINS as array', () => {
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:5173';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(Array.isArray(freshConfig.cors.origin)).toBe(true);
      expect(freshConfig.cors.origin).toContain('http://localhost:3000');
      expect(freshConfig.cors.origin).toContain('http://localhost:5173');
    });

    it('uses default CORS origins when ALLOWED_ORIGINS not set', () => {
      delete process.env.ALLOWED_ORIGINS;
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(Array.isArray(freshConfig.cors.origin)).toBe(true);
      expect(freshConfig.cors.origin.length).toBeGreaterThan(0);
    });

    it('enables CORS credentials', () => {
      expect(config.cors.credentials).toBe(true);
    });

    it('uses pretty logging in non-production', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.logging.pretty).toBe(true);
    });

    it('disables pretty logging in production', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.logging.pretty).toBe(false);
    });

    it('enables metrics by default', () => {
      delete process.env.ENABLE_METRICS;
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.monitoring.enableMetrics).toBe(true);
    });

    it('disables metrics when ENABLE_METRICS=false', () => {
      process.env.ENABLE_METRICS = 'false';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.monitoring.enableMetrics).toBe(false);
    });

    it('disables tracing by default', () => {
      delete process.env.ENABLE_TRACING;
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.monitoring.enableTracing).toBe(false);
    });

    it('enables tracing when ENABLE_TRACING=true', () => {
      process.env.ENABLE_TRACING = 'true';
      jest.resetModules();
      const { config: freshConfig } = require('../../../src/config/index');
      
      expect(freshConfig.monitoring.enableTracing).toBe(true);
    });

    it('parses all timeout values as numbers', () => {
      expect(typeof config.timeouts.default).toBe('number');
      expect(typeof config.timeouts.payment).toBe('number');
      expect(typeof config.timeouts.nftMinting).toBe('number');
    });

    it('parses all circuit breaker values as numbers', () => {
      expect(typeof config.circuitBreaker.timeout).toBe('number');
      expect(typeof config.circuitBreaker.errorThresholdPercentage).toBe('number');
      expect(typeof config.circuitBreaker.resetTimeout).toBe('number');
      expect(typeof config.circuitBreaker.volumeThreshold).toBe('number');
    });
  });

  describe('timeoutConfig object', () => {
    it('defines ticket-service config', () => {
      expect(timeoutConfig.services['ticket-service']).toBeDefined();
      expect(timeoutConfig.services['ticket-service'].default).toBe(10000);
    });

    it('defines nft-service config', () => {
      expect(timeoutConfig.services['nft-service']).toBeDefined();
      expect(timeoutConfig.services['nft-service'].default).toBe(60000);
    });

    it('defines payment-service config', () => {
      expect(timeoutConfig.services['payment-service']).toBeDefined();
      expect(timeoutConfig.services['payment-service'].default).toBe(30000);
    });

    it('defines ticket purchase endpoint timeout', () => {
      const ticketService = timeoutConfig.services['ticket-service'];
      expect(ticketService.endpoints['POST /tickets/purchase']).toBe(30000);
    });

    it('defines NFT mint endpoint timeout', () => {
      const nftService = timeoutConfig.services['nft-service'];
      expect(nftService.endpoints['POST /nft/mint']).toBe(120000);
    });

    it('defines payment process endpoint timeout', () => {
      const paymentService = timeoutConfig.services['payment-service'];
      expect(paymentService.endpoints['POST /payments/process']).toBe(45000);
    });

    it('all endpoint timeouts are numbers', () => {
      Object.values(timeoutConfig.services).forEach(service => {
        expect(typeof service.default).toBe('number');
        Object.values(service.endpoints).forEach(timeout => {
          expect(typeof timeout).toBe('number');
        });
      });
    });

    it('endpoint timeouts are greater than or equal to default', () => {
      const ticketService = timeoutConfig.services['ticket-service'];
      const purchaseTimeout = ticketService.endpoints['POST /tickets/purchase'];
      
      // Purchase endpoint should have longer timeout than default
      expect(purchaseTimeout).toBeGreaterThanOrEqual(ticketService.default);
    });
  });
});
