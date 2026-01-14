/**
 * Unit Tests for src/config/env-validation.ts
 */

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('config/env-validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Create a clean env object with only essential vars
    process.env = {
      NODE_ENV: 'development',
      PATH: originalEnv.PATH, // Keep PATH for Node to work
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnv()', () => {
    const setRequiredEnvVars = () => {
      process.env.NODE_ENV = 'development';
      process.env.DB_HOST = 'localhost';
      process.env.DB_PORT = '5432';
      process.env.DB_USER = 'postgres';
      process.env.DB_PASSWORD = 'password';
      process.env.DB_NAME = 'testdb';
      process.env.REDIS_HOST = 'localhost';
      process.env.REDIS_PORT = '6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.QR_ENCRYPTION_KEY = 'b'.repeat(32);
      process.env.INTERNAL_WEBHOOK_SECRET = 'c'.repeat(32);
      // Set LOG_LEVEL to valid value
      process.env.LOG_LEVEL = 'info';
    };

    it('returns validated env object when all required vars are set', () => {
      setRequiredEnvVars();
      const { validateEnv } = require('../../../src/config/env-validation');

      const result = validateEnv();

      expect(result.NODE_ENV).toBe('development');
      expect(result.DB_HOST).toBe('localhost');
      expect(result.PORT).toBe(3004);
    });

    it('throws on missing required DB_HOST', () => {
      setRequiredEnvVars();
      delete process.env.DB_HOST;
      const { validateEnv } = require('../../../src/config/env-validation');

      expect(() => validateEnv()).toThrow();
    });

    it('throws on missing required DB_USER', () => {
      setRequiredEnvVars();
      delete process.env.DB_USER;
      const { validateEnv } = require('../../../src/config/env-validation');

      expect(() => validateEnv()).toThrow();
    });

    it('throws on JWT_SECRET less than 32 chars', () => {
      setRequiredEnvVars();
      process.env.JWT_SECRET = 'short';
      const { validateEnv } = require('../../../src/config/env-validation');

      expect(() => validateEnv()).toThrow(/JWT_SECRET/);
    });

    it('throws on QR_ENCRYPTION_KEY less than 32 chars', () => {
      setRequiredEnvVars();
      process.env.QR_ENCRYPTION_KEY = 'short';
      const { validateEnv } = require('../../../src/config/env-validation');

      expect(() => validateEnv()).toThrow(/QR_ENCRYPTION_KEY/);
    });

    it('builds DATABASE_URL if not provided', () => {
      setRequiredEnvVars();
      delete process.env.DATABASE_URL;
      const { validateEnv } = require('../../../src/config/env-validation');

      const result = validateEnv();

      expect(result.DATABASE_URL).toContain('postgresql://');
      expect(result.DATABASE_URL).toContain('localhost');
    });

    it('builds REDIS_URL if not provided', () => {
      setRequiredEnvVars();
      delete process.env.REDIS_URL;
      const { validateEnv } = require('../../../src/config/env-validation');

      const result = validateEnv();

      expect(result.REDIS_URL).toContain('redis://');
    });

    it('uses defaults for optional fields', () => {
      setRequiredEnvVars();
      const { validateEnv } = require('../../../src/config/env-validation');

      const result = validateEnv();

      expect(result.LOG_LEVEL).toBe('info');
      expect(result.LOG_FORMAT).toBe('json');
    });

    it('transforms PORT to number', () => {
      setRequiredEnvVars();
      process.env.PORT = '4000';
      const { validateEnv } = require('../../../src/config/env-validation');

      const result = validateEnv();

      expect(result.PORT).toBe(4000);
      expect(typeof result.PORT).toBe('number');
    });

    it('transforms boolean strings', () => {
      setRequiredEnvVars();
      process.env.ENABLE_METRICS = 'true';
      process.env.ENABLE_RATE_LIMITING = 'false';
      const { validateEnv } = require('../../../src/config/env-validation');

      const result = validateEnv();

      expect(result.ENABLE_METRICS).toBe(true);
      expect(result.ENABLE_RATE_LIMITING).toBe(false);
    });
  });

  describe('generateSecret()', () => {
    it('generates hex string of specified length', () => {
      const { generateSecret } = require('../../../src/config/env-validation');

      const secret = generateSecret(32);

      expect(secret).toHaveLength(64); // hex doubles the length
      expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
    });

    it('defaults to 64 bytes (128 hex chars)', () => {
      const { generateSecret } = require('../../../src/config/env-validation');

      const secret = generateSecret();

      expect(secret).toHaveLength(128);
    });
  });

  describe('printEnvDocs()', () => {
    it('prints documentation without throwing', () => {
      const { printEnvDocs } = require('../../../src/config/env-validation');
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      expect(() => printEnvDocs()).not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
