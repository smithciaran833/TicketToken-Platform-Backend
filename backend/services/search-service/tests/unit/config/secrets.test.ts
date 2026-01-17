// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/config/secrets.ts
 */

// Create virtual mocks for shared modules
const mockSecretsManager = {
  getSecrets: jest.fn().mockResolvedValue({
    'postgres-password-key': 'secret-pass',
    'postgres-user-key': 'secret-user',
    'postgres-db-key': 'secret-db',
    'redis-password-key': 'secret-redis'
  })
};

const mockSecretsConfig = {
  POSTGRES_PASSWORD: 'postgres-password-key',
  POSTGRES_USER: 'postgres-user-key',
  POSTGRES_DB: 'postgres-db-key',
  REDIS_PASSWORD: 'redis-password-key'
};

jest.mock('dotenv', () => ({
  config: jest.fn()
}));

jest.mock('path', () => ({
  resolve: jest.fn().mockReturnValue('/resolved/path/.env')
}));

// Mock the shared modules with absolute paths
jest.mock(require.resolve('../../../../../shared/utils/secrets-manager', { paths: [__dirname] }), () => ({
  secretsManager: mockSecretsManager
}), { virtual: true });

jest.mock(require.resolve('../../../../../shared/config/secrets.config', { paths: [__dirname] }), () => ({
  SECRETS_CONFIG: mockSecretsConfig
}), { virtual: true });

describe('src/config/secrets.ts - Comprehensive Unit Tests', () => {
  let dotenv: any;
  let path: any;
  const originalEnv = process.env;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    console.log = jest.fn();
    console.error = jest.fn();

    // Reset mock implementations
    mockSecretsManager.getSecrets.mockResolvedValue({
      'postgres-password-key': 'secret-pass',
      'postgres-user-key': 'secret-user',
      'postgres-db-key': 'secret-db',
      'redis-password-key': 'secret-redis'
    });

    // Get mocked modules
    dotenv = require('dotenv');
    path = require('path');
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  // =============================================================================
  // Module Initialization
  // =============================================================================

  describe('Module Initialization', () => {
    it('should call dotenv.config on import', () => {
      require('../../../src/config/secrets');

      expect(dotenv.config).toHaveBeenCalled();
    });

    it('should resolve correct path for .env', () => {
      require('../../../src/config/secrets');

      expect(path.resolve).toHaveBeenCalledWith(
        expect.any(String),
        '../../../../.env'
      );
    });

    it('should pass resolved path to dotenv.config', () => {
      require('../../../src/config/secrets');

      expect(dotenv.config).toHaveBeenCalledWith({
        path: '/resolved/path/.env'
      });
    });

    it('should call dotenv.config before loadSecrets export', () => {
      const module = require('../../../src/config/secrets');

      expect(dotenv.config).toHaveBeenCalled();
      expect(module.loadSecrets).toBeDefined();
    });
  });

  // =============================================================================
  // loadSecrets() - Success Cases
  // =============================================================================

  describe('loadSecrets() - Success Cases', () => {
    it('should return secrets object', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      const result = await loadSecrets();

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should call getSecrets with common secrets array', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(mockSecretsManager.getSecrets).toHaveBeenCalledWith([
        'postgres-password-key',
        'postgres-user-key',
        'postgres-db-key',
        'redis-password-key'
      ]);
    });

    it('should return secrets from secretsManager', async () => {
      const mockSecrets = { key: 'value' };
      mockSecretsManager.getSecrets.mockResolvedValue(mockSecrets);

      const { loadSecrets } = require('../../../src/config/secrets');
      const result = await loadSecrets();

      expect(result).toBe(mockSecrets);
    });

    it('should log loading message', async () => {
      process.env.SERVICE_NAME = 'test-service';
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(console.log).toHaveBeenCalledWith('[test-service] Loading secrets...');
    });

    it('should log success message', async () => {
      process.env.SERVICE_NAME = 'test-service';
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(console.log).toHaveBeenCalledWith('[test-service] ✅ Secrets loaded successfully');
    });

    it('should use default service name when not set', async () => {
      delete process.env.SERVICE_NAME;
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(console.log).toHaveBeenCalledWith('[unknown-service] Loading secrets...');
    });

    it('should log with correct service name', async () => {
      process.env.SERVICE_NAME = 'search-service';
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(console.log).toHaveBeenCalledWith('[search-service] Loading secrets...');
      expect(console.log).toHaveBeenCalledWith('[search-service] ✅ Secrets loaded successfully');
    });
  });

  // =============================================================================
  // loadSecrets() - Common Secrets Array
  // =============================================================================

  describe('loadSecrets() - Common Secrets Array', () => {
    it('should include POSTGRES_PASSWORD', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      const callArgs = mockSecretsManager.getSecrets.mock.calls[0][0];
      expect(callArgs).toContain('postgres-password-key');
    });

    it('should include POSTGRES_USER', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      const callArgs = mockSecretsManager.getSecrets.mock.calls[0][0];
      expect(callArgs).toContain('postgres-user-key');
    });

    it('should include POSTGRES_DB', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      const callArgs = mockSecretsManager.getSecrets.mock.calls[0][0];
      expect(callArgs).toContain('postgres-db-key');
    });

    it('should include REDIS_PASSWORD', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      const callArgs = mockSecretsManager.getSecrets.mock.calls[0][0];
      expect(callArgs).toContain('redis-password-key');
    });

    it('should have exactly 4 common secrets', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      const callArgs = mockSecretsManager.getSecrets.mock.calls[0][0];
      expect(callArgs).toHaveLength(4);
    });

    it('should pass array in correct order', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      const callArgs = mockSecretsManager.getSecrets.mock.calls[0][0];
      expect(callArgs).toEqual([
        'postgres-password-key',
        'postgres-user-key',
        'postgres-db-key',
        'redis-password-key'
      ]);
    });
  });

  // =============================================================================
  // loadSecrets() - Error Cases
  // =============================================================================

  describe('loadSecrets() - Error Cases', () => {
    it('should handle getSecrets errors', async () => {
      const error = new Error('Secrets fetch failed');
      mockSecretsManager.getSecrets.mockRejectedValue(error);

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should log error message', async () => {
      const error = new Error('Secrets fetch failed');
      mockSecretsManager.getSecrets.mockRejectedValue(error);
      process.env.SERVICE_NAME = 'test-service';

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        '[test-service] ❌ Failed to load secrets:',
        'Secrets fetch failed'
      );
    });

    it('should throw descriptive error', async () => {
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Error'));

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should log error with service name', async () => {
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Test error'));
      process.env.SERVICE_NAME = 'my-service';

      const { loadSecrets } = require('../../../src/config/secrets');

      try {
        await loadSecrets();
      } catch (e) {}

      expect(console.error).toHaveBeenCalledWith(
        '[my-service] ❌ Failed to load secrets:',
        'Test error'
      );
    });

    it('should log error with default service name', async () => {
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Error message'));
      delete process.env.SERVICE_NAME;

      const { loadSecrets } = require('../../../src/config/secrets');

      try {
        await loadSecrets();
      } catch (e) {}

      expect(console.error).toHaveBeenCalledWith(
        '[unknown-service] ❌ Failed to load secrets:',
        'Error message'
      );
    });

    it('should extract error message from error object', async () => {
      const error = new Error('Connection timeout');
      mockSecretsManager.getSecrets.mockRejectedValue(error);

      const { loadSecrets } = require('../../../src/config/secrets');

      try {
        await loadSecrets();
      } catch (e) {}

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        'Connection timeout'
      );
    });

    it('should handle network errors', async () => {
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Network error'));

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow();
    });

    it('should handle authentication errors', async () => {
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Authentication failed'));

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Request timeout'));

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow();
    });

    it('should not return secrets on error', async () => {
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Error'));

      const { loadSecrets } = require('../../../src/config/secrets');

      try {
        await loadSecrets();
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toBe('Cannot start service without required secrets');
      }
    });
  });

  // =============================================================================
  // Service Name Handling
  // =============================================================================

  describe('Service Name Handling', () => {
    it('should use SERVICE_NAME from environment', async () => {
      process.env.SERVICE_NAME = 'custom-service';
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(console.log).toHaveBeenCalledWith('[custom-service] Loading secrets...');
    });

    it('should default to unknown-service', async () => {
      delete process.env.SERVICE_NAME;
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(console.log).toHaveBeenCalledWith('[unknown-service] Loading secrets...');
    });

    it('should handle empty SERVICE_NAME', async () => {
      process.env.SERVICE_NAME = '';
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      // Empty string is falsy, should default to unknown-service
      expect(console.log).toHaveBeenCalledWith('[unknown-service] Loading secrets...');
    });

    it('should use SERVICE_NAME in success log', async () => {
      process.env.SERVICE_NAME = 'prod-service';
      const { loadSecrets } = require('../../../src/config/secrets');

      await loadSecrets();

      expect(console.log).toHaveBeenCalledWith('[prod-service] ✅ Secrets loaded successfully');
    });

    it('should use SERVICE_NAME in error log', async () => {
      process.env.SERVICE_NAME = 'error-service';
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('Failed'));

      const { loadSecrets } = require('../../../src/config/secrets');

      try {
        await loadSecrets();
      } catch (e) {}

      expect(console.error).toHaveBeenCalledWith(
        '[error-service] ❌ Failed to load secrets:',
        'Failed'
      );
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export loadSecrets function', () => {
      const module = require('../../../src/config/secrets');

      expect(module.loadSecrets).toBeDefined();
      expect(typeof module.loadSecrets).toBe('function');
    });

    it('should return a promise from loadSecrets', () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      const result = loadSecrets();

      expect(result).toBeInstanceOf(Promise);
    });

    it('should be async function', () => {
      const { loadSecrets } = require('../../../src/config/secrets');

      expect(loadSecrets.constructor.name).toBe('AsyncFunction');
    });
  });
});
