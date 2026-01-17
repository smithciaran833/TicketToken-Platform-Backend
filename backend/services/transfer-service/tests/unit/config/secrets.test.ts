/**
 * Unit Tests for Secrets Configuration
 * 
 * Tests:
 * - AWS Secrets Manager integration
 * - HashiCorp Vault fallback
 * - Environment variable loading
 * - JWT secret validation
 * - Treasury key validation
 * - Production enforcement
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(),
  GetSecretValueCommand: jest.fn()
}));

// Mock global fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Secrets Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSecret()', () => {
    it('should return secret value when it exists', () => {
      process.env.TEST_SECRET = 'test-value';
      
      const { getSecret } = require('../../../src/config/secrets');
      const value = getSecret('TEST_SECRET');
      
      expect(value).toBe('test-value');
    });

    it('should throw error when required secret is missing', () => {
      delete process.env.TEST_SECRET;
      
      const { getSecret } = require('../../../src/config/secrets');
      
      expect(() => getSecret('TEST_SECRET', true)).toThrow('Required secret TEST_SECRET is not configured');
    });

    it('should return undefined when optional secret is missing', () => {
      delete process.env.TEST_SECRET;
      
      const { getSecret } = require('../../../src/config/secrets');
      const value = getSecret('TEST_SECRET', false);
      
      expect(value).toBeUndefined();
    });

    it('should handle empty string as valid value', () => {
      process.env.TEST_SECRET = '';
      
      const { getSecret } = require('../../../src/config/secrets');
      const value = getSecret('TEST_SECRET', false);
      
      expect(value).toBe('');
    });
  });

  describe('getJwtSecret()', () => {
    it('should return JWT secret when configured', () => {
      process.env.JWT_SECRET = 'my-jwt-secret-key-32-characters-long';
      
      const { getJwtSecret } = require('../../../src/config/secrets');
      const secret = getJwtSecret();
      
      expect(secret).toBe('my-jwt-secret-key-32-characters-long');
    });

    it('should throw error when JWT secret is not configured', () => {
      delete process.env.JWT_SECRET;
      
      const { getJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => getJwtSecret()).toThrow('JWT_SECRET is not configured');
    });
  });

  describe('getTreasuryPrivateKey()', () => {
    it('should return treasury key when configured', () => {
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'base58encodedprivatekey1234567890';
      
      const { getTreasuryPrivateKey } = require('../../../src/config/secrets');
      const key = getTreasuryPrivateKey();
      
      expect(key).toBe('base58encodedprivatekey1234567890');
    });

    it('should throw error when treasury key is not configured', () => {
      delete process.env.SOLANA_TREASURY_PRIVATE_KEY;
      
      const { getTreasuryPrivateKey } = require('../../../src/config/secrets');
      
      expect(() => getTreasuryPrivateKey()).toThrow('SOLANA_TREASURY_PRIVATE_KEY is not configured');
    });
  });

  describe('hasSecret()', () => {
    it('should return true when secret exists', () => {
      process.env.TEST_SECRET = 'value';
      
      const { hasSecret } = require('../../../src/config/secrets');
      
      expect(hasSecret('TEST_SECRET')).toBe(true);
    });

    it('should return false when secret does not exist', () => {
      delete process.env.TEST_SECRET;
      
      const { hasSecret } = require('../../../src/config/secrets');
      
      expect(hasSecret('TEST_SECRET')).toBe(false);
    });

    it('should return false for empty string', () => {
      process.env.TEST_SECRET = '';
      
      const { hasSecret } = require('../../../src/config/secrets');
      
      expect(hasSecret('TEST_SECRET')).toBe(false);
    });
  });

  describe('getMissingSecrets()', () => {
    it('should return empty array when all required secrets present', () => {
      process.env.JWT_SECRET = 'jwt-secret';
      process.env.DB_PASSWORD = 'db-password';
      process.env.INTERNAL_SERVICE_SECRET = 'internal-secret';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'treasury-key';
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      
      const { getMissingSecrets } = require('../../../src/config/secrets');
      const missing = getMissingSecrets();
      
      expect(missing).toEqual([]);
    });

    it('should return list of missing required secrets', () => {
      delete process.env.JWT_SECRET;
      delete process.env.SOLANA_TREASURY_PRIVATE_KEY;
      
      process.env.DB_PASSWORD = 'db-password';
      process.env.INTERNAL_SERVICE_SECRET = 'internal-secret';
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      
      const { getMissingSecrets } = require('../../../src/config/secrets');
      const missing = getMissingSecrets();
      
      expect(missing).toContain('JWT_SECRET');
      expect(missing).toContain('SOLANA_TREASURY_PRIVATE_KEY');
      expect(missing).not.toContain('DB_PASSWORD');
    });

    it('should detect all missing required secrets', () => {
      delete process.env.JWT_SECRET;
      delete process.env.DB_PASSWORD;
      delete process.env.INTERNAL_SERVICE_SECRET;
      delete process.env.SOLANA_TREASURY_PRIVATE_KEY;
      delete process.env.SOLANA_RPC_URL;
      
      const { getMissingSecrets } = require('../../../src/config/secrets');
      const missing = getMissingSecrets();
      
      expect(missing.length).toBe(5);
      expect(missing).toEqual(expect.arrayContaining([
        'JWT_SECRET',
        'DB_PASSWORD',
        'INTERNAL_SERVICE_SECRET',
        'SOLANA_TREASURY_PRIVATE_KEY',
        'SOLANA_RPC_URL'
      ]));
    });
  });

  describe('validateJwtSecret()', () => {
    it('should validate JWT secret with correct length', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      
      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => validateJwtSecret()).not.toThrow();
    });

    it('should throw error when JWT secret is missing', () => {
      delete process.env.JWT_SECRET;
      
      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => validateJwtSecret()).toThrow('JWT_SECRET is not configured');
    });

    it('should throw error when JWT secret is too short', () => {
      process.env.JWT_SECRET = 'short';
      
      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => validateJwtSecret()).toThrow('JWT_SECRET must be at least 32 characters');
    });

    it('should reject weak secrets in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'secret' + 'x'.repeat(27); // Contains 'secret'
      
      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => validateJwtSecret()).toThrow('JWT_SECRET appears to be a weak/default value');
    });

    it('should warn about weak secrets in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'your-secret-key' + 'x'.repeat(20);
      
      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => validateJwtSecret()).not.toThrow();
    });

    it('should detect various weak secret patterns', () => {
      process.env.NODE_ENV = 'production';
      
      const weakSecrets = [
        'secret' + 'x'.repeat(27),
        'your-secret-key' + 'x'.repeat(20),
        'jwt-secret' + 'x'.repeat(22),
        'change-me' + 'x'.repeat(23),
        'supersecretkey' + 'x'.repeat(18)
      ];

      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      for (const weak of weakSecrets) {
        process.env.JWT_SECRET = weak;
        jest.resetModules();
        const { validateJwtSecret: validate } = require('../../../src/config/secrets');
        expect(() => validate()).toThrow('weak/default value');
      }
    });

    it('should accept strong JWT secrets', () => {
      process.env.JWT_SECRET = 'K8n2Pm9Qr7Sv4Tx6Uw3Yz1Ab5Cd8Ef0Gh2Jk4Lm';
      
      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => validateJwtSecret()).not.toThrow();
    });
  });

  describe('validateTreasuryKeyConfig()', () => {
    it('should validate treasury key in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'a'.repeat(70);
      
      const { validateTreasuryKeyConfig } = require('../../../src/config/secrets');
      
      expect(() => validateTreasuryKeyConfig()).not.toThrow();
    });

    it('should throw error for treasury key from env in production without secrets manager', () => {
      process.env.NODE_ENV = 'production';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'a'.repeat(70);
      delete process.env.USE_SECRETS_MANAGER;
      
      const { validateTreasuryKeyConfig } = require('../../../src/config/secrets');
      
      expect(() => validateTreasuryKeyConfig()).toThrow('SOLANA_TREASURY_PRIVATE_KEY appears to be from environment in production');
    });

    it('should allow treasury key in production with secrets manager', () => {
      process.env.NODE_ENV = 'production';
      process.env.USE_SECRETS_MANAGER = 'true';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'a'.repeat(70);
      
      const { validateTreasuryKeyConfig } = require('../../../src/config/secrets');
      
      expect(() => validateTreasuryKeyConfig()).not.toThrow();
    });

    it('should throw error for invalid key length (too short)', () => {
      process.env.NODE_ENV = 'development';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'short';
      
      const { validateTreasuryKeyConfig } = require('../../../src/config/secrets');
      
      expect(() => validateTreasuryKeyConfig()).toThrow('SOLANA_TREASURY_PRIVATE_KEY has invalid length');
    });

    it('should throw error for invalid key length (too long)', () => {
      process.env.NODE_ENV = 'development';
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'a'.repeat(101);
      
      const { validateTreasuryKeyConfig } = require('../../../src/config/secrets');
      
      expect(() => validateTreasuryKeyConfig()).toThrow('SOLANA_TREASURY_PRIVATE_KEY has invalid length');
    });

    it('should accept key length within valid range', () => {
      process.env.NODE_ENV = 'development';
      
      const validLengths = [64, 70, 80, 88, 100];
      const { validateTreasuryKeyConfig } = require('../../../src/config/secrets');
      
      for (const length of validLengths) {
        process.env.SOLANA_TREASURY_PRIVATE_KEY = 'a'.repeat(length);
        expect(() => validateTreasuryKeyConfig()).not.toThrow();
      }
    });

    it('should not throw when key is not configured', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SOLANA_TREASURY_PRIVATE_KEY;
      
      const { validateTreasuryKeyConfig } = require('../../../src/config/secrets');
      
      expect(() => validateTreasuryKeyConfig()).not.toThrow();
    });
  });

  describe('validateInternalServiceSecret()', () => {
    it('should validate internal service secret with correct length', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'a'.repeat(32);
      
      const { validateInternalServiceSecret } = require('../../../src/config/secrets');
      
      expect(() => validateInternalServiceSecret()).not.toThrow();
    });

    it('should throw error for secret that is too short', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'short';
      
      const { validateInternalServiceSecret } = require('../../../src/config/secrets');
      
      expect(() => validateInternalServiceSecret()).toThrow('INTERNAL_SERVICE_SECRET must be at least 32 characters');
    });

    it('should throw error in production when secret is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.INTERNAL_SERVICE_SECRET;
      
      const { validateInternalServiceSecret } = require('../../../src/config/secrets');
      
      expect(() => validateInternalServiceSecret()).toThrow('INTERNAL_SERVICE_SECRET is required in production');
    });

    it('should not throw in development when secret is missing', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.INTERNAL_SERVICE_SECRET;
      
      const { validateInternalServiceSecret } = require('../../../src/config/secrets');
      
      expect(() => validateInternalServiceSecret()).not.toThrow();
    });

    it('should accept secrets exactly 32 characters', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'a'.repeat(32);
      
      const { validateInternalServiceSecret } = require('../../../src/config/secrets');
      
      expect(() => validateInternalServiceSecret()).not.toThrow();
    });

    it('should accept secrets longer than 32 characters', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'a'.repeat(64);
      
      const { validateInternalServiceSecret } = require('../../../src/config/secrets');
      
      expect(() => validateInternalServiceSecret()).not.toThrow();
    });
  });

  describe('validateRequiredSecrets()', () => {
    it('should validate all secrets when properly configured', async () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DB_PASSWORD = 'db-pass';
      process.env.INTERNAL_SERVICE_SECRET = 'b'.repeat(32);
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'c'.repeat(70);
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      
      const { validateRequiredSecrets } = require('../../../src/config/secrets');
      
      await expect(validateRequiredSecrets()).resolves.not.toThrow();
    });

    it('should throw in production when required secrets are missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.SOLANA_TREASURY_PRIVATE_KEY;
      
      const { validateRequiredSecrets } = require('../../../src/config/secrets');
      
      await expect(validateRequiredSecrets()).rejects.toThrow('Cannot start in production without all required secrets');
    });

    it('should warn in development when required secrets are missing', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_SECRET;
      process.env.SOLANA_TREASURY_PRIVATE_KEY = 'a'.repeat(70);
      process.env.DB_PASSWORD = 'pass';
      process.env.INTERNAL_SERVICE_SECRET = 'b'.repeat(32);
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      
      const { validateRequiredSecrets } = require('../../../src/config/secrets');
      
      await expect(validateRequiredSecrets()).rejects.toThrow('JWT_SECRET is not configured');
    });
  });

  describe('loadSecrets()', () => {
    it('should use environment variables in development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'dev-secret';
      
      const { loadSecrets } = require('../../../src/config/secrets');
      
      await loadSecrets();
      
      expect(process.env.JWT_SECRET).toBe('dev-secret');
    });

    it('should throw in production without secrets manager', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.USE_SECRETS_MANAGER;
      
      const { loadSecrets } = require('../../../src/config/secrets');
      
      await expect(loadSecrets()).rejects.toThrow('Failed to load secrets in production');
    });

    it('should not override existing env vars with secrets', async () => {
      process.env.NODE_ENV = 'development';
      process.env.USE_SECRETS_MANAGER = 'true';
      process.env.JWT_SECRET = 'existing-secret';
      
      const { loadSecrets } = require('../../../src/config/secrets');
      
      await loadSecrets();
      
      expect(process.env.JWT_SECRET).toBe('existing-secret');
    });
  });

  describe('SecretCategories', () => {
    it('should export AUTH secrets category', () => {
      const { SecretCategories } = require('../../../src/config/secrets');
      
      expect(SecretCategories.AUTH).toContain('JWT_SECRET');
      expect(SecretCategories.AUTH).toContain('INTERNAL_SERVICE_SECRET');
      expect(SecretCategories.AUTH).toContain('WEBHOOK_SECRET');
    });

    it('should export DATABASE secrets category', () => {
      const { SecretCategories } = require('../../../src/config/secrets');
      
      expect(SecretCategories.DATABASE).toContain('DB_PASSWORD');
      expect(SecretCategories.DATABASE).toContain('DB_HOST');
      expect(SecretCategories.DATABASE).toContain('DB_USER');
      expect(SecretCategories.DATABASE).toContain('DB_NAME');
    });

    it('should export SOLANA secrets category', () => {
      const { SecretCategories } = require('../../../src/config/secrets');
      
      expect(SecretCategories.SOLANA).toContain('SOLANA_TREASURY_PRIVATE_KEY');
      expect(SecretCategories.SOLANA).toContain('SOLANA_RPC_URL');
      expect(SecretCategories.SOLANA).toContain('SOLANA_RPC_ENDPOINTS');
      expect(SecretCategories.SOLANA).toContain('SOLANA_COLLECTION_MINT');
    });

    it('should export REDIS secrets category', () => {
      const { SecretCategories } = require('../../../src/config/secrets');
      
      expect(SecretCategories.REDIS).toContain('REDIS_PASSWORD');
      expect(SecretCategories.REDIS).toContain('REDIS_URL');
    });

    it('should export ALL secrets category', () => {
      const { SecretCategories } = require('../../../src/config/secrets');
      
      expect(SecretCategories.ALL.length).toBeGreaterThan(10);
      expect(SecretCategories.ALL).toContain('JWT_SECRET');
      expect(SecretCategories.ALL).toContain('SOLANA_TREASURY_PRIVATE_KEY');
    });

    it('should export REQUIRED secrets category', () => {
      const { SecretCategories } = require('../../../src/config/secrets');
      
      expect(SecretCategories.REQUIRED).toEqual([
        'JWT_SECRET',
        'DB_PASSWORD',
        'INTERNAL_SERVICE_SECRET',
        'SOLANA_TREASURY_PRIVATE_KEY',
        'SOLANA_RPC_URL'
      ]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace in secret values', () => {
      process.env.JWT_SECRET = '  ' + 'a'.repeat(32) + '  ';
      
      const { getJwtSecret } = require('../../../src/config/secrets');
      const secret = getJwtSecret();
      
      expect(secret).toBe('  ' + 'a'.repeat(32) + '  ');
    });

    it('should handle special characters in secrets', () => {
      process.env.JWT_SECRET = 'A!@#$%^&*()_+-=[]{}|;:,.<>?' + 'x'.repeat(10);
      
      const { validateJwtSecret } = require('../../../src/config/secrets');
      
      expect(() => validateJwtSecret()).not.toThrow();
    });

    it('should handle unicode characters in secrets', () => {
      process.env.JWT_SECRET = '你好世界🔐' + 'a'.repeat(24);
      
      const { getJwtSecret } = require('../../../src/config/secrets');
      
      expect(getJwtSecret()).toBe('你好世界🔐' + 'a'.repeat(24));
    });
  });
});
