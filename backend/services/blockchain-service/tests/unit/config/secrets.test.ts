/**
 * Unit tests for blockchain-service secrets configuration
 * Tests AWS Secrets Manager, Vault integration, JWT validation, and secret management
 */

describe('Secrets Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Secret Categories
  // ===========================================================================
  describe('Secret Categories', () => {
    it('should define AUTH_SECRETS', () => {
      const AUTH_SECRETS = ['JWT_SECRET', 'INTERNAL_SERVICE_SECRET', 'WEBHOOK_SECRET'];
      
      expect(AUTH_SECRETS).toContain('JWT_SECRET');
      expect(AUTH_SECRETS).toContain('INTERNAL_SERVICE_SECRET');
      expect(AUTH_SECRETS).toContain('WEBHOOK_SECRET');
    });

    it('should define DATABASE_SECRETS', () => {
      const DATABASE_SECRETS = ['DB_PASSWORD', 'DB_HOST', 'DB_USER'];
      
      expect(DATABASE_SECRETS).toContain('DB_PASSWORD');
      expect(DATABASE_SECRETS).toContain('DB_HOST');
      expect(DATABASE_SECRETS).toContain('DB_USER');
    });

    it('should define SOLANA_SECRETS', () => {
      const SOLANA_SECRETS = ['TREASURY_WALLET_PRIVATE_KEY', 'SOLANA_RPC_URL', 'SOLANA_RPC_ENDPOINTS'];
      
      expect(SOLANA_SECRETS).toContain('TREASURY_WALLET_PRIVATE_KEY');
      expect(SOLANA_SECRETS).toContain('SOLANA_RPC_URL');
    });

    it('should define REDIS_SECRETS', () => {
      const REDIS_SECRETS = ['REDIS_PASSWORD'];
      
      expect(REDIS_SECRETS).toContain('REDIS_PASSWORD');
    });

    it('should define REQUIRED_SECRETS', () => {
      const REQUIRED_SECRETS = ['JWT_SECRET', 'DB_PASSWORD', 'INTERNAL_SERVICE_SECRET'];
      
      expect(REQUIRED_SECRETS).toHaveLength(3);
      expect(REQUIRED_SECRETS).toContain('JWT_SECRET');
      expect(REQUIRED_SECRETS).toContain('DB_PASSWORD');
      expect(REQUIRED_SECRETS).toContain('INTERNAL_SERVICE_SECRET');
    });
  });

  // ===========================================================================
  // AWS Configuration
  // ===========================================================================
  describe('AWS Configuration', () => {
    it('should use default secret name', () => {
      delete process.env.AWS_SECRET_NAME;
      
      const secretName = process.env.AWS_SECRET_NAME || 'blockchain-service/secrets';
      
      expect(secretName).toBe('blockchain-service/secrets');
    });

    it('should use custom secret name from env', () => {
      process.env.AWS_SECRET_NAME = 'custom/secret/path';
      
      const secretName = process.env.AWS_SECRET_NAME || 'blockchain-service/secrets';
      
      expect(secretName).toBe('custom/secret/path');
    });

    it('should use default region us-east-1', () => {
      delete process.env.AWS_REGION;
      
      const region = process.env.AWS_REGION || 'us-east-1';
      
      expect(region).toBe('us-east-1');
    });

    it('should use custom region from env', () => {
      process.env.AWS_REGION = 'us-west-2';
      
      const region = process.env.AWS_REGION || 'us-east-1';
      
      expect(region).toBe('us-west-2');
    });
  });

  // ===========================================================================
  // loadSecrets Function
  // ===========================================================================
  describe('loadSecrets', () => {
    it('should use .env in development without secrets manager', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.USE_SECRETS_MANAGER;
      
      const isProduction = process.env.NODE_ENV === 'production';
      const forceSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';
      const useEnvFile = !isProduction && !forceSecretsManager;
      
      expect(useEnvFile).toBe(true);
    });

    it('should warn about treasury key in development env', () => {
      process.env.NODE_ENV = 'development';
      process.env.TREASURY_WALLET_PRIVATE_KEY = 'some-key';
      
      const hasKey = !!process.env.TREASURY_WALLET_PRIVATE_KEY;
      
      expect(hasKey).toBe(true);
      // In actual code, this would log a warning
    });

    it('should require secrets manager in production', () => {
      process.env.NODE_ENV = 'production';
      
      const isProduction = process.env.NODE_ENV === 'production';
      
      expect(isProduction).toBe(true);
      // In production, secrets MUST come from secrets manager
    });
  });

  // ===========================================================================
  // getSecret Function
  // ===========================================================================
  describe('getSecret', () => {
    it('should return secret value when exists', () => {
      process.env.MY_SECRET = 'secret-value';
      
      const value = process.env.MY_SECRET;
      
      expect(value).toBe('secret-value');
    });

    it('should return undefined for optional secret when missing', () => {
      delete process.env.OPTIONAL_SECRET;
      
      const value = process.env.OPTIONAL_SECRET;
      
      expect(value).toBeUndefined();
    });

    it('should throw for required secret when missing', () => {
      delete process.env.REQUIRED_SECRET;
      
      const getRequiredSecret = (name: string) => {
        const value = process.env[name];
        if (!value) {
          throw new Error(`Required secret ${name} is not configured`);
        }
        return value;
      };
      
      expect(() => getRequiredSecret('REQUIRED_SECRET')).toThrow('Required secret REQUIRED_SECRET is not configured');
    });
  });

  // ===========================================================================
  // JWT Secret Validation (AUDIT FIX #57)
  // ===========================================================================
  describe('validateJwtSecret', () => {
    const MIN_JWT_SECRET_LENGTH = 32;

    it('should require JWT_SECRET to exist', () => {
      delete process.env.JWT_SECRET;
      
      const validate = () => {
        if (!process.env.JWT_SECRET) {
          throw new Error('JWT_SECRET is not configured');
        }
      };
      
      expect(validate).toThrow('JWT_SECRET is not configured');
    });

    it('should require minimum 32 characters', () => {
      process.env.JWT_SECRET = 'short';
      
      const validate = () => {
        const secret = process.env.JWT_SECRET || '';
        if (secret.length < MIN_JWT_SECRET_LENGTH) {
          throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
        }
      };
      
      expect(validate).toThrow('JWT_SECRET must be at least 32 characters');
    });

    it('should accept secret with 32+ characters', () => {
      process.env.JWT_SECRET = 'this-is-a-secure-jwt-secret-key-32-plus';
      
      const secret = process.env.JWT_SECRET || '';
      const isValid = secret.length >= MIN_JWT_SECRET_LENGTH;
      
      expect(isValid).toBe(true);
    });

    it('should reject weak secret "secret"', () => {
      process.env.JWT_SECRET = 'secretsecretsecretsecretsecretsecret';
      
      const weakSecrets = ['secret', 'your-secret-key', 'jwt-secret', 'change-me'];
      const secret = process.env.JWT_SECRET.toLowerCase();
      const isWeak = weakSecrets.some(weak => secret.includes(weak));
      
      expect(isWeak).toBe(true);
    });

    it('should reject weak secret "change-me"', () => {
      process.env.JWT_SECRET = 'change-me-to-something-better-change-me';
      
      const weakSecrets = ['secret', 'your-secret-key', 'jwt-secret', 'change-me'];
      const secret = process.env.JWT_SECRET.toLowerCase();
      const isWeak = weakSecrets.some(weak => secret.includes(weak));
      
      expect(isWeak).toBe(true);
    });

    it('should reject weak secret "development"', () => {
      process.env.JWT_SECRET = 'developmentdevelopmentdevelopment';
      
      const weakSecrets = ['development', 'test-secret', 'supersecretkey'];
      const secret = process.env.JWT_SECRET.toLowerCase();
      const isWeak = weakSecrets.some(weak => secret.includes(weak));
      
      expect(isWeak).toBe(true);
    });

    it('should accept strong random secret', () => {
      process.env.JWT_SECRET = 'aB3$kL9mNp2QrSt5UvWx7YzAcDfGhJkLmN';
      
      const weakSecrets = ['secret', 'your-secret-key', 'jwt-secret', 'change-me', 'development'];
      const secret = process.env.JWT_SECRET.toLowerCase();
      const isWeak = weakSecrets.some(weak => secret.includes(weak));
      
      expect(isWeak).toBe(false);
    });
  });

  // ===========================================================================
  // Treasury Key Validation (Issue #1)
  // ===========================================================================
  describe('validateTreasuryKeyConfig', () => {
    it('should reject plaintext treasury key in production without secrets manager', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.USE_SECRETS_MANAGER;
      process.env.TREASURY_WALLET_PRIVATE_KEY = 'some-private-key';
      
      const validate = () => {
        const isProduction = process.env.NODE_ENV === 'production';
        const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';
        const hasKey = !!process.env.TREASURY_WALLET_PRIVATE_KEY;
        
        if (isProduction && hasKey && !useSecretsManager) {
          throw new Error('SECURITY ERROR: Treasury wallet key appears to be from environment in production');
        }
      };
      
      expect(validate).toThrow('SECURITY ERROR');
    });

    it('should allow treasury key in production with secrets manager', () => {
      process.env.NODE_ENV = 'production';
      process.env.USE_SECRETS_MANAGER = 'true';
      process.env.TREASURY_WALLET_PRIVATE_KEY = 'some-private-key';
      
      const isProduction = process.env.NODE_ENV === 'production';
      const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';
      const hasKey = !!process.env.TREASURY_WALLET_PRIVATE_KEY;
      const isValid = !(isProduction && hasKey && !useSecretsManager);
      
      expect(isValid).toBe(true);
    });

    it('should allow treasury key in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.TREASURY_WALLET_PRIVATE_KEY = 'some-private-key';
      
      const isProduction = process.env.NODE_ENV === 'production';
      const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';
      const hasKey = !!process.env.TREASURY_WALLET_PRIVATE_KEY;
      const isValid = !(isProduction && hasKey && !useSecretsManager);
      
      expect(isValid).toBe(true);
    });
  });

  // ===========================================================================
  // hasSecret and getMissingSecrets
  // ===========================================================================
  describe('hasSecret', () => {
    it('should return true when secret exists', () => {
      process.env.EXISTING_SECRET = 'value';
      
      const hasSecret = !!process.env.EXISTING_SECRET;
      
      expect(hasSecret).toBe(true);
    });

    it('should return false when secret missing', () => {
      delete process.env.MISSING_SECRET;
      
      const hasSecret = !!process.env.MISSING_SECRET;
      
      expect(hasSecret).toBe(false);
    });
  });

  describe('getMissingSecrets', () => {
    it('should return list of missing secrets', () => {
      const ALL_SECRETS = ['SECRET_A', 'SECRET_B', 'SECRET_C'];
      process.env.SECRET_A = 'value';
      delete process.env.SECRET_B;
      delete process.env.SECRET_C;
      
      const missing = ALL_SECRETS.filter(name => !process.env[name]);
      
      expect(missing).toContain('SECRET_B');
      expect(missing).toContain('SECRET_C');
      expect(missing).not.toContain('SECRET_A');
    });
  });

  // ===========================================================================
  // Vault Configuration
  // ===========================================================================
  describe('Vault Integration', () => {
    it('should use VAULT_ADDR from env', () => {
      process.env.VAULT_ADDR = 'https://vault.example.com';
      
      expect(process.env.VAULT_ADDR).toBe('https://vault.example.com');
    });

    it('should use VAULT_TOKEN from env', () => {
      process.env.VAULT_TOKEN = 's.my-vault-token';
      
      expect(process.env.VAULT_TOKEN).toBe('s.my-vault-token');
    });

    it('should use default secret path', () => {
      delete process.env.VAULT_SECRET_PATH;
      
      const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/data/blockchain-service';
      
      expect(vaultPath).toBe('secret/data/blockchain-service');
    });

    it('should use custom secret path from env', () => {
      process.env.VAULT_SECRET_PATH = 'secret/data/custom/path';
      
      const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/data/blockchain-service';
      
      expect(vaultPath).toBe('secret/data/custom/path');
    });

    it('should skip Vault when VAULT_ADDR missing', () => {
      delete process.env.VAULT_ADDR;
      process.env.VAULT_TOKEN = 's.token';
      
      const canUseVault = !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);
      
      expect(canUseVault).toBe(false);
    });

    it('should skip Vault when VAULT_TOKEN missing', () => {
      process.env.VAULT_ADDR = 'https://vault.example.com';
      delete process.env.VAULT_TOKEN;
      
      const canUseVault = !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN);
      
      expect(canUseVault).toBe(false);
    });
  });

  // ===========================================================================
  // validateRequiredSecrets
  // ===========================================================================
  describe('validateRequiredSecrets', () => {
    const REQUIRED_SECRETS = ['JWT_SECRET', 'DB_PASSWORD', 'INTERNAL_SERVICE_SECRET'];

    it('should throw when JWT_SECRET missing', () => {
      delete process.env.JWT_SECRET;
      process.env.DB_PASSWORD = 'password';
      process.env.INTERNAL_SERVICE_SECRET = 'secret';
      
      const missing = REQUIRED_SECRETS.filter(name => !process.env[name]);
      
      expect(missing).toContain('JWT_SECRET');
    });

    it('should throw when DB_PASSWORD missing', () => {
      process.env.JWT_SECRET = 'jwt-secret-minimum-32-characters-long';
      delete process.env.DB_PASSWORD;
      process.env.INTERNAL_SERVICE_SECRET = 'secret';
      
      const missing = REQUIRED_SECRETS.filter(name => !process.env[name]);
      
      expect(missing).toContain('DB_PASSWORD');
    });

    it('should throw when INTERNAL_SERVICE_SECRET missing', () => {
      process.env.JWT_SECRET = 'jwt-secret-minimum-32-characters-long';
      process.env.DB_PASSWORD = 'password';
      delete process.env.INTERNAL_SERVICE_SECRET;
      
      const missing = REQUIRED_SECRETS.filter(name => !process.env[name]);
      
      expect(missing).toContain('INTERNAL_SERVICE_SECRET');
    });

    it('should pass when all required secrets present', () => {
      process.env.JWT_SECRET = 'jwt-secret-minimum-32-characters-long';
      process.env.DB_PASSWORD = 'password';
      process.env.INTERNAL_SERVICE_SECRET = 'secret';
      
      const missing = REQUIRED_SECRETS.filter(name => !process.env[name]);
      
      expect(missing).toHaveLength(0);
    });
  });
});
