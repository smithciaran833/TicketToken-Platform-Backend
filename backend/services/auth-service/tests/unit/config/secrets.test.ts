const mockSecretsManager = {
  getSecrets: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('@tickettoken/shared', () => ({
  secretsManager: mockSecretsManager,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// Must import after mocks
import { loadSecrets } from '../../../src/config/secrets';

describe('secrets config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadSecrets', () => {
    it('loads core secrets in development', async () => {
      process.env.NODE_ENV = 'development';
      mockSecretsManager.getSecrets.mockResolvedValue({
        POSTGRES_PASSWORD: 'pass',
        POSTGRES_USER: 'user',
        POSTGRES_DB: 'db',
        REDIS_PASSWORD: 'redis',
      });

      const secrets = await loadSecrets();

      expect(secrets.POSTGRES_PASSWORD).toBe('pass');
      expect(secrets.POSTGRES_USER).toBe('user');
    });

    it('loads JWT secrets in production', async () => {
      process.env.NODE_ENV = 'production';
      mockSecretsManager.getSecrets
        .mockResolvedValueOnce({ POSTGRES_PASSWORD: 'p', POSTGRES_USER: 'u', POSTGRES_DB: 'd', REDIS_PASSWORD: 'r' })
        .mockResolvedValueOnce({ JWT_PRIVATE_KEY: 'priv', JWT_PUBLIC_KEY: 'pub' })
        .mockRejectedValueOnce(new Error('No rotation keys'))
        .mockResolvedValueOnce({ ENCRYPTION_KEY: 'enc' })
        .mockRejectedValueOnce(new Error('No OAuth'))
        .mockResolvedValueOnce({ RESEND_API_KEY: 'resend' });

      const secrets = await loadSecrets();

      expect(secrets.JWT_PRIVATE_KEY).toBe('priv');
      expect(secrets.JWT_PUBLIC_KEY).toBe('pub');
    });

    it('sets secrets as environment variables', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.POSTGRES_PASSWORD;
      mockSecretsManager.getSecrets.mockResolvedValue({
        POSTGRES_PASSWORD: 'secret-pass',
        POSTGRES_USER: 'user',
        POSTGRES_DB: 'db',
      });

      await loadSecrets();

      expect(process.env.POSTGRES_PASSWORD).toBe('secret-pass');
    });

    it('does not overwrite existing env vars', async () => {
      process.env.NODE_ENV = 'development';
      process.env.POSTGRES_PASSWORD = 'existing';
      mockSecretsManager.getSecrets.mockResolvedValue({
        POSTGRES_PASSWORD: 'new-pass',
        POSTGRES_USER: 'user',
        POSTGRES_DB: 'db',
      });

      await loadSecrets();

      expect(process.env.POSTGRES_PASSWORD).toBe('existing');
    });

    it('warns when OAuth secrets not found', async () => {
      process.env.NODE_ENV = 'development';
      mockSecretsManager.getSecrets
        .mockResolvedValueOnce({ POSTGRES_PASSWORD: 'p', POSTGRES_USER: 'u', POSTGRES_DB: 'd' })
        .mockRejectedValueOnce(new Error('OAuth not found'))
        .mockRejectedValueOnce(new Error('Email not found'));

      await loadSecrets();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('OAuth secrets not found')
      );
    });

    it('throws if core secrets fail', async () => {
      process.env.NODE_ENV = 'development';
      mockSecretsManager.getSecrets.mockRejectedValue(new Error('AWS error'));

      await expect(loadSecrets()).rejects.toThrow('Cannot start service');
    });

    it('throws if RESEND_API_KEY missing in production', async () => {
      process.env.NODE_ENV = 'production';
      mockSecretsManager.getSecrets
        .mockResolvedValueOnce({ POSTGRES_PASSWORD: 'p', POSTGRES_USER: 'u', POSTGRES_DB: 'd' })
        .mockResolvedValueOnce({ JWT_PRIVATE_KEY: 'priv', JWT_PUBLIC_KEY: 'pub' })
        .mockRejectedValueOnce(new Error('No rotation'))
        .mockResolvedValueOnce({ ENCRYPTION_KEY: 'enc' })
        .mockRejectedValueOnce(new Error('No OAuth'))
        .mockRejectedValueOnce(new Error('No Resend'));

      await expect(loadSecrets()).rejects.toThrow('RESEND_API_KEY is required in production');
    });
  });
});
