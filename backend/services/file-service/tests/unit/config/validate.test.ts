// Mock dependencies
jest.mock('../../../src/utils/logger');

describe('config/validate', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let processExitSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Mock process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`Process.exit called with code ${code}`);
    }) as any);
    
    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Clear module cache
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    
    // Restore mocks
    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('validateConfig', () => {
    it('should return valid when all required config is set', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow JWT_PUBLIC_KEY instead of JWT_SECRET', () => {
      process.env.JWT_PUBLIC_KEY = 'public-key-content';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should add error when neither JWT_SECRET nor JWT_PUBLIC_KEY is set in non-test mode', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.JWT_PUBLIC_KEY;
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      jest.resetModules();
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('AUTH: JWT_SECRET or JWT_PUBLIC_KEY must be set');
    });

    it('should warn when JWT_SECRET is too short', () => {
      process.env.JWT_SECRET = 'short';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.warnings).toContain('AUTH: JWT_SECRET should be at least 32 characters for security');
    });

    it('should add error when DATABASE_URL is not set in non-test mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32);
      delete process.env.DATABASE_URL;
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      jest.resetModules();
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DATABASE: DATABASE_URL must be set (no defaults allowed)');
    });

    it('should add error when DATABASE_URL is invalid', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'invalid-url';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DATABASE: DATABASE_URL must be a valid PostgreSQL connection string');
    });

    it('should accept postgres:// protocol', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should accept postgresql:// protocol', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(true);
    });

    it('should warn about default credentials', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.warnings.some((w: string) => w.includes('default credentials'))).toBe(true);
    });

    it('should add error when S3_BUCKET is not set in non-test mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      delete process.env.S3_BUCKET;
      process.env.AWS_REGION = 'us-east-1';
      
      jest.resetModules();
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('STORAGE: S3_BUCKET must be set');
    });

    it('should warn when REDIS_HOST is not set', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      delete process.env.REDIS_HOST;
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.warnings).toContain('CACHE: REDIS_HOST not set - rate limiting will be in-memory only');
    });

    it('should warn when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      jest.resetModules();
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.warnings).toContain('ENV: NODE_ENV not set - defaulting to development');
    });

    it('should add error when PORT is invalid', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      process.env.PORT = 'invalid';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SERVER: PORT must be a valid port number (1-65535)');
    });

    it('should add error when PORT is out of range', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      process.env.PORT = '70000';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SERVER: PORT must be a valid port number (1-65535)');
    });

    it('should accept valid PORT', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      process.env.PORT = '3000';
      
      const { validateConfig } = require('../../../src/config/validate');
      const result = validateConfig();

      expect(result.valid).toBe(true);
    });
  });

  describe('validateConfigOrDie', () => {
    it('should not exit when config is valid', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.AWS_REGION = 'us-east-1';
      
      const { validateConfigOrDie } = require('../../../src/config/validate');
      
      expect(() => validateConfigOrDie()).not.toThrow();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should exit with code 1 when config is invalid', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.JWT_PUBLIC_KEY;
      delete process.env.DATABASE_URL;
      delete process.env.S3_BUCKET;
      
      jest.resetModules();
      const { validateConfigOrDie } = require('../../../src/config/validate');
      
      expect(() => validateConfigOrDie()).toThrow('Process.exit called with code 1');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log errors before exiting', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.JWT_PUBLIC_KEY;
      delete process.env.DATABASE_URL;
      
      jest.resetModules();
      const { validateConfigOrDie } = require('../../../src/config/validate');
      
      expect(() => validateConfigOrDie()).toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('getConfigStatus', () => {
    it('should return status for all config vars', () => {
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'test-bucket';
      
      const { getConfigStatus } = require('../../../src/config/validate');
      const status = getConfigStatus();

      expect(status).toHaveProperty('JWT_SECRET');
      expect(status).toHaveProperty('DATABASE_URL');
      expect(status).toHaveProperty('S3_BUCKET');
      expect(status.JWT_SECRET).toEqual({ set: true, valid: true });
    });

    it('should mark unset vars as not set', () => {
      delete process.env.JWT_SECRET;
      
      const { getConfigStatus } = require('../../../src/config/validate');
      const status = getConfigStatus();

      expect(status.JWT_SECRET).toEqual({ set: false, valid: false });
    });

    it('should mark invalid vars as invalid', () => {
      process.env.DATABASE_URL = 'invalid-url';
      
      const { getConfigStatus } = require('../../../src/config/validate');
      const status = getConfigStatus();

      expect(status.DATABASE_URL).toEqual({ set: true, valid: false });
    });
  });

  describe('getConfigSummary', () => {
    it('should mask sensitive values', () => {
      process.env.JWT_SECRET = 'super-secret';
      process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.S3_BUCKET = 'my-bucket';
      
      const { getConfigSummary } = require('../../../src/config/validate');
      const summary = getConfigSummary();

      expect(summary.JWT_SECRET).toBe('***masked***');
      expect(summary.AWS_SECRET_ACCESS_KEY).toBe('***masked***');
      expect(summary.DATABASE_URL).toBe('***masked***');
      expect(summary.S3_BUCKET).toBe('my-bucket');
    });

    it('should show (not set) for unset vars', () => {
      delete process.env.JWT_SECRET;
      
      const { getConfigSummary } = require('../../../src/config/validate');
      const summary = getConfigSummary();

      expect(summary.JWT_SECRET).toBe('(not set)');
    });

    it('should not mask non-sensitive values', () => {
      process.env.AWS_REGION = 'us-west-2';
      process.env.S3_BUCKET = 'public-bucket';
      
      const { getConfigSummary } = require('../../../src/config/validate');
      const summary = getConfigSummary();

      expect(summary.AWS_REGION).toBe('us-west-2');
      expect(summary.S3_BUCKET).toBe('public-bucket');
    });
  });
});
