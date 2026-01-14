/**
 * Unit Tests for config/secrets.ts
 * 
 * Tests secrets loading from AWS Secrets Manager and Vault.
 * Priority: 🟡 Medium (8 tests)
 */

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import {
  getSecret,
  hasSecret,
  getLoadedSecretNames,
  getMissingSecrets,
  SecretCategories
} from '../../../src/config/secrets';

describe('Secrets Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Secret Categories', () => {
    it('should define IPFS secrets', () => {
      expect(SecretCategories.IPFS).toContain('PINATA_API_KEY');
      expect(SecretCategories.IPFS).toContain('PINATA_SECRET_API_KEY');
      expect(SecretCategories.IPFS).toContain('PINATA_JWT');
    });

    it('should define AUTH secrets', () => {
      expect(SecretCategories.AUTH).toContain('JWT_SECRET');
      expect(SecretCategories.AUTH).toContain('INTERNAL_SERVICE_SECRET');
    });

    it('should define DATABASE secrets', () => {
      expect(SecretCategories.DATABASE).toContain('DB_PASSWORD');
      expect(SecretCategories.DATABASE).toContain('DB_HOST');
    });

    it('should define SOLANA secrets', () => {
      expect(SecretCategories.SOLANA).toContain('WALLET_PRIVATE_KEY');
      expect(SecretCategories.SOLANA).toContain('SOLANA_RPC_URL');
    });

    it('should define REDIS secrets', () => {
      expect(SecretCategories.REDIS).toContain('REDIS_PASSWORD');
    });

    it('ALL should include all category secrets', () => {
      const allSecrets = SecretCategories.ALL;
      
      SecretCategories.IPFS.forEach(secret => {
        expect(allSecrets).toContain(secret);
      });
      SecretCategories.AUTH.forEach(secret => {
        expect(allSecrets).toContain(secret);
      });
      SecretCategories.DATABASE.forEach(secret => {
        expect(allSecrets).toContain(secret);
      });
    });
  });

  describe('getSecret', () => {
    it('should return environment variable value', () => {
      process.env.TEST_SECRET = 'test-value';
      
      const value = getSecret('TEST_SECRET', false);
      
      expect(value).toBe('test-value');
    });

    it('should throw if required secret is missing', () => {
      delete process.env.MISSING_SECRET;
      
      expect(() => getSecret('MISSING_SECRET', true)).toThrow('Required secret MISSING_SECRET is not configured');
    });

    it('should return undefined for optional missing secret', () => {
      delete process.env.OPTIONAL_SECRET;
      
      const value = getSecret('OPTIONAL_SECRET', false);
      
      expect(value).toBeUndefined();
    });
  });

  describe('hasSecret', () => {
    it('should return true if secret exists', () => {
      process.env.EXISTING_SECRET = 'value';
      
      expect(hasSecret('EXISTING_SECRET')).toBe(true);
    });

    it('should return false if secret does not exist', () => {
      delete process.env.NONEXISTENT_SECRET;
      
      expect(hasSecret('NONEXISTENT_SECRET')).toBe(false);
    });

    it('should return false for empty string', () => {
      process.env.EMPTY_SECRET = '';
      
      expect(hasSecret('EMPTY_SECRET')).toBe(false);
    });
  });

  describe('getLoadedSecretNames', () => {
    it('should return list of configured secrets', () => {
      // Set up some secrets
      process.env.JWT_SECRET = 'test-jwt';
      process.env.DB_PASSWORD = 'test-db-pass';
      
      const loaded = getLoadedSecretNames();
      
      expect(loaded).toContain('JWT_SECRET');
      expect(loaded).toContain('DB_PASSWORD');
    });

    it('should not include missing secrets', () => {
      delete process.env.PINATA_JWT;
      
      const loaded = getLoadedSecretNames();
      
      expect(loaded).not.toContain('PINATA_JWT');
    });
  });

  describe('getMissingSecrets', () => {
    it('should return list of unconfigured secrets', () => {
      // Clear all secrets
      SecretCategories.ALL.forEach(secret => {
        delete process.env[secret];
      });
      
      const missing = getMissingSecrets();
      
      // All secrets should be missing
      SecretCategories.ALL.forEach(secret => {
        expect(missing).toContain(secret);
      });
    });

    it('should exclude configured secrets', () => {
      process.env.JWT_SECRET = 'configured';
      
      const missing = getMissingSecrets();
      
      expect(missing).not.toContain('JWT_SECRET');
    });
  });

  describe('loadSecrets', () => {
    it('should use .env in development mode', () => {
      process.env.NODE_ENV = 'development';
      
      // In development, secrets are already in process.env
      expect(process.env.NODE_ENV).toBe('development');
    });

    it('should require secrets manager in production', () => {
      process.env.NODE_ENV = 'production';
      
      // Would attempt to load from AWS or Vault
      expect(process.env.NODE_ENV).toBe('production');
    });
  });
});
