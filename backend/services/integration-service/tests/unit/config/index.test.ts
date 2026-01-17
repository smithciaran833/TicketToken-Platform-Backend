/**
 * Tests for Configuration Module
 */

describe('Config Module', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let config: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear module cache to allow fresh imports
    jest.resetModules();

    // Set base test environment
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-32-chars';
    process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-32-characters';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      config = require('../../../src/config/index');
      
      const result = config.validateConfig();

      expect(result).toBeDefined();
      expect(result.NODE_ENV).toBe('test');
      expect(result.DB_HOST).toBe('localhost');
      expect(result.DB_NAME).toBe('test_db');
    });

    it('should use default values when not provided', () => {
      config = require('../../../src/config/index');
      
      const result = config.validateConfig();

      expect(result.PORT).toBe(3012);
      expect(result.HOST).toBe('0.0.0.0');
      expect(result.SERVICE_NAME).toBe('integration-service');
      expect(result.DB_POOL_MIN).toBe(2);
      expect(result.DB_POOL_MAX).toBe(10);
      expect(result.REDIS_PORT).toBe(6379);
      // LOG_LEVEL is set to 'error' in test setup, so we check it's defined
      expect(result.LOG_LEVEL).toBeDefined();
    });

    it('should fail when required fields are missing', () => {
      delete process.env.DB_HOST;
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should coerce numeric string values', () => {
      process.env.PORT = '4000';
      process.env.DB_PORT = '5433';
      process.env.REDIS_PORT = '6380';

      config = require('../../../src/config/index');
      const result = config.validateConfig();

      expect(result.PORT).toBe(4000);
      expect(result.DB_PORT).toBe(5433);
      expect(result.REDIS_PORT).toBe(6380);
    });

    it('should validate port ranges', () => {
      process.env.PORT = '70000'; // Invalid port
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should validate enum values', () => {
      process.env.NODE_ENV = 'invalid-env' as any;
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should cache validated config on subsequent calls', () => {
      config = require('../../../src/config/index');
      
      const first = config.validateConfig();
      const second = config.validateConfig();

      expect(first).toBe(second); // Same reference
    });
  });

  describe('validateProductionRequirements', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.API_URL = 'https://api.example.com';
      process.env.CORS_ORIGIN = 'https://app.example.com';
      process.env.DB_SSL = 'require';
      process.env.SECRETS_PROVIDER = 'aws';
      process.env.AWS_REGION = 'us-east-1';
    });

    it('should pass validation with all production requirements', () => {
      config = require('../../../src/config/index');
      
      const result = config.validateConfig();

      expect(result.NODE_ENV).toBe('production');
    });

    it('should fail when JWT_SECRET missing in production', () => {
      delete process.env.JWT_SECRET;
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('JWT_SECRET is required in production')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should fail when INTERNAL_SERVICE_SECRET missing in production', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('INTERNAL_SERVICE_SECRET is required in production')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should fail when SECRETS_PROVIDER is env in production', () => {
      process.env.SECRETS_PROVIDER = 'env';
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECRETS_PROVIDER must be "aws" or "vault" in production')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should fail when DB_SSL disabled in production', () => {
      process.env.DB_SSL = 'false';
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DB_SSL must be enabled in production')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should fail when ENCRYPTION_KEY missing in production', () => {
      delete process.env.ENCRYPTION_KEY;
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ENCRYPTION_KEY is required in production')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should fail when CORS_ORIGIN is wildcard in production', () => {
      process.env.CORS_ORIGIN = '*';
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CORS_ORIGIN must not be "*" in production')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should fail when API_URL missing in production', () => {
      delete process.env.API_URL;
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
        config.validateConfig();
      }).toThrow('Process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('API_URL is required in production')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getConfig', () => {
    it('should return validated config', () => {
      config = require('../../../src/config/index');
      
      const result = config.getConfig();

      expect(result).toBeDefined();
      expect(result.NODE_ENV).toBe('test');
    });

    it('should call validateConfig if not already validated', () => {
      config = require('../../../src/config/index');
      
      const result = config.getConfig();

      expect(result).toBeDefined();
    });
  });

  describe('Environment Helper Functions', () => {
    it('isProduction should return true in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_URL = 'https://api.example.com';
      process.env.CORS_ORIGIN = 'https://app.example.com';
      process.env.DB_SSL = 'require';
      process.env.SECRETS_PROVIDER = 'aws';
      
      config = require('../../../src/config/index');

      expect(config.isProduction()).toBe(true);
      expect(config.isDevelopment()).toBe(false);
      expect(config.isTest()).toBe(false);
    });

    it('isDevelopment should return true in development', () => {
      process.env.NODE_ENV = 'development';
      
      config = require('../../../src/config/index');

      expect(config.isProduction()).toBe(false);
      expect(config.isDevelopment()).toBe(true);
      expect(config.isTest()).toBe(false);
    });

    it('isTest should return true in test', () => {
      config = require('../../../src/config/index');

      expect(config.isProduction()).toBe(false);
      expect(config.isDevelopment()).toBe(false);
      expect(config.isTest()).toBe(true);
    });
  });

  describe('getDatabaseConfig', () => {
    it('should return database configuration', () => {
      config = require('../../../src/config/index');
      
      const dbConfig = config.getDatabaseConfig();

      expect(dbConfig).toEqual({
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        ssl: false,
        pool: {
          min: 2,
          max: 10
        }
      });
    });

    it('should enable SSL when DB_SSL is true', () => {
      process.env.DB_SSL = 'true';
      
      config = require('../../../src/config/index');
      const dbConfig = config.getDatabaseConfig();

      expect(dbConfig.ssl).toEqual({ rejectUnauthorized: false });
    });

    it('should enable SSL with rejectUnauthorized in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_SSL = 'require';
      process.env.API_URL = 'https://api.example.com';
      process.env.CORS_ORIGIN = 'https://app.example.com';
      process.env.SECRETS_PROVIDER = 'aws';
      
      config = require('../../../src/config/index');
      const dbConfig = config.getDatabaseConfig();

      expect(dbConfig.ssl).toEqual({ rejectUnauthorized: true });
    });

    it('should use custom pool values', () => {
      process.env.DB_POOL_MIN = '5';
      process.env.DB_POOL_MAX = '20';
      
      config = require('../../../src/config/index');
      const dbConfig = config.getDatabaseConfig();

      expect(dbConfig.pool).toEqual({ min: 5, max: 20 });
    });
  });

  describe('getRedisConfig', () => {
    it('should return Redis configuration', () => {
      config = require('../../../src/config/index');
      
      const redisConfig = config.getRedisConfig();

      expect(redisConfig).toEqual({
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0,
        tls: undefined
      });
    });

    it('should include password when provided', () => {
      process.env.REDIS_PASSWORD = 'redis-password';
      
      config = require('../../../src/config/index');
      const redisConfig = config.getRedisConfig();

      expect(redisConfig.password).toBe('redis-password');
    });

    it('should enable TLS when REDIS_TLS is true', () => {
      process.env.REDIS_TLS = 'true';
      
      config = require('../../../src/config/index');
      const redisConfig = config.getRedisConfig();

      expect(redisConfig.tls).toEqual({});
    });

    it('should use custom Redis DB', () => {
      process.env.REDIS_DB = '3';
      
      config = require('../../../src/config/index');
      const redisConfig = config.getRedisConfig();

      expect(redisConfig.db).toBe(3);
    });
  });

  describe('getJwtConfig', () => {
    it('should return JWT configuration', () => {
      config = require('../../../src/config/index');
      
      const jwtConfig = config.getJwtConfig();

      expect(jwtConfig).toEqual({
        secret: 'test-jwt-secret-that-is-long-enough-32-chars',
        issuer: 'tickettoken',
        audience: 'tickettoken-api',
        algorithm: 'HS256'
      });
    });

    it('should throw error when JWT_SECRET missing in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      process.env.API_URL = 'https://api.example.com';
      process.env.CORS_ORIGIN = 'https://app.example.com';
      process.env.DB_SSL = 'require';
      process.env.SECRETS_PROVIDER = 'aws';

      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process.exit called with code ${code}`);
      });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        config = require('../../../src/config/index');
      }).toThrow();

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should use custom JWT settings', () => {
      process.env.JWT_ISSUER = 'custom-issuer';
      process.env.JWT_AUDIENCE = 'custom-audience';
      process.env.JWT_ALGORITHM = 'HS512';
      
      config = require('../../../src/config/index');
      const jwtConfig = config.getJwtConfig();

      expect(jwtConfig.issuer).toBe('custom-issuer');
      expect(jwtConfig.audience).toBe('custom-audience');
      expect(jwtConfig.algorithm).toBe('HS512');
    });
  });

  describe('getSquareConfig', () => {
    it('should return Square configuration for sandbox', () => {
      process.env.SQUARE_APP_ID = 'square-app-id';
      process.env.SQUARE_APP_SECRET = 'square-secret';
      process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'square-webhook-key';
      process.env.SQUARE_SANDBOX = 'true';
      
      config = require('../../../src/config/index');
      const squareConfig = config.getSquareConfig();

      expect(squareConfig).toEqual({
        appId: 'square-app-id',
        appSecret: 'square-secret',
        webhookSignatureKey: 'square-webhook-key',
        baseUrl: 'https://connect.squareupsandbox.com',
        isSandbox: true
      });
    });

    it('should return Square configuration for production', () => {
      process.env.SQUARE_APP_ID = 'square-app-id';
      process.env.SQUARE_APP_SECRET = 'square-secret';
      process.env.SQUARE_SANDBOX = 'false';
      
      config = require('../../../src/config/index');
      const squareConfig = config.getSquareConfig();

      expect(squareConfig.baseUrl).toBe('https://connect.squareup.com');
      expect(squareConfig.isSandbox).toBe(false);
    });
  });

  describe('getStripeConfig', () => {
    it('should return Stripe configuration', () => {
      process.env.STRIPE_API_KEY = 'sk_test_123';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
      
      config = require('../../../src/config/index');
      const stripeConfig = config.getStripeConfig();

      expect(stripeConfig).toEqual({
        apiKey: 'sk_test_123',
        webhookSecret: 'whsec_123'
      });
    });
  });

  describe('getMailchimpConfig', () => {
    it('should return Mailchimp configuration', () => {
      process.env.MAILCHIMP_CLIENT_ID = 'mailchimp-client-id';
      process.env.MAILCHIMP_CLIENT_SECRET = 'mailchimp-secret';
      process.env.MAILCHIMP_WEBHOOK_SECRET = 'mailchimp-webhook';
      
      config = require('../../../src/config/index');
      const mailchimpConfig = config.getMailchimpConfig();

      expect(mailchimpConfig).toEqual({
        clientId: 'mailchimp-client-id',
        clientSecret: 'mailchimp-secret',
        webhookSecret: 'mailchimp-webhook'
      });
    });
  });

  describe('getQuickBooksConfig', () => {
    it('should return QuickBooks configuration', () => {
      process.env.QUICKBOOKS_CLIENT_ID = 'qb-client-id';
      process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-secret';
      process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = 'qb-token';
      
      config = require('../../../src/config/index');
      const qbConfig = config.getQuickBooksConfig();

      expect(qbConfig).toEqual({
        clientId: 'qb-client-id',
        clientSecret: 'qb-secret',
        webhookVerifierToken: 'qb-token'
      });
    });
  });

  describe('getRateLimitConfig', () => {
    it('should return rate limit configuration', () => {
      config = require('../../../src/config/index');
      
      const rateLimitConfig = config.getRateLimitConfig();

      expect(rateLimitConfig).toEqual({
        enabled: true,
        windowMs: 60000,
        maxRequests: 100,
        webhookMax: 1000
      });
    });

    it('should disable rate limiting when RATE_LIMIT_ENABLED is false', () => {
      process.env.RATE_LIMIT_ENABLED = 'false';
      
      config = require('../../../src/config/index');
      const rateLimitConfig = config.getRateLimitConfig();

      expect(rateLimitConfig.enabled).toBe(false);
    });

    it('should use custom rate limit values', () => {
      process.env.RATE_LIMIT_WINDOW_MS = '30000';
      process.env.RATE_LIMIT_MAX_REQUESTS = '50';
      process.env.RATE_LIMIT_WEBHOOK_MAX = '500';
      
      config = require('../../../src/config/index');
      const rateLimitConfig = config.getRateLimitConfig();

      expect(rateLimitConfig.windowMs).toBe(30000);
      expect(rateLimitConfig.maxRequests).toBe(50);
      expect(rateLimitConfig.webhookMax).toBe(500);
    });
  });

  describe('Nested config export', () => {
    it('should export nested config structure', () => {
      config = require('../../../src/config/index');

      expect(config.config.server).toBeDefined();
      expect(config.config.database).toBeDefined();
      expect(config.config.redis).toBeDefined();
      expect(config.config.jwt).toBeDefined();
      expect(config.config.security).toBeDefined();
      expect(config.config.providers).toBeDefined();
    });

    it('should have correct server config', () => {
      config = require('../../../src/config/index');

      expect(config.config.server.port).toBe(3012);
      expect(config.config.server.host).toBe('0.0.0.0');
      expect(config.config.server.serviceName).toBe('integration-service');
    });
  });
});
