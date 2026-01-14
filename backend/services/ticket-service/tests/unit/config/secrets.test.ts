// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Mock secretsManager
const mockGetSecrets = jest.fn();
jest.mock('../../../../../shared/utils/secrets-manager', () => ({
  secretsManager: {
    getSecrets: mockGetSecrets,
  },
}));

// Mock secrets config
jest.mock('../../../../../shared/config/secrets.config', () => ({
  SECRETS_CONFIG: {
    POSTGRES_PASSWORD: 'postgres-password',
    POSTGRES_USER: 'postgres-user',
    POSTGRES_DB: 'postgres-db',
    REDIS_PASSWORD: 'redis-password',
  },
}));

describe('Secrets Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadSecrets', () => {
    it('should load secrets successfully', async () => {
      process.env.SERVICE_NAME = 'ticket-service';
      mockGetSecrets.mockResolvedValue({
        'postgres-password': 'secret123',
        'postgres-user': 'admin',
        'postgres-db': 'ticketdb',
        'redis-password': 'redispass',
      });

      const { loadSecrets } = await import('../../../src/config/secrets');
      const secrets = await loadSecrets();

      expect(mockGetSecrets).toHaveBeenCalledWith([
        'postgres-password',
        'postgres-user',
        'postgres-db',
        'redis-password',
      ]);
      expect(secrets).toBeDefined();
    });

    it('should use default service name when not set', async () => {
      delete process.env.SERVICE_NAME;
      mockGetSecrets.mockResolvedValue({});

      const { loadSecrets } = await import('../../../src/config/secrets');
      await loadSecrets();

      // Should not throw
    });

    it('should throw when secrets loading fails', async () => {
      process.env.SERVICE_NAME = 'ticket-service';
      mockGetSecrets.mockRejectedValue(new Error('Vault unavailable'));

      const { loadSecrets } = await import('../../../src/config/secrets');

      await expect(loadSecrets()).rejects.toThrow('Cannot start service without required secrets');
    });
  });
});
