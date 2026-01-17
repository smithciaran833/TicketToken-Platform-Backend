// @ts-nocheck
import { validateEnv, getRequiredEnvVars } from '../../../src/config/env.validator';

describe('Env Validator', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.exit = jest.fn() as any;
    
    // Set required vars
    process.env.HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-characters-long';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'testdb';
    process.env.DB_USER = 'testuser';
    process.env.DB_PASSWORD = 'testpass';
    process.env.REDIS_HOST = 'localhost';
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
  });

  describe('validateEnv', () => {
    it('should pass with all required vars present', () => {
      const result = validateEnv();

      expect(result).toBeDefined();
      expect(result.HMAC_SECRET).toBe(process.env.HMAC_SECRET);
    });

    it('should apply default values', () => {
      delete process.env.PORT;
      delete process.env.NODE_ENV;
      delete process.env.LOG_LEVEL;

      const result = validateEnv();

      expect(result.PORT).toBe(3009);
      expect(result.NODE_ENV).toBe('development');
      expect(result.LOG_LEVEL).toBe('info');
    });

    it('should exit process when HMAC_SECRET missing', () => {
      delete process.env.HMAC_SECRET;

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit process when HMAC_SECRET too short', () => {
      process.env.HMAC_SECRET = 'short';

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit process when JWT_SECRET missing', () => {
      delete process.env.JWT_SECRET;

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit process when DB_HOST missing', () => {
      delete process.env.DB_HOST;

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should exit process when REDIS_HOST missing', () => {
      delete process.env.REDIS_HOST;

      validateEnv();

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should validate NODE_ENV enum', () => {
      process.env.NODE_ENV = 'production';
      const result = validateEnv();
      expect(result.NODE_ENV).toBe('production');
    });

    it('should validate LOG_LEVEL enum', () => {
      process.env.LOG_LEVEL = 'debug';
      const result = validateEnv();
      expect(result.LOG_LEVEL).toBe('debug');
    });

    it('should allow unknown env vars', () => {
      process.env.CUSTOM_VAR = 'custom';
      const result = validateEnv();
      expect(result.CUSTOM_VAR).toBe('custom');
    });

    it('should parse number env vars', () => {
      process.env.PORT = '8080';
      process.env.DB_PORT = '5433';
      const result = validateEnv();
      expect(result.PORT).toBe(8080);
      expect(result.DB_PORT).toBe(5433);
    });

    it('should validate service URLs as URIs', () => {
      process.env.TICKET_SERVICE_URL = 'http://localhost:3000';
      const result = validateEnv();
      expect(result.TICKET_SERVICE_URL).toBe('http://localhost:3000');
    });
  });

  describe('getRequiredEnvVars', () => {
    it('should return array of required var names', () => {
      const required = getRequiredEnvVars();

      expect(Array.isArray(required)).toBe(true);
      expect(required).toContain('HMAC_SECRET');
      expect(required).toContain('JWT_SECRET');
      expect(required).toContain('DB_HOST');
      expect(required).toContain('REDIS_HOST');
    });

    it('should return 7 required vars', () => {
      const required = getRequiredEnvVars();
      expect(required.length).toBe(7);
    });
  });
});
