/**
 * Unit Tests for Secrets Configuration
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
jest.mock('../../../src/utils/logger');

describe('Secrets Configuration', () => {
  let logger: {
    info: jest.Mock<any>;
    warn: jest.Mock<any>;
    error: jest.Mock<any>;
  };
  let mockEnv: NodeJS.ProcessEnv;
  let mockFetch: jest.Mock<any>;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockEnv = { ...process.env };

    logger = {
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>()
    };

    jest.doMock('../../../src/utils/logger', () => ({ logger }));

    process.env.NODE_ENV = 'test';
    process.env.SECRETS_PROVIDER = 'env';
  });

  afterEach(() => {
    process.env = mockEnv;
    jest.clearAllMocks();
  });

  describe('getSecret from env provider', () => {
    it('should fetch secret from environment variable', async () => {
      process.env.TEST_SECRET = 'test-secret-value';

      const { getSecret } = await import('../../../src/config/secrets');

      const secret = await getSecret('TEST_SECRET');

      expect(secret).toBe('test-secret-value');
    });

    it('should throw when env var not set', async () => {
      const { getSecret } = await import('../../../src/config/secrets');

      await expect(getSecret('MISSING_SECRET'))
        .rejects
        .toThrow('Environment variable MISSING_SECRET not set');
    });

    it('should cache secret value', async () => {
      process.env.CACHED_SECRET = 'cached-value';

      const { getSecret } = await import('../../../src/config/secrets');

      const secret1 = await getSecret('CACHED_SECRET');
      delete process.env.CACHED_SECRET;
      const secret2 = await getSecret('CACHED_SECRET');

      expect(secret1).toBe('cached-value');
      expect(secret2).toBe('cached-value');
    });

    it('should respect cache TTL', async () => {
      process.env.TTL_SECRET = 'initial-value';

      const { getSecret } = await import('../../../src/config/secrets');

      const secret1 = await getSecret('TTL_SECRET');
      expect(secret1).toBe('initial-value');

      process.env.TTL_SECRET = 'updated-value';

      const secret2 = await getSecret('TTL_SECRET');
      expect(secret2).toBe('initial-value');
    });
  });

  describe('getJWTSecret', () => {
    it('should return JWT secret', async () => {
      process.env.JWT_SECRET = 'jwt-secret-with-32-characters!!';

      const { getJWTSecret } = await import('../../../src/config/secrets');

      const secret = await getJWTSecret();

      expect(secret).toBe('jwt-secret-with-32-characters!!');
    });

    it('should warn when JWT secret is less than 32 characters', async () => {
      process.env.JWT_SECRET = 'short';

      const { getJWTSecret } = await import('../../../src/config/secrets');

      await getJWTSecret();

      expect(logger.warn).toHaveBeenCalledWith(
        'JWT_SECRET is less than 32 characters - consider using a stronger secret'
      );
    });

    it('should not warn for strong JWT secrets', async () => {
      process.env.JWT_SECRET = 'this-is-a-very-strong-jwt-secret-with-more-than-32-characters';

      const { getJWTSecret } = await import('../../../src/config/secrets');

      await getJWTSecret();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('getWebhookSecret', () => {
    it('should return webhook secret', async () => {
      process.env.WEBHOOK_SECRET = 'webhook-secret-16+';

      const { getWebhookSecret } = await import('../../../src/config/secrets');

      const secret = await getWebhookSecret();

      expect(secret).toBe('webhook-secret-16+');
    });

    it('should throw when webhook secret is less than 16 characters', async () => {
      process.env.WEBHOOK_SECRET = 'short';

      const { getWebhookSecret } = await import('../../../src/config/secrets');

      await expect(getWebhookSecret())
        .rejects
        .toThrow('WEBHOOK_SECRET must be at least 16 characters');
    });
  });

  describe('getStripeWebhookSecret', () => {
    it('should return Stripe webhook secret', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'stripe-secret';

      const { getStripeWebhookSecret } = await import('../../../src/config/secrets');

      const secret = await getStripeWebhookSecret();

      expect(secret).toBe('stripe-secret');
    });
  });

  describe('getInternalServiceToken', () => {
    it('should return internal service token', async () => {
      process.env.INTERNAL_SERVICE_TOKEN = 'internal-token';

      const { getInternalServiceToken } = await import('../../../src/config/secrets');

      const token = await getInternalServiceToken();

      expect(token).toBe('internal-token');
    });
  });

  describe('getDatabaseUrl', () => {
    it('should return database URL', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      const { getDatabaseUrl } = await import('../../../src/config/secrets');

      const url = await getDatabaseUrl();

      expect(url).toBe('postgresql://localhost:5432/test');
    });
  });

  describe('clearSecretsCache', () => {
    it('should clear all cached secrets', async () => {
      process.env.CLEAR_TEST_SECRET = 'cached';

      const { getSecret, clearSecretsCache } = await import('../../../src/config/secrets');

      await getSecret('CLEAR_TEST_SECRET');

      clearSecretsCache();

      process.env.CLEAR_TEST_SECRET = 'new-value';

      const secret = await getSecret('CLEAR_TEST_SECRET');
      expect(secret).toBe('new-value');
      expect(logger.info).toHaveBeenCalledWith('Secrets cache cleared');
    });
  });

  describe('refreshSecret', () => {
    it('should refresh specific secret in cache', async () => {
      process.env.REFRESH_SECRET = 'old-value';

      const { getSecret, refreshSecret } = await import('../../../src/config/secrets');

      const oldValue = await getSecret('REFRESH_SECRET');
      expect(oldValue).toBe('old-value');

      process.env.REFRESH_SECRET = 'new-value';

      await refreshSecret('REFRESH_SECRET');

      const newValue = await getSecret('REFRESH_SECRET');
      expect(newValue).toBe('new-value');
      expect(logger.info).toHaveBeenCalledWith(
        { key: 'REFRESH_SECRET' },
        'Secret refreshed'
      );
    });
  });

  describe('initializeSecrets', () => {
    it('should pre-fetch critical secrets successfully', async () => {
      process.env.JWT_SECRET = 'jwt-secret-with-32-characters!!';
      process.env.WEBHOOK_SECRET = 'webhook-secret-16+';

      const { initializeSecrets } = await import('../../../src/config/secrets');

      await expect(initializeSecrets()).resolves.not.toThrow();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'env',
          cacheEnabled: true
        }),
        'Initializing secrets manager'
      );
      expect(logger.info).toHaveBeenCalledWith('Secrets manager initialized successfully');
    });

    it('should throw when critical secrets are missing', async () => {
      delete process.env.JWT_SECRET;

      const { initializeSecrets } = await import('../../../src/config/secrets');

      await expect(initializeSecrets()).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
        'Failed to initialize secrets manager'
      );
    });
  });

  describe('Vault provider', () => {
    beforeEach(() => {
      process.env.SECRETS_PROVIDER = 'vault';
      process.env.VAULT_ADDR = 'http://vault:8200';
      process.env.VAULT_TOKEN = 'test-vault-token';
      process.env.VAULT_PATH = 'secret/data/test';

      mockFetch = jest.fn<any>();
      (global as any).fetch = mockFetch;
    });

    afterEach(() => {
      delete (global as any).fetch;
    });

    it('should fetch secret from Vault', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            data: {
              TEST_KEY: 'vault-secret-value'
            }
          }
        })
      });

      jest.resetModules();
      const { getSecret } = await import('../../../src/config/secrets');

      const secret = await getSecret('TEST_KEY');

      expect(secret).toBe('vault-secret-value');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://vault:8200/v1/secret/data/test',
        expect.objectContaining({
          headers: {
            'X-Vault-Token': 'test-vault-token'
          }
        })
      );
    });

    it('should throw when Vault returns non-200', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403
      });

      jest.resetModules();
      const { getSecret } = await import('../../../src/config/secrets');

      await expect(getSecret('TEST_KEY')).rejects.toThrow('Vault returned 403');
    });

    it('should throw when VAULT_TOKEN is missing', async () => {
      delete process.env.VAULT_TOKEN;

      jest.resetModules();
      const { getSecret } = await import('../../../src/config/secrets');

      await expect(getSecret('TEST_KEY')).rejects.toThrow('VAULT_TOKEN not configured');
    });

    it('should throw when key not found in Vault', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            data: {
              OTHER_KEY: 'other-value'
            }
          }
        })
      });

      jest.resetModules();
      const { getSecret } = await import('../../../src/config/secrets');

      await expect(getSecret('MISSING_KEY')).rejects.toThrow('Key MISSING_KEY not found in Vault path');
    });

    it('should log errors on Vault failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      jest.resetModules();
      const { getSecret } = await import('../../../src/config/secrets');

      await expect(getSecret('TEST_KEY')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'vault',
          error: 'Network error'
        }),
        'Failed to fetch secret from Vault'
      );
    });
  });

  describe('AWS provider', () => {
    beforeEach(() => {
      process.env.SECRETS_PROVIDER = 'aws';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_SECRET_NAME = 'test-secret';
    });

    it('should throw when AWS SDK not installed', async () => {
      jest.resetModules();

      jest.doMock('@aws-sdk/client-secrets-manager', () => {
        throw new Error('Cannot find module');
      }, { virtual: true });

      const { getSecret } = await import('../../../src/config/secrets');

      await expect(getSecret('TEST_KEY')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'aws',
          error: expect.any(String)
        }),
        'Failed to fetch secret from AWS'
      );
    });
  });
});
