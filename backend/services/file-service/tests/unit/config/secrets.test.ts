// Mock dependencies before importing
jest.mock('dotenv');
jest.mock('@tickettoken/shared', () => ({
  secretsManager: {
    getSecrets: jest.fn(),
  },
  SECRETS_CONFIG: {
    POSTGRES_PASSWORD: 'POSTGRES_PASSWORD',
    POSTGRES_USER: 'POSTGRES_USER',
    POSTGRES_DB: 'POSTGRES_DB',
    REDIS_PASSWORD: 'REDIS_PASSWORD',
  },
}));

describe('config/secrets', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Clear module cache
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    
    // Restore console
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('loadSecrets', () => {
    it('should load common secrets successfully', async () => {
      process.env.SERVICE_NAME = 'test-service';
      
      const mockSecrets = {
        POSTGRES_PASSWORD: 'test-password',
        POSTGRES_USER: 'test-user',
        POSTGRES_DB: 'test-db',
        REDIS_PASSWORD: 'test-redis-pass',
      };

      const { secretsManager } = require('@tickettoken/shared');
      secretsManager.getSecrets.mockResolvedValue(mockSecrets);

      const { loadSecrets } = require('../../../src/config/secrets');
      const secrets = await loadSecrets();

      expect(secretsManager.getSecrets).toHaveBeenCalledWith([
        'POSTGRES_PASSWORD',
        'POSTGRES_USER',
        'POSTGRES_DB',
        'REDIS_PASSWORD',
      ]);
      expect(secrets).toEqual(mockSecrets);
      expect(consoleLogSpy).toHaveBeenCalledWith('[test-service] Loading secrets...');
      expect(consoleLogSpy).toHaveBeenCalledWith('[test-service] ✅ Secrets loaded successfully');
    });

    it('should use default service name when SERVICE_NAME not set', async () => {
      delete process.env.SERVICE_NAME;
      
      const mockSecrets = {};
      const { secretsManager } = require('@tickettoken/shared');
      secretsManager.getSecrets.mockResolvedValue(mockSecrets);

      const { loadSecrets } = require('../../../src/config/secrets');
      await loadSecrets();

      expect(consoleLogSpy).toHaveBeenCalledWith('[unknown-service] Loading secrets...');
    });

    it('should throw error when secrets loading fails', async () => {
      process.env.SERVICE_NAME = 'test-service';
      
      const error = new Error('Secrets unavailable');
      const { secretsManager } = require('@tickettoken/shared');
      secretsManager.getSecrets.mockRejectedValue(error);

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[test-service] ❌ Failed to load secrets:',
        'Secrets unavailable'
      );
    });

    it('should handle errors without message property', async () => {
      process.env.SERVICE_NAME = 'test-service';
      
      const { secretsManager } = require('@tickettoken/shared');
      secretsManager.getSecrets.mockRejectedValue('String error');

      const { loadSecrets } = require('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });

    it('should request correct secret keys', async () => {
      const mockSecrets = {};
      const { secretsManager, SECRETS_CONFIG } = require('@tickettoken/shared');
      secretsManager.getSecrets.mockResolvedValue(mockSecrets);

      const { loadSecrets } = require('../../../src/config/secrets');
      await loadSecrets();

      expect(secretsManager.getSecrets).toHaveBeenCalledWith([
        SECRETS_CONFIG.POSTGRES_PASSWORD,
        SECRETS_CONFIG.POSTGRES_USER,
        SECRETS_CONFIG.POSTGRES_DB,
        SECRETS_CONFIG.REDIS_PASSWORD,
      ]);
    });

    it('should return secrets object', async () => {
      const mockSecrets = {
        POSTGRES_PASSWORD: 'pass123',
        POSTGRES_USER: 'user123',
        POSTGRES_DB: 'db123',
        REDIS_PASSWORD: 'redis123',
      };

      const { secretsManager } = require('@tickettoken/shared');
      secretsManager.getSecrets.mockResolvedValue(mockSecrets);

      const { loadSecrets } = require('../../../src/config/secrets');
      const result = await loadSecrets();

      expect(result).toBe(mockSecrets);
    });

    it('should log with different service names', async () => {
      const mockSecrets = {};
      const { secretsManager } = require('@tickettoken/shared');
      secretsManager.getSecrets.mockResolvedValue(mockSecrets);

      const { loadSecrets } = require('../../../src/config/secrets');

      process.env.SERVICE_NAME = 'service-one';
      await loadSecrets();
      expect(consoleLogSpy).toHaveBeenCalledWith('[service-one] Loading secrets...');

      jest.clearAllMocks();

      process.env.SERVICE_NAME = 'service-two';
      await loadSecrets();
      expect(consoleLogSpy).toHaveBeenCalledWith('[service-two] Loading secrets...');
    });
  });
});
