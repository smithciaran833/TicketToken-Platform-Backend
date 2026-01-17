/**
 * Unit Tests for Configuration Validation
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
jest.mock('../../../src/utils/logger');

describe('Configuration Validation', () => {
  let logger: {
    info: jest.Mock<any>;
    warn: jest.Mock<any>;
    error: jest.Mock<any>;
    fatal: jest.Mock<any>;
  };
  let mockEnv: NodeJS.ProcessEnv;
  let mockProcessExit: jest.SpiedFunction<typeof process.exit>;

  const validJwtSecret = 'test-jwt-secret-that-is-at-least-32-characters-long!!';
  const validWebhookSecret = 'webhook-secret-that-is-at-least-32-characters-long!!';

  function setupMocks() {
    logger = {
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      fatal: jest.fn<any>()
    };
    jest.doMock('../../../src/utils/logger', () => ({ logger }));
  }

  function setBaseEnv() {
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
    process.env.JWT_SECRET = validJwtSecret;
  }

  function setProductionEnv() {
    process.env.NODE_ENV = 'production';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
    process.env.JWT_SECRET = validJwtSecret;
    process.env.DB_SSL = 'true';
    process.env.WEBHOOK_SECRET = validWebhookSecret;
    process.env.INTERNAL_SERVICE_SECRET = 'internal-secret-value';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.TRUST_PROXY = 'true';
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockEnv = { ...process.env };
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    setupMocks();
    setBaseEnv();
  });

  afterEach(() => {
    process.env = mockEnv;
    mockProcessExit.mockRestore();
    jest.clearAllMocks();
  });

  describe('validateConfig', () => {
    it('should validate configuration successfully', async () => {
      const { validateConfig } = await import('../../../src/config/validate');

      const config = validateConfig();

      expect(config).toBeDefined();
      expect(config.DB_HOST).toBe('localhost');
      expect(config.DB_NAME).toBe('test_db');
      expect(config.JWT_SECRET).toBe(validJwtSecret);
    });

    it('should use default values when optional fields not provided', async () => {
      const { validateConfig } = await import('../../../src/config/validate');

      const config = validateConfig();

      expect(config.PORT).toBe(3010);
      expect(config.HOST).toBe('0.0.0.0');
      expect(config.DB_POOL_MIN).toBe(2);
      expect(config.DB_POOL_MAX).toBe(10);
    });

    it('should parse numeric environment variables correctly', async () => {
      process.env.PORT = '5000';
      process.env.DB_POOL_MAX = '20';

      const { validateConfig } = await import('../../../src/config/validate');

      const config = validateConfig();

      expect(config.PORT).toBe(5000);
      expect(config.DB_POOL_MAX).toBe(20);
    });

    it('should cache validated configuration', async () => {
      const { validateConfig } = await import('../../../src/config/validate');

      const config1 = validateConfig();
      const config2 = validateConfig();

      expect(config1).toBe(config2);
    });

    it('should exit process on validation failure', async () => {
      delete process.env.DB_PASSWORD;

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Production validation', () => {
    it('should require DB_SSL in production', async () => {
      setProductionEnv();
      process.env.DB_SSL = 'false';

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should require WEBHOOK_SECRET in production', async () => {
      setProductionEnv();
      delete process.env.WEBHOOK_SECRET;

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should require INTERNAL_SERVICE_SECRET in production', async () => {
      setProductionEnv();
      delete process.env.INTERNAL_SERVICE_SECRET;

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should reject wildcard CORS in production', async () => {
      setProductionEnv();
      process.env.CORS_ORIGIN = '*';

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should pass all production validations when properly configured', async () => {
      setProductionEnv();

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      const config = validateConfig();

      expect(config).toBeDefined();
      expect(mockProcessExit).not.toHaveBeenCalled();
    });
  });

  describe('Compliance validation', () => {
    it('should warn when DATA_RETENTION_YEARS is less than 7', async () => {
      process.env.DATA_RETENTION_YEARS = '5';

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ years: 5 }),
        'DATA_RETENTION_YEARS less than 7 - IRS requires 7 year retention for tax records'
      );
    });

    it('should warn when TAX_REPORTING_THRESHOLD is below IRS minimum', async () => {
      process.env.TAX_REPORTING_THRESHOLD = '400';

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 400 }),
        'TAX_REPORTING_THRESHOLD below IRS minimum of $600'
      );
    });

    it('should not warn for compliant configuration', async () => {
      process.env.DATA_RETENTION_YEARS = '7';
      process.env.TAX_REPORTING_THRESHOLD = '600';
      process.env.OFAC_API_URL = 'https://ofac.api.example.com';

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      const warnCalls = logger.warn.mock.calls;
      const complianceWarnings = warnCalls.filter((call: any) =>
        call[0]?.years || call[0]?.threshold
      );
      expect(complianceWarnings).toHaveLength(0);
    });
  });

  describe('getConfig', () => {
    it('should return validated config', async () => {
      const { getConfig } = await import('../../../src/config/validate');

      const config = getConfig();

      expect(config).toBeDefined();
      expect(config.DB_HOST).toBe('localhost');
    });
  });

  describe('Environment helper functions', () => {
    it('isProduction should return true in production', async () => {
      setProductionEnv();

      jest.resetModules();
      setupMocks();

      const { isProduction } = await import('../../../src/config/validate');

      expect(isProduction()).toBe(true);
    });

    it('isProduction should return false in non-production', async () => {
      const { isProduction } = await import('../../../src/config/validate');

      expect(isProduction()).toBe(false);
    });

    it('isDevelopment should return true in development', async () => {
      process.env.NODE_ENV = 'development';

      jest.resetModules();
      setupMocks();

      const { isDevelopment } = await import('../../../src/config/validate');

      expect(isDevelopment()).toBe(true);
    });

    it('isDevelopment should return false in non-development', async () => {
      const { isDevelopment } = await import('../../../src/config/validate');

      expect(isDevelopment()).toBe(false);
    });

    it('isTest should return true in test', async () => {
      const { isTest } = await import('../../../src/config/validate');

      expect(isTest()).toBe(true);
    });

    it('isTest should return false in non-test', async () => {
      setProductionEnv();

      jest.resetModules();
      setupMocks();

      const { isTest } = await import('../../../src/config/validate');

      expect(isTest()).toBe(false);
    });
  });

  describe('Field validation', () => {
    it('should validate JWT_SECRET minimum length', async () => {
      process.env.JWT_SECRET = 'too-short';

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should validate PORT range', async () => {
      process.env.PORT = '70000';

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should validate NODE_ENV enum values', async () => {
      process.env.NODE_ENV = 'invalid';

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should validate URL format for REDIS_URL', async () => {
      process.env.REDIS_URL = 'not-a-url';

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      validateConfig();

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should accept valid configuration', async () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'development';
      process.env.REDIS_URL = 'redis://localhost:6379';

      jest.resetModules();
      setupMocks();

      const { validateConfig } = await import('../../../src/config/validate');

      const config = validateConfig();

      expect(config).toBeDefined();
      expect(mockProcessExit).not.toHaveBeenCalled();
    });
  });
});
