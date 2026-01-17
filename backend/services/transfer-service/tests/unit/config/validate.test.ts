/**
 * Unit Tests for Configuration Validation
 *
 * Note: This module is difficult to test in isolation because it reads
 * from process.env and caches results. These tests focus on the validation
 * logic rather than exhaustive environment variable scenarios.
 */

jest.mock('../../../src/utils/logger');

import { z } from 'zod';
import config, {
  validateConfig,
  getConfig,
  isProduction,
  isDevelopment,
  isTest
} from '../../../src/config/validate';

describe('Configuration Validation - Unit Tests', () => {
  describe('Configuration Access', () => {
    it('should return validated configuration', () => {
      const cfg = getConfig();
      
      expect(cfg).toBeDefined();
      expect(cfg).toHaveProperty('NODE_ENV');
      expect(cfg).toHaveProperty('DB_HOST');
      expect(cfg).toHaveProperty('PORT');
    });

    it('should cache configuration after first call', () => {
      const cfg1 = getConfig();
      const cfg2 = getConfig();
      const cfg3 = getConfig();
      
      // Should return same instance
      expect(cfg1).toBe(cfg2);
      expect(cfg2).toBe(cfg3);
    });

    it('should have valid types for all fields', () => {
      const cfg = getConfig();
      
      // Numbers
      expect(typeof cfg.PORT).toBe('number');
      expect(typeof cfg.DB_PORT).toBe('number');
      expect(typeof cfg.DB_POOL_MIN).toBe('number');
      expect(typeof cfg.DB_POOL_MAX).toBe('number');
      
      // Strings
      expect(typeof cfg.NODE_ENV).toBe('string');
      expect(typeof cfg.DB_HOST).toBe('string');
      expect(typeof cfg.DB_NAME).toBe('string');
      
      // Enums
      expect(['development', 'test', 'staging', 'production']).toContain(cfg.NODE_ENV);
      expect(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).toContain(cfg.LOG_LEVEL);
    });
  });

  describe('Environment Helper Functions', () => {
    it('should correctly identify test environment', () => {
      const cfg = getConfig();
      
      if (cfg.NODE_ENV === 'test') {
        expect(isTest()).toBe(true);
        expect(isProduction()).toBe(false);
        expect(isDevelopment()).toBe(false);
      }
    });

    it('should have consistent environment checks', () => {
      const prod = isProduction();
      const dev = isDevelopment();
      const test = isTest();
      
      // Exactly one should be true
      const trueCount = [prod, dev, test].filter(Boolean).length;
      expect(trueCount).toBe(1);
    });
  });

  describe('Configuration Schema', () => {
    it('should have envSchema defined', () => {
      expect(config.envSchema).toBeDefined();
      expect(config.envSchema).toBeInstanceOf(z.ZodObject);
    });

    it('should validate database configuration', () => {
      const cfg = getConfig();
      
      expect(cfg.DB_HOST).toBeTruthy();
      expect(cfg.DB_NAME).toBeTruthy();
      expect(cfg.DB_USER).toBeTruthy();
      expect(cfg.DB_PASSWORD).toBeTruthy();
      expect(cfg.DB_PORT).toBeGreaterThan(0);
      expect(cfg.DB_PORT).toBeLessThan(65536);
    });

    it('should validate Solana configuration', () => {
      const cfg = getConfig();
      
      expect(cfg.SOLANA_RPC_URL).toBeTruthy();
      expect(cfg.SOLANA_RPC_URL).toMatch(/^https?:\/\//);
      expect(['mainnet-beta', 'devnet', 'testnet']).toContain(cfg.SOLANA_NETWORK);
      expect(['processed', 'confirmed', 'finalized']).toContain(cfg.SOLANA_COMMITMENT);
    });

    it('should have valid port numbers', () => {
      const cfg = getConfig();
      
      expect(cfg.PORT).toBeGreaterThan(0);
      expect(cfg.PORT).toBeLessThan(65536);
      expect(cfg.DB_PORT).toBeGreaterThan(0);
      expect(cfg.DB_PORT).toBeLessThan(65536);
      expect(cfg.REDIS_PORT).toBeGreaterThan(0);
      expect(cfg.REDIS_PORT).toBeLessThan(65536);
    });

    it('should have valid pool sizes', () => {
      const cfg = getConfig();
      
      expect(cfg.DB_POOL_MIN).toBeGreaterThanOrEqual(0);
      expect(cfg.DB_POOL_MAX).toBeGreaterThan(0);
      expect(cfg.DB_POOL_MAX).toBeGreaterThanOrEqual(cfg.DB_POOL_MIN);
    });

    it('should have valid transfer configuration', () => {
      const cfg = getConfig();
      
      expect(cfg.TRANSFER_EXPIRY_HOURS).toBeGreaterThan(0);
      expect(cfg.TRANSFER_EXPIRY_HOURS).toBeLessThanOrEqual(168);
      expect(cfg.TRANSFER_MAX_BATCH_SIZE).toBeGreaterThan(0);
      expect(cfg.TRANSFER_MAX_BATCH_SIZE).toBeLessThanOrEqual(100);
    });

    it('should have valid rate limit configuration', () => {
      const cfg = getConfig();
      
      expect(['true', 'false']).toContain(cfg.RATE_LIMIT_ENABLED);
      expect(cfg.RATE_LIMIT_WINDOW_MS).toBeGreaterThanOrEqual(1000);
      expect(cfg.RATE_LIMIT_MAX_REQUESTS).toBeGreaterThan(0);
    });

    it('should have valid logging configuration', () => {
      const cfg = getConfig();
      
      expect(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).toContain(cfg.LOG_LEVEL);
      expect(['json', 'pretty']).toContain(cfg.LOG_FORMAT);
    });

    it('should have valid CORS configuration', () => {
      const cfg = getConfig();
      
      expect(cfg.CORS_ORIGIN).toBeTruthy();
      expect(['true', 'false']).toContain(cfg.CORS_CREDENTIALS);
    });

    it('should have valid secrets provider', () => {
      const cfg = getConfig();
      
      expect(['aws', 'env', 'vault']).toContain(cfg.SECRETS_PROVIDER);
    });
  });

  describe('Configuration Defaults', () => {
    it('should have sensible defaults', () => {
      const cfg = getConfig();
      
      // These should have default values even if not explicitly set
      expect(cfg.PORT).toBeDefined();
      expect(cfg.DB_PORT).toBeDefined();
      expect(cfg.DB_POOL_MIN).toBeDefined();
      expect(cfg.DB_POOL_MAX).toBeDefined();
      expect(cfg.LOG_LEVEL).toBeDefined();
      expect(cfg.LOG_FORMAT).toBeDefined();
      expect(cfg.SOLANA_NETWORK).toBeDefined();
      expect(cfg.SOLANA_COMMITMENT).toBeDefined();
    });
  });

  describe('Type Safety', () => {
    it('should enforce integer types for numeric fields', () => {
      const cfg = getConfig();
      
      // All these should be integers, not floats
      expect(Number.isInteger(cfg.PORT)).toBe(true);
      expect(Number.isInteger(cfg.DB_PORT)).toBe(true);
      expect(Number.isInteger(cfg.DB_POOL_MIN)).toBe(true);
      expect(Number.isInteger(cfg.DB_POOL_MAX)).toBe(true);
      expect(Number.isInteger(cfg.REDIS_PORT)).toBe(true);
      expect(Number.isInteger(cfg.TRANSFER_EXPIRY_HOURS)).toBe(true);
      expect(Number.isInteger(cfg.TRANSFER_MAX_BATCH_SIZE)).toBe(true);
      expect(Number.isInteger(cfg.RATE_LIMIT_WINDOW_MS)).toBe(true);
      expect(Number.isInteger(cfg.RATE_LIMIT_MAX_REQUESTS)).toBe(true);
    });

    it('should have string types for text fields', () => {
      const cfg = getConfig();
      
      expect(typeof cfg.NODE_ENV).toBe('string');
      expect(typeof cfg.HOST).toBe('string');
      expect(typeof cfg.DB_HOST).toBe('string');
      expect(typeof cfg.DB_NAME).toBe('string');
      expect(typeof cfg.DB_USER).toBe('string');
      expect(typeof cfg.DB_PASSWORD).toBe('string');
      expect(typeof cfg.SOLANA_RPC_URL).toBe('string');
      expect(typeof cfg.LOG_LEVEL).toBe('string');
    });
  });

  describe('Optional Fields', () => {
    it('should handle optional Redis configuration', () => {
      const cfg = getConfig();
      
      // These are optional
      if (cfg.REDIS_URL) {
        expect(typeof cfg.REDIS_URL).toBe('string');
      }
      if (cfg.REDIS_HOST) {
        expect(typeof cfg.REDIS_HOST).toBe('string');
      }
      if (cfg.REDIS_PASSWORD) {
        expect(typeof cfg.REDIS_PASSWORD).toBe('string');
      }
    });

    it('should handle optional secondary Solana URLs', () => {
      const cfg = getConfig();
      
      if (cfg.SOLANA_RPC_URL_SECONDARY) {
        expect(typeof cfg.SOLANA_RPC_URL_SECONDARY).toBe('string');
        expect(cfg.SOLANA_RPC_URL_SECONDARY).toMatch(/^https?:\/\//);
      }
      
      if (cfg.SOLANA_RPC_URL_TERTIARY) {
        expect(typeof cfg.SOLANA_RPC_URL_TERTIARY).toBe('string');
        expect(cfg.SOLANA_RPC_URL_TERTIARY).toMatch(/^https?:\/\//);
      }
    });

    it('should handle optional AWS configuration', () => {
      const cfg = getConfig();
      
      if (cfg.AWS_REGION) {
        expect(typeof cfg.AWS_REGION).toBe('string');
      }
      if (cfg.AWS_SECRET_NAME) {
        expect(typeof cfg.AWS_SECRET_NAME).toBe('string');
      }
    });

    it('should handle optional JWT configuration', () => {
      const cfg = getConfig();
      
      // JWT_SECRET is optional because it might come from secrets manager
      if (cfg.JWT_SECRET) {
        expect(typeof cfg.JWT_SECRET).toBe('string');
      }
      
      expect(typeof cfg.JWT_ISSUER).toBe('string');
      expect(typeof cfg.JWT_AUDIENCE).toBe('string');
    });
  });

  describe('Boolean String Fields', () => {
    it('should validate boolean string fields', () => {
      const cfg = getConfig();
      
      // These should be 'true' or 'false' strings, not actual booleans
      expect(['true', 'false']).toContain(cfg.DB_SSL);
      expect(['true', 'false']).toContain(cfg.REDIS_TLS);
      expect(['true', 'false']).toContain(cfg.RATE_LIMIT_ENABLED);
      expect(['true', 'false']).toContain(cfg.CORS_CREDENTIALS);
      expect(['true', 'false']).toContain(cfg.TRUST_PROXY);
    });
  });

  describe('Module Exports', () => {
    it('should export all required functions', () => {
      expect(typeof validateConfig).toBe('function');
      expect(typeof getConfig).toBe('function');
      expect(typeof isProduction).toBe('function');
      expect(typeof isDevelopment).toBe('function');
      expect(typeof isTest).toBe('function');
    });

    it('should export default object with functions', () => {
      expect(config).toBeDefined();
      expect(typeof config.validateConfig).toBe('function');
      expect(typeof config.getConfig).toBe('function');
      expect(typeof config.isProduction).toBe('function');
      expect(typeof config.isDevelopment).toBe('function');
      expect(typeof config.isTest).toBe('function');
      expect(config.envSchema).toBeDefined();
    });
  });
});
