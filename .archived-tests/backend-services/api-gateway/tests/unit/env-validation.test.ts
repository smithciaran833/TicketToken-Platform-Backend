import { validateEnv, logSanitizedConfig } from '../../src/config/env-validation';

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Development Environment', () => {
    it('should validate all required environment variables', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!';
      
      const config = validateEnv();
      
      expect(config.NODE_ENV).toBe('development');
      expect(config.JWT_SECRET).toBe('test-secret-key-at-least-32-characters-long!');
    });

    it('should provide defaults for optional variables', () => {
      process.env.NODE_ENV = 'development';
      
      const config = validateEnv();
      
      expect(config.PORT).toBe(3000);
      expect(config.HOST).toBe('0.0.0.0');
      expect(config.LOG_LEVEL).toBe('info');
    });

    it('should fail if JWT_SECRET is too short', () => {
      process.env.JWT_SECRET = 'short';
      
      expect(() => validateEnv()).toThrow();
    });

    it('should fail if service URLs are invalid', () => {
      process.env.AUTH_SERVICE_URL = 'not-a-url';
      
      expect(() => validateEnv()).toThrow();
    });
  });

  describe('Production Environment', () => {
    it('should enforce stronger validation in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'default';
      
      // Should fail - can't use default secret in production
      expect(() => validateEnv()).toThrow();
    });

    it('should require Redis password in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'production-secret-key-at-least-32-chars!';
      delete process.env.REDIS_PASSWORD;
      
      expect(() => validateEnv()).toThrow();
    });

    it('should validate all 19 service URLs are present', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.MINTING_SERVICE_URL;
      
      expect(() => validateEnv()).toThrow('MINTING_SERVICE_URL');
    });
  });

  describe('logSanitizedConfig', () => {
    it('should not expose JWT_SECRET in logs', () => {
      const config = validateEnv();
      const consoleSpy = jest.spyOn(console, 'log');
      
      logSanitizedConfig(config);
      
      const logOutput = JSON.stringify(consoleSpy.mock.calls);
      expect(logOutput).not.toContain(config.JWT_SECRET);
    });

    it('should indicate if Redis password is set without exposing it', () => {
      process.env.REDIS_PASSWORD = 'secret-password';
      const config = validateEnv();
      const consoleSpy = jest.spyOn(console, 'log');
      
      logSanitizedConfig(config);
      
      const logOutput = JSON.stringify(consoleSpy.mock.calls);
      expect(logOutput).toContain('passwordSet');
      expect(logOutput).not.toContain('secret-password');
    });
  });
});
