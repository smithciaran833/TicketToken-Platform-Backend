/**
 * Secrets Manager Tests
 * Tests for secure secret retrieval and caching
 */

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
    }),
  },
}));

// Store original env
const originalEnv = process.env;

describe('SecretsManager', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Set required defaults
    process.env.SECRETS_BACKEND = 'env';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890abcdef';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1234567890abcdef';
    process.env.HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-chars';
    process.env.SERVICE_AUTH_SECRET = 'test-service-auth-secret-32-chars-min';
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('SecretsCache', () => {
    it('should cache and retrieve secrets', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBe(process.env.JWT_SECRET);
    });

    it('should return cached value on subsequent calls', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret1 = await secretsManager.getSecret('JWT_SECRET');
      const secret2 = await secretsManager.getSecret('JWT_SECRET');
      
      expect(secret1).toBe(secret2);
    });

    it('should invalidate cache on rotation', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await secretsManager.getSecret('JWT_SECRET');
      secretsManager.rotateSecret('JWT_SECRET');
      
      // Should not throw after rotation
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBe(process.env.JWT_SECRET);
    });

    it('should clear all cached secrets', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await secretsManager.getSecret('JWT_SECRET');
      await secretsManager.getSecret('DATABASE_URL');
      
      secretsManager.clearCache();
      
      // Should not throw after clearing cache
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBeDefined();
    });
  });

  describe('getSecret with env backend', () => {
    it('should retrieve secret from environment variable', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('DATABASE_URL');
      expect(secret).toBe(process.env.DATABASE_URL);
    });

    it('should throw error for missing required secret', async () => {
      delete process.env.DATABASE_URL;
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('DATABASE_URL'))
        .rejects.toThrow('Required secret DATABASE_URL not found in environment');
    });

    it('should retrieve JWT_SECRET', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBe(process.env.JWT_SECRET);
    });

    it('should retrieve STRIPE_SECRET_KEY', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('STRIPE_SECRET_KEY');
      expect(secret).toBe(process.env.STRIPE_SECRET_KEY);
    });

    it('should retrieve STRIPE_WEBHOOK_SECRET', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('STRIPE_WEBHOOK_SECRET');
      expect(secret).toBe(process.env.STRIPE_WEBHOOK_SECRET);
    });

    it('should retrieve HMAC_SECRET', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('HMAC_SECRET');
      expect(secret).toBe(process.env.HMAC_SECRET);
    });

    it('should retrieve SERVICE_AUTH_SECRET', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('SERVICE_AUTH_SECRET');
      expect(secret).toBe(process.env.SERVICE_AUTH_SECRET);
    });

    it('should retrieve REDIS_URL', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('REDIS_URL');
      expect(secret).toBe(process.env.REDIS_URL);
    });
  });

  describe('getSecrets (multiple)', () => {
    it('should retrieve multiple secrets at once', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secrets = await secretsManager.getSecrets('JWT_SECRET', 'DATABASE_URL');
      
      expect(secrets.JWT_SECRET).toBe(process.env.JWT_SECRET);
      expect(secrets.DATABASE_URL).toBe(process.env.DATABASE_URL);
    });

    it('should handle single secret retrieval', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secrets = await secretsManager.getSecrets('JWT_SECRET');
      
      expect(secrets.JWT_SECRET).toBe(process.env.JWT_SECRET);
    });
  });

  describe('secret validation', () => {
    it('should reject JWT_SECRET shorter than 32 characters', async () => {
      process.env.JWT_SECRET = 'short';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('JWT_SECRET'))
        .rejects.toThrow('must be at least 32 characters');
    });

    it('should reject HMAC_SECRET shorter than 32 characters', async () => {
      process.env.HMAC_SECRET = 'short';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('HMAC_SECRET'))
        .rejects.toThrow('must be at least 32 characters');
    });

    it('should reject SERVICE_AUTH_SECRET shorter than 32 characters', async () => {
      process.env.SERVICE_AUTH_SECRET = 'short';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('SERVICE_AUTH_SECRET'))
        .rejects.toThrow('must be at least 32 characters');
    });

    it('should reject STRIPE_SECRET_KEY shorter than 20 characters', async () => {
      process.env.STRIPE_SECRET_KEY = 'short';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('STRIPE_SECRET_KEY'))
        .rejects.toThrow('must be at least 20 characters');
    });

    it('should reject STRIPE_WEBHOOK_SECRET shorter than 20 characters', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'short';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('STRIPE_WEBHOOK_SECRET'))
        .rejects.toThrow('must be at least 20 characters');
    });

    it('should reject secrets containing "your-secret-key"', async () => {
      process.env.JWT_SECRET = 'your-secret-key-here-with-enough-length-for-test';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('JWT_SECRET'))
        .rejects.toThrow('insecure default value');
    });

    it('should reject secrets containing "changeme"', async () => {
      process.env.JWT_SECRET = 'changeme-but-this-needs-32-characters-min';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('JWT_SECRET'))
        .rejects.toThrow('insecure default value');
    });

    it('should reject secrets containing "password"', async () => {
      process.env.JWT_SECRET = 'password-that-is-at-least-32-characters-long';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('JWT_SECRET'))
        .rejects.toThrow('insecure default value');
    });

    it('should reject secrets containing "secret" substring', async () => {
      process.env.JWT_SECRET = 'super-secret-value-32-characters-long';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('JWT_SECRET'))
        .rejects.toThrow('insecure default value');
    });

    it('should reject secrets containing "test"', async () => {
      process.env.JWT_SECRET = 'test-value-that-is-at-least-32-characters';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('JWT_SECRET'))
        .rejects.toThrow('insecure default value');
    });

    it('should reject secrets containing "development"', async () => {
      process.env.JWT_SECRET = 'development-key-32-characters-minimum-length';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await expect(secretsManager.getSecret('JWT_SECRET'))
        .rejects.toThrow('insecure default value');
    });

    it('should accept properly formatted secrets', async () => {
      process.env.JWT_SECRET = 'XyZ123AbC456dEf789GhI012JkL345MnO678PqR901StU';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBe(process.env.JWT_SECRET);
    });
  });

  describe('convenience functions', () => {
    it('should get JWT secret via getJwtSecret', async () => {
      const { getJwtSecret } = await import('../../../src/config/secrets-manager');
      
      const secret = await getJwtSecret();
      expect(secret).toBe(process.env.JWT_SECRET);
    });

    it('should get Stripe secret key via getStripeSecretKey', async () => {
      const { getStripeSecretKey } = await import('../../../src/config/secrets-manager');
      
      const secret = await getStripeSecretKey();
      expect(secret).toBe(process.env.STRIPE_SECRET_KEY);
    });

    it('should get Stripe webhook secret via getStripeWebhookSecret', async () => {
      const { getStripeWebhookSecret } = await import('../../../src/config/secrets-manager');
      
      const secret = await getStripeWebhookSecret();
      expect(secret).toBe(process.env.STRIPE_WEBHOOK_SECRET);
    });

    it('should get HMAC secret via getHmacSecret', async () => {
      const { getHmacSecret } = await import('../../../src/config/secrets-manager');
      
      const secret = await getHmacSecret();
      expect(secret).toBe(process.env.HMAC_SECRET);
    });

    it('should get service auth secret via getServiceAuthSecret', async () => {
      const { getServiceAuthSecret } = await import('../../../src/config/secrets-manager');
      
      const secret = await getServiceAuthSecret();
      expect(secret).toBe(process.env.SERVICE_AUTH_SECRET);
    });
  });

  describe('validateRequiredSecrets', () => {
    it('should validate required secrets in non-production', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      
      const { validateRequiredSecrets } = await import('../../../src/config/secrets-manager');
      
      await expect(validateRequiredSecrets()).resolves.not.toThrow();
    });

    it('should validate all secrets in production', async () => {
      process.env.NODE_ENV = 'production';
      // Ensure valid production secrets (avoid insecure defaults)
      process.env.JWT_SECRET = 'XyZ123AbC456dEf789GhI012JkL345MnO678PqR901StU';
      process.env.STRIPE_SECRET_KEY = 'sk_live_1234567890abcdef12345';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_123456789abcdef';
      jest.resetModules();
      
      const { validateRequiredSecrets } = await import('../../../src/config/secrets-manager');
      
      await expect(validateRequiredSecrets()).resolves.not.toThrow();
    });

    it('should throw if required secret is missing in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.STRIPE_SECRET_KEY;
      jest.resetModules();
      
      const { validateRequiredSecrets } = await import('../../../src/config/secrets-manager');
      
      await expect(validateRequiredSecrets()).rejects.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      await secretsManager.getSecret('JWT_SECRET');
      
      expect(() => secretsManager.cleanup()).not.toThrow();
    });
  });

  describe('AWS backend', () => {
    beforeEach(() => {
      process.env.SECRETS_BACKEND = 'aws';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_SECRET_PREFIX = 'tickettoken/payment-service';
    });

    it('should fall back to env when AWS fails', async () => {
      jest.resetModules();
      
      // Mock AWS SDK to fail
      jest.mock('@aws-sdk/client-secrets-manager', () => ({
        SecretsManager: jest.fn().mockImplementation(() => ({
          getSecretValue: jest.fn().mockRejectedValue(new Error('AWS Error')),
        })),
      }));
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      // Should fall back to env
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBe(process.env.JWT_SECRET);
    });
  });

  describe('Vault backend', () => {
    beforeEach(() => {
      process.env.SECRETS_BACKEND = 'vault';
    });

    it('should fall back to env when Vault not configured', async () => {
      delete process.env.VAULT_ADDR;
      delete process.env.VAULT_TOKEN;
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      // Should fall back to env
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBe(process.env.JWT_SECRET);
    });

    it('should fall back to env when Vault request fails', async () => {
      process.env.VAULT_ADDR = 'http://localhost:8200';
      process.env.VAULT_TOKEN = 'test-token';
      jest.resetModules();
      
      // Mock fetch to fail
      global.fetch = jest.fn().mockRejectedValue(new Error('Vault Error'));
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      // Should fall back to env
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBe(process.env.JWT_SECRET);
    });
  });

  describe('configuration', () => {
    it('should use default cache TTL', async () => {
      delete process.env.SECRETS_CACHE_TTL_MS;
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      // Should not throw
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBeDefined();
    });

    it('should use custom cache TTL', async () => {
      process.env.SECRETS_CACHE_TTL_MS = '600000';
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      // Should not throw
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBeDefined();
    });

    it('should use default refresh before expiry', async () => {
      delete process.env.SECRETS_REFRESH_BEFORE_MS;
      jest.resetModules();
      
      const { secretsManager } = await import('../../../src/config/secrets-manager');
      
      // Should not throw
      const secret = await secretsManager.getSecret('JWT_SECRET');
      expect(secret).toBeDefined();
    });
  });
});
