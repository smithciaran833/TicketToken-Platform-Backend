/**
 * Secrets Configuration for Transfer Service
 *
 * AUDIT FIXES:
 * - SEC-2/CFG-1/BC-1: Solana treasury key from env var → Secrets Manager
 * - S2S-1/CFG-2: JWT secret from env var → Secrets Manager
 * - SEC-3: Solana keys bypass secrets manager → Now included
 * - SEC-H4: Secrets manager only partial → Full coverage
 *
 * Features:
 * - AWS Secrets Manager integration
 * - HashiCorp Vault fallback
 * - JWT secret validation
 * - Production enforcement
 */

import { logger } from '../utils/logger';

// Minimum length for secrets
const MIN_JWT_SECRET_LENGTH = 32;
const MIN_SERVICE_SECRET_LENGTH = 32;

// AWS Secrets Manager client (lazy loaded)
let secretsManagerClient: any = null;

// =============================================================================
// SECRETS CATEGORIES
// =============================================================================

const AUTH_SECRETS = [
  'JWT_SECRET',
  'INTERNAL_SERVICE_SECRET',
  'WEBHOOK_SECRET'
];

const DATABASE_SECRETS = [
  'DB_PASSWORD',
  'DB_HOST',
  'DB_USER',
  'DB_NAME'
];

const SOLANA_SECRETS = [
  'SOLANA_TREASURY_PRIVATE_KEY',  // AUDIT FIX SEC-2: Must come from secrets manager
  'SOLANA_RPC_URL',
  'SOLANA_RPC_ENDPOINTS',         // For RPC failover
  'SOLANA_COLLECTION_MINT'
];

const REDIS_SECRETS = [
  'REDIS_PASSWORD',
  'REDIS_URL'
];

// All service secrets
const ALL_SERVICE_SECRETS = [
  ...AUTH_SECRETS,
  ...DATABASE_SECRETS,
  ...SOLANA_SECRETS,
  ...REDIS_SECRETS
];

// Required in production
const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'DB_PASSWORD',
  'INTERNAL_SERVICE_SECRET',
  'SOLANA_TREASURY_PRIVATE_KEY',
  'SOLANA_RPC_URL'
];

// AWS config
const AWS_SECRET_NAME = process.env.AWS_SECRET_NAME || 'transfer-service/secrets';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// =============================================================================
// AWS SECRETS MANAGER
// =============================================================================

async function getSecretsManagerClient(): Promise<any> {
  if (!secretsManagerClient) {
    try {
      const { SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
      secretsManagerClient = new SecretsManagerClient({ region: AWS_REGION });
    } catch (error) {
      logger.warn('AWS Secrets Manager SDK not available', {
        error: (error as Error).message
      });
      return null;
    }
  }
  return secretsManagerClient;
}

async function fetchFromSecretsManager(): Promise<Record<string, string> | null> {
  const client = await getSecretsManagerClient();
  if (!client) return null;

  try {
    const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const command = new GetSecretValueCommand({ SecretId: AWS_SECRET_NAME });
    const response = await client.send(command);

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      logger.info('Secrets loaded from AWS Secrets Manager', {
        secretName: AWS_SECRET_NAME,
        keysLoaded: Object.keys(secrets).length,
        security: 'Values not logged'
      });
      return secrets;
    }
    return null;
  } catch (error) {
    logger.error('Failed to fetch secrets from AWS Secrets Manager', {
      secretName: AWS_SECRET_NAME,
      error: (error as Error).message
    });
    return null;
  }
}

// =============================================================================
// HASHICORP VAULT
// =============================================================================

interface VaultResponse {
  data?: {
    data?: Record<string, string>;
  } & Record<string, string>;
}

async function fetchFromVault(): Promise<Record<string, string> | null> {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/data/transfer-service';

  if (!vaultAddr || !vaultToken) return null;

  try {
    const response = await fetch(`${vaultAddr}/v1/${vaultPath}`, {
      headers: { 'X-Vault-Token': vaultToken }
    });

    if (!response.ok) throw new Error(`Vault responded with ${response.status}`);

    const data = await response.json() as VaultResponse;
    const secrets = data.data?.data || data.data || {};

    logger.info('Secrets loaded from HashiCorp Vault', {
      vaultPath,
      keysLoaded: Object.keys(secrets).length,
      security: 'Values not logged'
    });
    return secrets;
  } catch (error) {
    logger.error('Failed to fetch secrets from Vault', {
      vaultPath,
      error: (error as Error).message
    });
    return null;
  }
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Load secrets from appropriate source
 * AUDIT FIX SEC-2, CFG-1, BC-1: Production MUST use secrets manager for Solana keys
 */
export async function loadSecrets(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const forceSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';

  logger.info('Loading secrets...', {
    environment: process.env.NODE_ENV,
    forceSecretsManager,
    service: 'transfer-service'
  });

  // In development without secrets manager, use .env
  if (!isProduction && !forceSecretsManager) {
    // AUDIT FIX SEC-2: Warn if treasury key is in env in development
    if (process.env.SOLANA_TREASURY_PRIVATE_KEY) {
      logger.warn('⚠️  SOLANA_TREASURY_PRIVATE_KEY found in environment - acceptable only in development', {
        security: 'WARNING',
        hint: 'Use AWS Secrets Manager or Vault in production'
      });
    }
    if (process.env.JWT_SECRET) {
      logger.warn('⚠️  JWT_SECRET found in environment - acceptable only in development', {
        security: 'WARNING'
      });
    }
    logger.info('Development mode - secrets loaded from .env file');
    return;
  }

  // Try AWS Secrets Manager first
  let secrets = await fetchFromSecretsManager();

  // Fall back to Vault if AWS fails
  if (!secrets) {
    secrets = await fetchFromVault();
  }

  if (secrets) {
    let loadedCount = 0;
    for (const key of ALL_SERVICE_SECRETS) {
      if (secrets[key] && !process.env[key]) {
        process.env[key] = secrets[key];
        loadedCount++;
      }
    }
    logger.info('Secrets applied to environment', {
      loadedCount,
      security: 'Values not logged'
    });
    return;
  }

  // AUDIT FIX SEC-2, CFG-1, BC-1: Production MUST have secrets from manager
  if (isProduction) {
    throw new Error(
      'CRITICAL: Failed to load secrets in production. ' +
      'SOLANA_TREASURY_PRIVATE_KEY and JWT_SECRET MUST come from AWS Secrets Manager or Vault. ' +
      'This is a security requirement - secrets cannot be in environment variables in production.'
    );
  }

  logger.warn('Running without secrets manager - using environment variables', {
    security: 'WARNING - Not recommended for production'
  });
}

/**
 * Get a specific secret value
 */
export function getSecret(name: string, required: boolean = true): string | undefined {
  const value = process.env[name];

  if (!value && required) {
    throw new Error(`Required secret ${name} is not configured`);
  }

  return value;
}

/**
 * Check if Solana treasury key is properly configured
 * AUDIT FIX SEC-2, CFG-1, BC-1: Must not be plaintext in env in production
 */
export function validateTreasuryKeyConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';
  const hasKey = !!process.env.SOLANA_TREASURY_PRIVATE_KEY;

  if (isProduction && hasKey && !useSecretsManager) {
    throw new Error(
      'SECURITY ERROR: SOLANA_TREASURY_PRIVATE_KEY appears to be from environment in production. ' +
      'Use AWS Secrets Manager or Vault instead. This protects against key exposure in logs, ' +
      'process listings, and environment dumps.'
    );
  }

  if (hasKey) {
    // Validate key format (should be base58 encoded)
    const key = process.env.SOLANA_TREASURY_PRIVATE_KEY!;
    if (key.length < 64 || key.length > 100) {
      throw new Error(
        'SOLANA_TREASURY_PRIVATE_KEY has invalid length. ' +
        'Expected base58-encoded private key (64-88 characters).'
      );
    }
  }
}

/**
 * AUDIT FIX S2S-1, CFG-2: Validate JWT_SECRET is properly configured
 */
export function validateJwtSecret(): void {
  const jwtSecret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!jwtSecret) {
    throw new Error(
      'JWT_SECRET is not configured. ' +
      'Please set it in your environment or secrets manager.'
    );
  }

  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters. ` +
      `Current length: ${jwtSecret.length}. ` +
      'Please use a longer, cryptographically secure secret.'
    );
  }

  // Check for common/weak secrets
  const weakSecrets = [
    'secret',
    'your-secret-key',
    'jwt-secret',
    'change-me',
    'development',
    'test-secret',
    'your_jwt_secret_key_here',
    'supersecretkey',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  ];

  if (weakSecrets.some(weak => jwtSecret.toLowerCase().includes(weak))) {
    if (isProduction) {
      throw new Error(
        'SECURITY ERROR: JWT_SECRET appears to be a weak/default value. ' +
        'Use a cryptographically secure random string in production.'
      );
    } else {
      logger.warn('JWT_SECRET appears to be a weak/default value', {
        security: 'WARNING',
        hint: 'This will fail in production - use a secure random string'
      });
    }
  }

  logger.info('JWT_SECRET validated', {
    valid: true,
    length: jwtSecret.length,
    source: process.env.USE_SECRETS_MANAGER === 'true' ? 'secrets-manager' : 'environment',
    security: 'Secret value not logged'
  });
}

/**
 * Validate internal service secret
 */
export function validateInternalServiceSecret(): void {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      throw new Error('INTERNAL_SERVICE_SECRET is required in production');
    }
    logger.warn('INTERNAL_SERVICE_SECRET not configured - S2S auth will be disabled');
    return;
  }

  if (secret.length < MIN_SERVICE_SECRET_LENGTH) {
    throw new Error(
      `INTERNAL_SERVICE_SECRET must be at least ${MIN_SERVICE_SECRET_LENGTH} characters`
    );
  }

  logger.info('INTERNAL_SERVICE_SECRET validated', {
    valid: true,
    length: secret.length,
    security: 'Secret value not logged'
  });
}

/**
 * Get JWT secret for token operations
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return secret;
}

/**
 * Get Solana treasury private key
 * AUDIT FIX SEC-2: Centralized access point for treasury key
 */
export function getTreasuryPrivateKey(): string {
  const key = process.env.SOLANA_TREASURY_PRIVATE_KEY;

  if (!key) {
    throw new Error('SOLANA_TREASURY_PRIVATE_KEY is not configured');
  }

  return key;
}

/**
 * Check if a secret exists
 */
export function hasSecret(name: string): boolean {
  return !!process.env[name];
}

/**
 * Get list of missing required secrets
 */
export function getMissingSecrets(): string[] {
  return REQUIRED_SECRETS.filter(name => !process.env[name]);
}

/**
 * Validate all required secrets at startup
 */
export async function validateRequiredSecrets(): Promise<void> {
  logger.info('Validating required secrets...');

  const missing = getMissingSecrets();

  if (missing.length > 0) {
    const isProduction = process.env.NODE_ENV === 'production';
    const message = `Missing required secrets: ${missing.join(', ')}`;

    if (isProduction) {
      throw new Error(message + '. Cannot start in production without all required secrets.');
    } else {
      logger.warn(message, {
        hint: 'Some features may not work correctly',
        missing
      });
    }
  }

  // Validate individual secrets
  validateJwtSecret();
  validateTreasuryKeyConfig();
  validateInternalServiceSecret();

  logger.info('Required secrets validated', {
    count: REQUIRED_SECRETS.length - missing.length,
    missing: missing.length,
    security: 'Values not logged'
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export const SecretCategories = {
  AUTH: AUTH_SECRETS,
  DATABASE: DATABASE_SECRETS,
  SOLANA: SOLANA_SECRETS,
  REDIS: REDIS_SECRETS,
  ALL: ALL_SERVICE_SECRETS,
  REQUIRED: REQUIRED_SECRETS
};

export default {
  loadSecrets,
  validateRequiredSecrets,
  getSecret,
  getJwtSecret,
  getTreasuryPrivateKey,
  hasSecret,
  getMissingSecrets,
  SecretCategories
};
