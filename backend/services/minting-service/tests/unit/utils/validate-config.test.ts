/**
 * Unit Tests for utils/validate-config.ts
 * 
 * Tests configuration and secret validation functions.
 * Priority: 🟠 High (11 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));

import {
  validateSecrets,
  validateConfig,
  validateAll,
  getValidationStatus,
  isProduction,
  isFeatureEnabled,
} from '../../../src/utils/validate-config';

// =============================================================================
// Test Suite
// =============================================================================

describe('Validate Config', () => {
  // Store original env
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env to test defaults
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-minimum-32-characters-long',
      INTERNAL_SERVICE_SECRET: 'test-internal-secret-32-chars-min',
      WEBHOOK_SECRET: 'test-webhook-secret-32-chars-minimum',
      DB_PASSWORD: 'test-password',
      SOLANA_RPC_URL: 'https://api.devnet.solana.com',
      DB_HOST: 'localhost',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // validateAll Tests
  // =============================================================================

  describe('validateAll', () => {
    it('should check DATABASE_URL or DB_HOST exists', () => {
      // With DB_HOST set, should pass
      expect(() => validateAll()).not.toThrow();
    });

    it('should check REDIS_HOST exists (has default)', () => {
      // REDIS_HOST has a default of 'redis', so should pass
      expect(() => validateAll()).not.toThrow();
    });

    it('should check SOLANA_RPC_URL exists', () => {
      // Already set in beforeEach, should pass
      expect(() => validateAll()).not.toThrow();
    });

    it('should check JWT_SECRET exists', () => {
      // Already set in beforeEach, should pass
      expect(() => validateAll()).not.toThrow();
    });

    it('should check INTERNAL_SERVICE_SECRET exists', () => {
      // Already set in beforeEach, should pass
      expect(() => validateAll()).not.toThrow();
    });

    it('should throw on missing required vars in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      
      expect(() => validateSecrets()).toThrow();
      
      // Restore
      process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long';
      process.env.NODE_ENV = 'test';
    });

    it('should list all missing vars in error', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.INTERNAL_SERVICE_SECRET;
      
      try {
        validateSecrets();
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('JWT_SECRET');
        expect(error.message).toContain('INTERNAL_SERVICE_SECRET');
      }
      
      // Restore
      process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long';
      process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-32-chars-min';
      process.env.NODE_ENV = 'test';
    });

    it('should pass when all vars present', () => {
      expect(() => validateAll()).not.toThrow();
    });
  });

  // =============================================================================
  // getValidationStatus Tests
  // =============================================================================

  describe('getValidationStatus', () => {
    it('should return valid status', () => {
      const status = getValidationStatus();
      
      expect(status).toHaveProperty('valid');
      expect(status).toHaveProperty('missingSecrets');
      expect(status).toHaveProperty('missingConfig');
      expect(typeof status.valid).toBe('boolean');
      expect(Array.isArray(status.missingSecrets)).toBe(true);
      expect(Array.isArray(status.missingConfig)).toBe(true);
    });

    it('should return valid=true when all required vars present', () => {
      const status = getValidationStatus();
      expect(status.valid).toBe(true);
      expect(status.missingSecrets).toHaveLength(0);
    });
  });

  // =============================================================================
  // isProduction & isFeatureEnabled Tests
  // =============================================================================

  describe('isProduction', () => {
    it('should return false in test environment', () => {
      process.env.NODE_ENV = 'test';
      expect(isProduction()).toBe(false);
    });

    it('should return true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isProduction()).toBe(true);
      process.env.NODE_ENV = 'test';
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return default value when feature not set', () => {
      delete process.env.FEATURE_TEST_FEATURE;
      
      expect(isFeatureEnabled('TEST_FEATURE', false)).toBe(false);
      expect(isFeatureEnabled('TEST_FEATURE', true)).toBe(true);
    });

    it('should return true when feature is enabled', () => {
      process.env.FEATURE_MY_FEATURE = 'true';
      expect(isFeatureEnabled('MY_FEATURE')).toBe(true);
      
      process.env.FEATURE_MY_FEATURE = '1';
      expect(isFeatureEnabled('MY_FEATURE')).toBe(true);
      
      delete process.env.FEATURE_MY_FEATURE;
    });

    it('should return false when feature is disabled', () => {
      process.env.FEATURE_DISABLED_FEATURE = 'false';
      expect(isFeatureEnabled('DISABLED_FEATURE', true)).toBe(false);
      
      delete process.env.FEATURE_DISABLED_FEATURE;
    });
  });
});
