/**
 * Secrets Configuration for Blockchain Service
 * 
 * Issues Fixed:
 * - #1: Treasury wallet key plaintext in env → Secrets Manager integration
 * - #24-30: Hardcoded secrets → Centralized secrets management
 * - #57: JWT secret must come from secrets manager
 * - #69: Encrypted wallet key config → AWS KMS/Vault support
 * - #70: Insecure default credentials → Required in production
 */

import { logger } from '../utils/logger';

// Minimum length for JWT_SECRET
const MIN_JWT_SECRET_LENGTH = 32;

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
  'DB_USER'
];

const SOLANA_SECRETS = [
  'TREASURY_WALLET_PRIVATE_KEY',  // Issue #1: Must come from secrets manager
  'SOLANA_RPC_URL',
  'SOLANA_RPC_ENDPOINTS'
];

const REDIS_SECRETS = [
  'REDIS_PASSWORD'
];

// All service secrets
const ALL_SERVICE_SECRETS = [
  ...AUTH_SECRETS,
  ...DATABASE_SECRETS,
  ...SOLANA_SECRETS,
  ...REDIS_SECRETS
];

// AWS config
const AWS_SECRET_NAME = process.env.AWS_SECRET_NAME || 'blockchain-service/secrets';
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
        keysLoaded: Object.keys(secrets).length
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

async function fetchFromVault(): Promise<Record<string, string> | null> {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/data/blockchain-service';

  if (!vaultAddr || !vaultToken) return null;

  try {
    const response = await fetch(`${vaultAddr}/v1/${vaultPath}`, {
      headers: { 'X-Vault-Token': vaultToken }
    });

    if (!response.ok) throw new Error(`Vault responded with ${response.status}`);

    const data = await response.json();
    const secrets = data.data?.data || data.data || {};
    
    logger.info('Secrets loaded from HashiCorp Vault', {
      vaultPath,
      keysLoaded: Object.keys(secrets).length
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
 * Issue #1, #69: Production MUST use secrets manager
 */
export async function loadSecrets(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const forceSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';

  logger.info('Loading secrets...', {
    environment: process.env.NODE_ENV,
    forceSecretsManager
  });

  // In development without secrets manager, use .env
  if (!isProduction && !forceSecretsManager) {
    // Issue #1: Warn if treasury key is in env in development
    if (process.env.TREASURY_WALLET_PRIVATE_KEY) {
      logger.warn('⚠️  TREASURY_WALLET_PRIVATE_KEY found in environment - acceptable only in development');
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
    logger.info('Secrets applied to environment', { loadedCount });
    return;
  }

  // Issue #1, #69: Production MUST have secrets from manager
  if (isProduction) {
    throw new Error(
      'CRITICAL: Failed to load secrets in production. ' +
      'Treasury wallet key MUST come from AWS Secrets Manager or Vault.'
    );
  }

  logger.warn('Running without secrets manager - using environment variables');
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
 * Check if treasury key is properly configured
 * Issue #1: Must not be plaintext in env in production
 */
export function validateTreasuryKeyConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';
  const hasKey = !!process.env.TREASURY_WALLET_PRIVATE_KEY;

  if (isProduction && hasKey && !useSecretsManager) {
    throw new Error(
      'SECURITY ERROR: Treasury wallet key appears to be from environment in production. ' +
      'Use AWS Secrets Manager or Vault instead.'
    );
  }
}

export function hasSecret(name: string): boolean {
  return !!process.env[name];
}

export function getMissingSecrets(): string[] {
  return ALL_SERVICE_SECRETS.filter(name => !process.env[name]);
}

/**
 * AUDIT FIX #57: Validate JWT_SECRET is properly configured
 * 
 * Requirements:
 * - Must be at least 32 characters
 * - Must not be a common/default value
 * - Should come from secrets manager in production
 * 
 * SECURITY: Never logs the actual secret value
 */
export function validateJwtSecret(): void {
  const jwtSecret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Check if JWT_SECRET exists
  if (!jwtSecret) {
    throw new Error(
      'JWT_SECRET is not configured. ' +
      'Please set it in your environment or secrets manager.'
    );
  }
  
  // Check minimum length
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
  
  // Log success without the actual value
  logger.info('JWT_SECRET validated', {
    valid: true,
    length: jwtSecret.length,
    source: process.env.USE_SECRETS_MANAGER === 'true' ? 'secrets-manager' : 'environment',
    security: 'Secret value not logged'
  });
}

/**
 * Get JWT secret for token operations
 * Returns the secret or throws if not configured
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  
  return secret;
}

/**
 * Required secrets that must be validated at startup
 */
export const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'DB_PASSWORD',
  'INTERNAL_SERVICE_SECRET'
];

/**
 * Validate all required secrets at startup
 */
export function validateRequiredSecrets(): void {
  logger.info('Validating required secrets...');
  
  const missing: string[] = [];
  
  for (const secret of REQUIRED_SECRETS) {
    if (!process.env[secret]) {
      missing.push(secret);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required secrets: ${missing.join(', ')}. ` +
      'Please configure these in your environment or secrets manager.'
    );
  }
  
  // Validate JWT_SECRET specifically (AUDIT FIX #57)
  validateJwtSecret();
  
  logger.info('All required secrets validated', {
    count: REQUIRED_SECRETS.length,
    security: 'Values not logged'
  });
}

export const SecretCategories = {
  AUTH: AUTH_SECRETS,
  DATABASE: DATABASE_SECRETS,
  SOLANA: SOLANA_SECRETS,
  REDIS: REDIS_SECRETS,
  ALL: ALL_SERVICE_SECRETS,
  REQUIRED: REQUIRED_SECRETS
};
