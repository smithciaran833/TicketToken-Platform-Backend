import logger from '../utils/logger';

// =============================================================================
// SECRETS CONFIGURATION
// =============================================================================

// AWS Secrets Manager client (lazy loaded)
let secretsManagerClient: any = null;

// Secrets by category
const IPFS_SECRETS = [
  'PINATA_API_KEY',
  'PINATA_SECRET_API_KEY',
  'PINATA_JWT'
];

const AUTH_SECRETS = [
  'JWT_SECRET',
  'INTERNAL_SERVICE_SECRET',
  'WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET'
];

const DATABASE_SECRETS = [
  'DB_PASSWORD',
  'DB_HOST',
  'DB_USER'
];

const SOLANA_SECRETS = [
  'WALLET_PRIVATE_KEY',
  'SOLANA_RPC_URL'
];

const REDIS_SECRETS = [
  'REDIS_PASSWORD'
];

// All service secrets
const ALL_SERVICE_SECRETS = [
  ...AUTH_SECRETS,
  ...IPFS_SECRETS,
  ...DATABASE_SECRETS,
  ...SOLANA_SECRETS,
  ...REDIS_SECRETS
];

// AWS Secrets Manager secret name (contains all minting service secrets)
const AWS_SECRET_NAME = process.env.AWS_SECRET_NAME || 'minting-service/secrets';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// =============================================================================
// SECRETS MANAGER INTEGRATION
// =============================================================================

/**
 * Get AWS Secrets Manager client (lazy initialization)
 */
async function getSecretsManagerClient(): Promise<any> {
  if (!secretsManagerClient) {
    try {
      // Dynamic import to avoid issues if AWS SDK is not installed
      const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
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

/**
 * Fetch secrets from AWS Secrets Manager
 */
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

/**
 * Fetch secrets from HashiCorp Vault (alternative to AWS)
 */
async function fetchFromVault(): Promise<Record<string, string> | null> {
  const vaultAddr = process.env.VAULT_ADDR;
  const vaultToken = process.env.VAULT_TOKEN;
  const vaultPath = process.env.VAULT_SECRET_PATH || 'secret/data/minting-service';

  if (!vaultAddr || !vaultToken) {
    return null;
  }

  try {
    const response = await fetch(`${vaultAddr}/v1/${vaultPath}`, {
      headers: {
        'X-Vault-Token': vaultToken
      }
    });

    if (!response.ok) {
      throw new Error(`Vault responded with ${response.status}`);
    }

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
 * Load secrets from appropriate source based on environment
 * 
 * In development: Secrets come from .env file (already loaded)
 * In production: Load from AWS Secrets Manager or Vault
 */
export async function loadSecrets(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const forceSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';

  logger.info('Loading secrets...', {
    environment: process.env.NODE_ENV,
    forceSecretsManager
  });

  // In development without explicit secrets manager, use .env
  if (!isProduction && !forceSecretsManager) {
    logger.info('Development mode - secrets loaded from .env file');
    return;
  }

  // Try AWS Secrets Manager first
  let secrets = await fetchFromSecretsManager();

  // Fall back to Vault if AWS fails
  if (!secrets) {
    secrets = await fetchFromVault();
  }

  // If we got secrets, set them as environment variables
  if (secrets) {
    let loadedCount = 0;
    
    for (const key of ALL_SERVICE_SECRETS) {
      if (secrets[key] && !process.env[key]) {
        // Only set if not already set (env vars take precedence)
        process.env[key] = secrets[key];
        loadedCount++;
      }
    }

    logger.info('Secrets applied to environment', { loadedCount });
    return;
  }

  // In production, fail if we couldn't load secrets
  if (isProduction) {
    throw new Error(
      'Failed to load secrets in production environment. ' +
      'Ensure AWS Secrets Manager or Vault is properly configured.'
    );
  }

  logger.warn('Running without secrets manager - using environment variables');
}

/**
 * Get a specific secret value
 * Throws if secret is not found and required
 */
export function getSecret(name: string, required: boolean = true): string | undefined {
  const value = process.env[name];
  
  if (!value && required) {
    throw new Error(`Required secret ${name} is not configured`);
  }
  
  return value;
}

/**
 * Check if a secret exists
 */
export function hasSecret(name: string): boolean {
  return !!process.env[name];
}

/**
 * Get all loaded secrets (names only, not values - for debugging)
 */
export function getLoadedSecretNames(): string[] {
  return ALL_SERVICE_SECRETS.filter(name => !!process.env[name]);
}

/**
 * Get missing required secrets
 */
export function getMissingSecrets(): string[] {
  return ALL_SERVICE_SECRETS.filter(name => !process.env[name]);
}

// Export categories for reference
export const SecretCategories = {
  IPFS: IPFS_SECRETS,
  AUTH: AUTH_SECRETS,
  DATABASE: DATABASE_SECRETS,
  SOLANA: SOLANA_SECRETS,
  REDIS: REDIS_SECRETS,
  ALL: ALL_SERVICE_SECRETS
};
