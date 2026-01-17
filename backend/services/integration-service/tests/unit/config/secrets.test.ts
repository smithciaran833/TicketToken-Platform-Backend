/**
 * Tests for Secrets Configuration
 */

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock path
jest.mock('path', () => ({
  resolve: jest.fn((...args) => args.join('/')),
}));

// Mock secrets manager - use the actual path from source
const mockGetSecrets = jest.fn();

jest.mock('../../../../../shared/utils/secrets-manager', () => ({
  secretsManager: {
    getSecrets: mockGetSecrets,
  },
}));

jest.mock('../../../../../shared/config/secrets.config', () => ({
  SECRETS_CONFIG: {
    POSTGRES_PASSWORD: 'postgres-password',
    POSTGRES_USER: 'postgres-user',
    POSTGRES_DB: 'postgres-db',
    REDIS_PASSWORD: 'redis-password',
  },
}));

describe('Secrets Configuration', () => {
  let secrets: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    process.env.SERVICE_NAME = 'integration-service';

    secrets = require('../../../src/config/secrets');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('loadSecrets', () => {
    it('should load secrets successfully', async () => {
      const mockSecrets = {
        'postgres-password': 'db-password-123',
        'postgres-user': 'db-user',
        'postgres-db': 'db-name',
        'redis-password': 'redis-pass-456',
      };

      mockGetSecrets.mockResolvedValue(mockSecrets);

      const result = await secrets.loadSecrets();

      expect(result).toEqual(mockSecrets);
      expect(mockGetSecrets).toHaveBeenCalledWith([
        'postgres-password',
        'postgres-user',
        'postgres-db',
        'redis-password',
      ]);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[integration-service] ✅ Secrets loaded successfully'
      );
    });

    it('should log service name when loading secrets', async () => {
      mockGetSecrets.mockResolvedValue({});

      await secrets.loadSecrets();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[integration-service] Loading secrets...'
      );
    });

    it('should use default service name when SERVICE_NAME not set', async () => {
      delete process.env.SERVICE_NAME;

      jest.resetModules();
      secrets = require('../../../src/config/secrets');

      mockGetSecrets.mockResolvedValue({});

      await secrets.loadSecrets();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[unknown-service] Loading secrets...'
      );
    });

    it('should throw error when secrets manager fails', async () => {
      const error = new Error('Secrets manager connection failed');
      mockGetSecrets.mockRejectedValue(error);

      await expect(secrets.loadSecrets()).rejects.toThrow(
        'Cannot start service without required secrets'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[integration-service] ❌ Failed to load secrets:',
        'Secrets manager connection failed'
      );
    });

    it('should request all common secrets', async () => {
      mockGetSecrets.mockResolvedValue({});

      await secrets.loadSecrets();

      expect(mockGetSecrets).toHaveBeenCalledWith(
        expect.arrayContaining([
          'postgres-password',
          'postgres-user',
          'postgres-db',
          'redis-password',
        ])
      );
    });
  });
});
