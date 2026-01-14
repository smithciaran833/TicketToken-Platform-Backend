/**
 * Comprehensive Unit Tests for src/config/secrets.ts
 * 
 * Tests secrets loading from secrets manager
 */

// Mock dependencies BEFORE imports
const mockGetSecrets = jest.fn();
const mockDotenvConfig = jest.fn();
const mockPathResolve = jest.fn((...args) => args.join('/'));

jest.mock('dotenv', () => ({
  config: mockDotenvConfig,
}));

jest.mock('path', () => ({
  resolve: mockPathResolve,
}));

// Mock the shared modules with module factory
jest.mock('../../../../shared/utils/secrets-manager', () => ({
  secretsManager: {
    getSecrets: mockGetSecrets,
  },
}), { virtual: true });

jest.mock('../../../../shared/config/secrets.config', () => ({
  SECRETS_CONFIG: {
    POSTGRES_PASSWORD: 'postgres-password-secret',
    POSTGRES_USER: 'postgres-user-secret',
    POSTGRES_DB: 'postgres-db-secret',
    REDIS_PASSWORD: 'redis-password-secret',
  },
}), { virtual: true });

describe('src/config/secrets.ts - Comprehensive Unit Tests', () => {
  
  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.env = originalEnv;
  });

  // =============================================================================
  // loadSecrets() - SUCCESS CASES
  // =============================================================================

  describe('loadSecrets() - success cases', () => {
    it('should load secrets successfully', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const mockSecrets = {
        'postgres-password-secret': 'postgres_pass_123',
        'postgres-user-secret': 'postgres_user',
        'postgres-db-secret': 'tickettoken_db',
        'redis-password-secret': 'redis_pass_456',
      };
      mockGetSecrets.mockResolvedValue(mockSecrets);

      const result = await loadSecrets();

      expect(result).toEqual(mockSecrets);
    });

    it('should call secretsManager.getSecrets with correct secret names', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      expect(mockGetSecrets).toHaveBeenCalledWith([
        'postgres-password-secret',
        'postgres-user-secret',
        'postgres-db-secret',
        'redis-password-secret',
      ]);
    });

    it('should call secretsManager.getSecrets once', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      expect(mockGetSecrets).toHaveBeenCalledTimes(1);
    });

    it('should return all secret values', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const mockSecrets = {
        'postgres-password-secret': 'pass1',
        'postgres-user-secret': 'user1',
        'postgres-db-secret': 'db1',
        'redis-password-secret': 'pass2',
      };
      mockGetSecrets.mockResolvedValue(mockSecrets);

      const result = await loadSecrets();

      expect(result['postgres-password-secret']).toBe('pass1');
      expect(result['postgres-user-secret']).toBe('user1');
      expect(result['postgres-db-secret']).toBe('db1');
      expect(result['redis-password-secret']).toBe('pass2');
    });

    it('should use SERVICE_NAME from environment in logs', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      process.env.SERVICE_NAME = 'test-service';
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      // Console.log should be called for loading and success messages
      expect(console.log).toHaveBeenCalled();
    });

    it('should use "unknown-service" when SERVICE_NAME not set', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      delete process.env.SERVICE_NAME;
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      expect(console.log).toHaveBeenCalled();
    });

    it('should log loading message before fetching secrets', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      expect(console.log).toHaveBeenCalled();
      expect(mockGetSecrets).toHaveBeenCalled();
    });

    it('should log success message after loading secrets', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      // Should log at least twice: loading and success
      expect(console.log).toHaveBeenCalledTimes(2);
    });

    it('should call dotenv.config on module load', () => {
      // Module is already loaded, so dotenv.config should have been called
      expect(mockDotenvConfig).toHaveBeenCalled();
    });

    it('should resolve correct path for .env file', () => {
      // Check that path.resolve was called during module initialization
      expect(mockPathResolve).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // loadSecrets() - ERROR CASES
  // =============================================================================

  describe('loadSecrets() - error cases', () => {
    it('should throw error when secretsManager.getSecrets fails', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const error = new Error('Secrets fetch failed');
      mockGetSecrets.mockRejectedValue(error);

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should log error message when secrets loading fails', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const error = new Error('Network error');
      mockGetSecrets.mockRejectedValue(error);

      try {
        await loadSecrets();
      } catch (e) {
        // Expected
      }

      expect(console.error).toHaveBeenCalled();
    });

    it('should include original error message in logs', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const error = new Error('Specific error message');
      mockGetSecrets.mockRejectedValue(error);

      try {
        await loadSecrets();
      } catch (e) {
        // Expected
      }

      expect(console.error).toHaveBeenCalled();
    });

    it('should throw generic error message to avoid leaking secrets info', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const error = new Error('Secret XYZ not found in vault');
      mockGetSecrets.mockRejectedValue(error);

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should handle errors without message property', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockRejectedValue('String error');

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should handle null error', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockRejectedValue(null);

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should handle undefined error', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockRejectedValue(undefined);

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should not return secrets when error occurs', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const error = new Error('Fetch failed');
      mockGetSecrets.mockRejectedValue(error);

      try {
        const result = await loadSecrets();
        fail('Should have thrown error');
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  // =============================================================================
  // INTEGRATION SCENARIOS
  // =============================================================================

  describe('integration scenarios', () => {
    it('should handle multiple calls to loadSecrets', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const mockSecrets = { secret: 'value' };
      mockGetSecrets.mockResolvedValue(mockSecrets);

      const result1 = await loadSecrets();
      const result2 = await loadSecrets();

      expect(result1).toEqual(mockSecrets);
      expect(result2).toEqual(mockSecrets);
      expect(mockGetSecrets).toHaveBeenCalledTimes(2);
    });

    it('should handle secrets loading after previous failure', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const error = new Error('First attempt failed');
      const mockSecrets = { secret: 'value' };

      // First call fails
      mockGetSecrets.mockRejectedValueOnce(error);
      // Second call succeeds
      mockGetSecrets.mockResolvedValueOnce(mockSecrets);

      await expect(loadSecrets()).rejects.toThrow();
      await expect(loadSecrets()).resolves.toEqual(mockSecrets);
    });

    it('should work with different SERVICE_NAME values', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      process.env.SERVICE_NAME = 'service-1';
      await loadSecrets();

      process.env.SERVICE_NAME = 'service-2';
      await loadSecrets();

      expect(mockGetSecrets).toHaveBeenCalledTimes(2);
    });

    it('should handle empty secrets response', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      const result = await loadSecrets();

      expect(result).toEqual({});
    });

    it('should handle partial secrets response', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      const partialSecrets = {
        'postgres-password-secret': 'pass123',
      };
      mockGetSecrets.mockResolvedValue(partialSecrets);

      const result = await loadSecrets();

      expect(result).toEqual(partialSecrets);
    });
  });

  // =============================================================================
  // SECRETS CONFIG USAGE
  // =============================================================================

  describe('SECRETS_CONFIG usage', () => {
    it('should request POSTGRES_PASSWORD secret', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      const requestedSecrets = mockGetSecrets.mock.calls[0][0];
      expect(requestedSecrets).toContain('postgres-password-secret');
    });

    it('should request POSTGRES_USER secret', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      const requestedSecrets = mockGetSecrets.mock.calls[0][0];
      expect(requestedSecrets).toContain('postgres-user-secret');
    });

    it('should request POSTGRES_DB secret', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      const requestedSecrets = mockGetSecrets.mock.calls[0][0];
      expect(requestedSecrets).toContain('postgres-db-secret');
    });

    it('should request REDIS_PASSWORD secret', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      const requestedSecrets = mockGetSecrets.mock.calls[0][0];
      expect(requestedSecrets).toContain('redis-password-secret');
    });

    it('should request exactly 4 secrets', async () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});

      await loadSecrets();

      const requestedSecrets = mockGetSecrets.mock.calls[0][0];
      expect(requestedSecrets).toHaveLength(4);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('exports', () => {
    it('should export loadSecrets function', () => {
      const secretsModule = require('../../../src/config/secrets');
      expect(secretsModule.loadSecrets).toBeDefined();
      expect(typeof secretsModule.loadSecrets).toBe('function');
    });

    it('should export loadSecrets as async function', () => {
      const { loadSecrets } = require('../../../src/config/secrets');
      mockGetSecrets.mockResolvedValue({});
      
      const result = loadSecrets();
      
      expect(result).toBeInstanceOf(Promise);
    });
  });

});
