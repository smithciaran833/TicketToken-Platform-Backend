/**
 * Unit Tests for Configuration Validation
 * Tests config validation, fail-fast behavior, and transformers
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

import {
  validateConfig,
  validateAndFail,
  getConfigValue,
  ConfigTransformers
} from '../../../src/config/validate';

describe('Configuration Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // Helper to set all required env vars
  const setValidConfig = () => {
    process.env.DATABASE_URL = 'postgresql://localhost:5432/testdb';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'this-is-a-very-long-jwt-secret-key-for-testing';
    process.env.INTERNAL_SERVICE_SECRET = 'this-is-a-very-long-internal-secret-for-testing';
    process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1234567890';
    process.env.BLOCKCHAIN_SERVICE_URL = 'http://localhost:3005';
    process.env.TICKET_SERVICE_URL = 'http://localhost:3002';
  };

  describe('validateConfig', () => {
    it('should return valid when all required config is present', () => {
      setValidConfig();
      
      const result = validateConfig();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required config', () => {
      // Don't set any env vars
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('DATABASE_URL'))).toBe(true);
    });

    it('should validate DATABASE_URL format', () => {
      setValidConfig();
      process.env.DATABASE_URL = 'mysql://localhost:3306/db';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('DATABASE_URL'))).toBe(true);
    });

    it('should validate REDIS_URL format', () => {
      setValidConfig();
      process.env.REDIS_URL = 'memcached://localhost:11211';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('REDIS_URL'))).toBe(true);
    });

    it('should validate JWT_SECRET minimum length', () => {
      setValidConfig();
      process.env.JWT_SECRET = 'short';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('JWT_SECRET'))).toBe(true);
    });

    it('should validate INTERNAL_SERVICE_SECRET minimum length', () => {
      setValidConfig();
      process.env.INTERNAL_SERVICE_SECRET = 'short';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('INTERNAL_SERVICE_SECRET'))).toBe(true);
    });

    it('should validate STRIPE_SECRET_KEY format', () => {
      setValidConfig();
      process.env.STRIPE_SECRET_KEY = 'pk_test_wrong_prefix';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('STRIPE_SECRET_KEY'))).toBe(true);
    });

    it('should validate STRIPE_WEBHOOK_SECRET format', () => {
      setValidConfig();
      process.env.STRIPE_WEBHOOK_SECRET = 'wrong_prefix_1234567890';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('STRIPE_WEBHOOK_SECRET'))).toBe(true);
    });

    it('should validate service URL formats', () => {
      setValidConfig();
      process.env.BLOCKCHAIN_SERVICE_URL = 'not-a-url';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('BLOCKCHAIN_SERVICE_URL'))).toBe(true);
    });

    it('should use default values for optional config', () => {
      setValidConfig();
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.LOG_LEVEL;
      
      const result = validateConfig();
      
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('NODE_ENV'))).toBe(true);
      expect(result.config.NODE_ENV).toBe('development');
      expect(result.config.PORT).toBe('3006');
      expect(result.config.LOG_LEVEL).toBe('info');
    });

    it('should validate NODE_ENV values', () => {
      setValidConfig();
      process.env.NODE_ENV = 'invalid-env';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('NODE_ENV'))).toBe(true);
    });

    it('should validate PORT as numeric', () => {
      setValidConfig();
      process.env.PORT = 'not-a-number';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('PORT'))).toBe(true);
    });

    it('should validate PORT range', () => {
      setValidConfig();
      process.env.PORT = '99999';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('PORT'))).toBe(true);
    });

    it('should validate LOG_LEVEL values', () => {
      setValidConfig();
      process.env.LOG_LEVEL = 'verbose';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('LOG_LEVEL'))).toBe(true);
    });

    it('should validate RATE_LIMIT_MAX as positive number', () => {
      setValidConfig();
      process.env.RATE_LIMIT_MAX = '-10';
      
      const result = validateConfig();
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('RATE_LIMIT_MAX'))).toBe(true);
    });

    it('should not include sensitive values in warnings', () => {
      setValidConfig();
      delete process.env.LOG_LEVEL;
      
      const result = validateConfig();
      
      // Should not contain actual sensitive values
      result.warnings.forEach(w => {
        expect(w).not.toContain('sk_');
        expect(w).not.toContain('whsec_');
      });
    });
  });

  describe('validateAndFail', () => {
    it('should return config when valid', () => {
      setValidConfig();
      
      const config = validateAndFail();
      
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should throw in production when config is invalid', () => {
      process.env.NODE_ENV = 'production';
      
      expect(() => validateAndFail()).toThrow('Configuration validation failed');
    });

    it('should not throw in development when config is invalid', () => {
      process.env.NODE_ENV = 'development';
      
      expect(() => validateAndFail()).not.toThrow();
    });

    it('should log warnings for default values', () => {
      setValidConfig();
      delete process.env.LOG_LEVEL;
      
      const { logger } = require('../../../src/utils/logger');
      const mockChild = logger.child();
      
      validateAndFail();
      
      expect(mockChild.warn).toHaveBeenCalled();
    });

    it('should log errors for invalid config', () => {
      process.env.NODE_ENV = 'development';
      const { logger } = require('../../../src/utils/logger');
      const mockChild = logger.child();
      
      validateAndFail();
      
      expect(mockChild.error).toHaveBeenCalled();
    });

    it('should log success for valid config', () => {
      setValidConfig();
      
      const { logger } = require('../../../src/utils/logger');
      const mockChild = logger.child();
      
      validateAndFail();
      
      expect(mockChild.info).toHaveBeenCalledWith(
        'Configuration validation passed',
        expect.any(Object)
      );
    });
  });

  describe('getConfigValue', () => {
    it('should return value when present', () => {
      process.env.TEST_KEY = 'test-value';
      
      const value = getConfigValue('TEST_KEY');
      
      expect(value).toBe('test-value');
    });

    it('should throw when value is missing and no default', () => {
      delete process.env.MISSING_KEY;
      
      expect(() => getConfigValue('MISSING_KEY')).toThrow('Missing required configuration');
    });

    it('should return default when value is missing', () => {
      delete process.env.MISSING_KEY;
      
      const value = getConfigValue('MISSING_KEY', undefined, 'default-value');
      
      expect(value).toBe('default-value');
    });

    it('should apply transform function', () => {
      process.env.NUMBER_KEY = '42';
      
      const value = getConfigValue('NUMBER_KEY', parseInt);
      
      expect(value).toBe(42);
    });

    it('should apply transform with default', () => {
      delete process.env.MISSING_NUMBER;
      
      const value = getConfigValue('MISSING_NUMBER', parseInt, 100);
      
      expect(value).toBe(100);
    });
  });

  describe('ConfigTransformers', () => {
    describe('toInt', () => {
      it('should parse integer string', () => {
        expect(ConfigTransformers.toInt('42')).toBe(42);
      });

      it('should handle negative numbers', () => {
        expect(ConfigTransformers.toInt('-10')).toBe(-10);
      });

      it('should return NaN for invalid input', () => {
        expect(ConfigTransformers.toInt('not-a-number')).toBeNaN();
      });
    });

    describe('toFloat', () => {
      it('should parse float string', () => {
        expect(ConfigTransformers.toFloat('3.14')).toBeCloseTo(3.14);
      });

      it('should handle integers', () => {
        expect(ConfigTransformers.toFloat('42')).toBe(42);
      });

      it('should handle scientific notation', () => {
        expect(ConfigTransformers.toFloat('1e10')).toBe(1e10);
      });
    });

    describe('toBool', () => {
      it('should parse "true" as true', () => {
        expect(ConfigTransformers.toBool('true')).toBe(true);
      });

      it('should parse "TRUE" as true', () => {
        expect(ConfigTransformers.toBool('TRUE')).toBe(true);
      });

      it('should parse "1" as true', () => {
        expect(ConfigTransformers.toBool('1')).toBe(true);
      });

      it('should parse "false" as false', () => {
        expect(ConfigTransformers.toBool('false')).toBe(false);
      });

      it('should parse "0" as false', () => {
        expect(ConfigTransformers.toBool('0')).toBe(false);
      });

      it('should parse anything else as false', () => {
        expect(ConfigTransformers.toBool('anything')).toBe(false);
      });
    });

    describe('toArray', () => {
      it('should split by comma by default', () => {
        expect(ConfigTransformers.toArray('a,b,c')).toEqual(['a', 'b', 'c']);
      });

      it('should trim whitespace', () => {
        expect(ConfigTransformers.toArray(' a , b , c ')).toEqual(['a', 'b', 'c']);
      });

      it('should use custom delimiter', () => {
        expect(ConfigTransformers.toArray('a|b|c', '|')).toEqual(['a', 'b', 'c']);
      });

      it('should return single element array for no delimiter', () => {
        expect(ConfigTransformers.toArray('single')).toEqual(['single']);
      });
    });

    describe('toUrl', () => {
      it('should parse valid URL', () => {
        const url = ConfigTransformers.toUrl('https://example.com/path');
        
        expect(url.protocol).toBe('https:');
        expect(url.host).toBe('example.com');
        expect(url.pathname).toBe('/path');
      });

      it('should throw for invalid URL', () => {
        expect(() => ConfigTransformers.toUrl('not-a-url')).toThrow();
      });

      it('should parse URL with port', () => {
        const url = ConfigTransformers.toUrl('http://localhost:3000');
        
        expect(url.port).toBe('3000');
      });

      it('should parse URL with query string', () => {
        const url = ConfigTransformers.toUrl('http://example.com?foo=bar');
        
        expect(url.searchParams.get('foo')).toBe('bar');
      });
    });
  });
});
