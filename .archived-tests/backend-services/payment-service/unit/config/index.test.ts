// =============================================================================
// TEST SUITE: config/index
// =============================================================================

describe('config/index', () => {
  let config: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Server Configuration - 4 test cases
  // ===========================================================================

  describe('Server Configuration', () => {
    it('should use default port 3003', () => {
      delete process.env.PORT;
      config = require('../../../src/config/index').config;

      expect(config.server.port).toBe(3003);
    });

    it('should use PORT env var when provided', () => {
      process.env.PORT = '4000';
      config = require('../../../src/config/index').config;

      expect(config.server.port).toBe(4000);
    });

    it('should use default environment as development', () => {
      delete process.env.NODE_ENV;
      config = require('../../../src/config/index').config;

      expect(config.server.env).toBe('development');
    });

    it('should use NODE_ENV when provided', () => {
      process.env.NODE_ENV = 'production';
      config = require('../../../src/config/index').config;

      expect(config.server.env).toBe('production');
    });
  });

  // ===========================================================================
  // Database Configuration - 5 test cases
  // ===========================================================================

  describe('Database Configuration', () => {
    it('should use default database host', () => {
      delete process.env.DB_HOST;
      config = require('../../../src/config/index').config;

      expect(config.database.host).toBe('localhost');
    });

    it('should use default database port 5432', () => {
      delete process.env.DB_PORT;
      config = require('../../../src/config/index').config;

      expect(config.database.port).toBe(5432);
    });

    it('should use default database name', () => {
      delete process.env.DB_NAME;
      config = require('../../../src/config/index').config;

      expect(config.database.name).toBe('tickettoken');
    });

    it('should use default database user', () => {
      delete process.env.DB_USER;
      config = require('../../../src/config/index').config;

      expect(config.database.user).toBe('tickettoken_user');
    });

    it('should use environment variables when provided', () => {
      process.env.DB_HOST = 'custom-host';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'custom_db';
      config = require('../../../src/config/index').config;

      expect(config.database.host).toBe('custom-host');
      expect(config.database.port).toBe(5433);
      expect(config.database.name).toBe('custom_db');
    });
  });

  // ===========================================================================
  // Redis Configuration - 3 test cases
  // ===========================================================================

  describe('Redis Configuration', () => {
    it('should use default redis host', () => {
      delete process.env.REDIS_HOST;
      config = require('../../../src/config/index').config;

      expect(config.redis.host).toBe('redis');
    });

    it('should use default redis port 6379', () => {
      delete process.env.REDIS_PORT;
      config = require('../../../src/config/index').config;

      expect(config.redis.port).toBe(6379);
    });

    it('should use environment variables when provided', () => {
      process.env.REDIS_HOST = 'custom-redis';
      process.env.REDIS_PORT = '6380';
      config = require('../../../src/config/index').config;

      expect(config.redis.host).toBe('custom-redis');
      expect(config.redis.port).toBe(6380);
    });
  });

  // ===========================================================================
  // Payment Provider Configuration - 3 test cases
  // ===========================================================================

  describe('Payment Provider Configuration', () => {
    it('should have stripe configuration', () => {
      config = require('../../../src/config/index').config;

      expect(config.stripe).toHaveProperty('secretKey');
      expect(config.stripe).toHaveProperty('publishableKey');
      expect(config.stripe).toHaveProperty('webhookSecret');
    });

    it('should have paypal configuration with sandbox mode', () => {
      delete process.env.PAYPAL_MODE;
      config = require('../../../src/config/index').config;

      expect(config.paypal).toHaveProperty('clientId');
      expect(config.paypal).toHaveProperty('clientSecret');
      expect(config.paypal.mode).toBe('sandbox');
    });

    it('should have square configuration with sandbox environment', () => {
      delete process.env.SQUARE_ENVIRONMENT;
      config = require('../../../src/config/index').config;

      expect(config.square).toHaveProperty('accessToken');
      expect(config.square.environment).toBe('sandbox');
    });
  });

  // ===========================================================================
  // Third Party Services - 3 test cases
  // ===========================================================================

  describe('Third Party Services', () => {
    it('should have plaid configuration', () => {
      delete process.env.PLAID_ENV;
      config = require('../../../src/config/index').config;

      expect(config.plaid).toHaveProperty('clientId');
      expect(config.plaid).toHaveProperty('secret');
      expect(config.plaid.env).toBe('sandbox');
    });

    it('should have taxjar configuration', () => {
      config = require('../../../src/config/index').config;

      expect(config.taxJar).toHaveProperty('apiKey');
    });

    it('should have blockchain configuration', () => {
      config = require('../../../src/config/index').config;

      expect(config.blockchain).toHaveProperty('solanaRpcUrl');
      expect(config.blockchain).toHaveProperty('polygonRpcUrl');
      expect(config.blockchain.solanaRpcUrl).toBe('https://api.devnet.solana.com');
    });
  });

  // ===========================================================================
  // Service URLs - 3 test cases
  // ===========================================================================

  describe('Service URLs', () => {
    it('should have default service URLs', () => {
      config = require('../../../src/config/index').config;

      expect(config.services.authUrl).toBe('http://auth-service:3001');
      expect(config.services.eventUrl).toBe('http://event-service:3003');
      expect(config.services.ticketUrl).toBe('http://ticket-service:3004');
    });

    it('should have venue and payment service URLs', () => {
      config = require('../../../src/config/index').config;

      expect(config.services.venueUrl).toBe('http://venue-service:3002');
      expect(config.services.paymentUrl).toBe('http://payment-service:3006');
    });

    it('should have marketplace service URL', () => {
      config = require('../../../src/config/index').config;

      expect(config.services.marketplaceUrl).toBe('http://marketplace-service:3008');
    });
  });

  // ===========================================================================
  // JWT Configuration - 2 test cases
  // ===========================================================================

  describe('JWT Configuration', () => {
    it('should have default JWT secret', () => {
      delete process.env.JWT_SECRET;
      config = require('../../../src/config/index').config;

      expect(config.jwt.secret).toBe('your-secret-key');
    });

    it('should use JWT_SECRET env var when provided', () => {
      process.env.JWT_SECRET = 'custom-secret';
      config = require('../../../src/config/index').config;

      expect(config.jwt.secret).toBe('custom-secret');
    });
  });
});
