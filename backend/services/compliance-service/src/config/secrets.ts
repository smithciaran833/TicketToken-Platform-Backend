/**
 * Secrets Manager for Compliance Service
 * 
 * AUDIT FIX: CFG-H1 - Use secrets manager for JWT_SECRET
 * 
 * Supports:
 * - AWS Secrets Manager
 * - HashiCorp Vault
 * - Environment variables (fallback)
 */
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface SecretConfig {
  provider: 'aws' | 'vault' | 'env';
  aws?: {
    region: string;
    secretName: string;
  };
  vault?: {
    address: string;
    token: string;
    path: string;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
}

export interface SecretsCache {
  [key: string]: {
    value: string;
    expiresAt: number;
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: SecretConfig = {
  provider: (process.env.SECRETS_PROVIDER as 'aws' | 'vault' | 'env') || 'env',
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    secretName: process.env.AWS_SECRET_NAME || 'compliance-service/secrets'
  },
  vault: {
    address: process.env.VAULT_ADDR || 'http://localhost:8200',
    token: process.env.VAULT_TOKEN || '',
    path: process.env.VAULT_PATH || 'secret/data/compliance-service'
  },
  cache: {
    enabled: true,
    ttlSeconds: 300 // 5 minutes
  }
};

// In-memory cache for secrets
const secretsCache: SecretsCache = {};

// =============================================================================
// SECRETS PROVIDERS
// =============================================================================

/**
 * Fetch secret from AWS Secrets Manager
 */
async function fetchFromAWS(secretName: string, key: string): Promise<string> {
  try {
    // Dynamic import to avoid bundling AWS SDK if not used
    // @ts-ignore - AWS SDK may not be installed
    const awsModule = await import('@aws-sdk/client-secrets-manager').catch(() => null);
    
    if (!awsModule) {
      throw new Error('AWS SDK not installed - run: npm install @aws-sdk/client-secrets-manager');
    }
    
    const { SecretsManagerClient, GetSecretValueCommand } = awsModule;
    
    const client = new SecretsManagerClient({
      region: DEFAULT_CONFIG.aws?.region
    });
    
    const command = new GetSecretValueCommand({
      SecretId: secretName
    });
    
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }
    
    const secrets = JSON.parse(response.SecretString);
    
    if (!secrets[key]) {
      throw new Error(`Key ${key} not found in secret`);
    }
    
    return secrets[key];
  } catch (error: any) {
    logger.error({
      provider: 'aws',
      secretName,
      key,
      error: error.message
    }, 'Failed to fetch secret from AWS');
    throw error;
  }
}

/**
 * Fetch secret from HashiCorp Vault
 */
async function fetchFromVault(path: string, key: string): Promise<string> {
  try {
    const vaultAddr = DEFAULT_CONFIG.vault?.address;
    const vaultToken = DEFAULT_CONFIG.vault?.token;
    
    if (!vaultToken) {
      throw new Error('VAULT_TOKEN not configured');
    }
    
    const response = await fetch(`${vaultAddr}/v1/${path}`, {
      headers: {
        'X-Vault-Token': vaultToken
      }
    });
    
    if (!response.ok) {
      throw new Error(`Vault returned ${response.status}`);
    }
    
    const data = await response.json();
    const secrets = data.data?.data || data.data;
    
    if (!secrets[key]) {
      throw new Error(`Key ${key} not found in Vault path`);
    }
    
    return secrets[key];
  } catch (error: any) {
    logger.error({
      provider: 'vault',
      path,
      key,
      error: error.message
    }, 'Failed to fetch secret from Vault');
    throw error;
  }
}

/**
 * Fetch secret from environment variable
 */
function fetchFromEnv(key: string): string {
  const value = process.env[key];
  
  if (!value) {
    throw new Error(`Environment variable ${key} not set`);
  }
  
  return value;
}

// =============================================================================
// SECRET MANAGER
// =============================================================================

/**
 * Get a secret value with caching
 */
export async function getSecret(key: string): Promise<string> {
  // Check cache first
  if (DEFAULT_CONFIG.cache.enabled) {
    const cached = secretsCache[key];
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }
  
  let value: string;
  
  switch (DEFAULT_CONFIG.provider) {
    case 'aws':
      value = await fetchFromAWS(
        DEFAULT_CONFIG.aws?.secretName || '',
        key
      );
      break;
      
    case 'vault':
      value = await fetchFromVault(
        DEFAULT_CONFIG.vault?.path || '',
        key
      );
      break;
      
    case 'env':
    default:
      value = fetchFromEnv(key);
      break;
  }
  
  // Cache the value
  if (DEFAULT_CONFIG.cache.enabled) {
    secretsCache[key] = {
      value,
      expiresAt: Date.now() + (DEFAULT_CONFIG.cache.ttlSeconds * 1000)
    };
  }
  
  return value;
}

/**
 * Get JWT secret with validation
 * CFG-H1: Centralized JWT secret retrieval
 */
export async function getJWTSecret(): Promise<string> {
  const secret = await getSecret('JWT_SECRET');
  
  // Validate secret strength
  if (secret.length < 32) {
    logger.warn('JWT_SECRET is less than 32 characters - consider using a stronger secret');
  }
  
  return secret;
}

/**
 * Get webhook secret with validation
 */
export async function getWebhookSecret(): Promise<string> {
  const secret = await getSecret('WEBHOOK_SECRET');
  
  if (secret.length < 16) {
    throw new Error('WEBHOOK_SECRET must be at least 16 characters');
  }
  
  return secret;
}

/**
 * Get Stripe webhook secret
 */
export async function getStripeWebhookSecret(): Promise<string> {
  return getSecret('STRIPE_WEBHOOK_SECRET');
}

/**
 * Get internal service auth token
 */
export async function getInternalServiceToken(): Promise<string> {
  return getSecret('INTERNAL_SERVICE_TOKEN');
}

/**
 * Get database connection string
 */
export async function getDatabaseUrl(): Promise<string> {
  return getSecret('DATABASE_URL');
}

/**
 * Clear secrets cache
 */
export function clearSecretsCache(): void {
  Object.keys(secretsCache).forEach(key => {
    delete secretsCache[key];
  });
  logger.info('Secrets cache cleared');
}

/**
 * Refresh a specific secret in cache
 */
export async function refreshSecret(key: string): Promise<void> {
  delete secretsCache[key];
  await getSecret(key);
  logger.info({ key }, 'Secret refreshed');
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize secrets manager and pre-fetch critical secrets
 */
export async function initializeSecrets(): Promise<void> {
  logger.info({
    provider: DEFAULT_CONFIG.provider,
    cacheEnabled: DEFAULT_CONFIG.cache.enabled,
    cacheTTL: DEFAULT_CONFIG.cache.ttlSeconds
  }, 'Initializing secrets manager');
  
  try {
    // Pre-fetch critical secrets
    await getJWTSecret();
    await getWebhookSecret();
    
    logger.info('Secrets manager initialized successfully');
  } catch (error: any) {
    logger.error({
      error: error.message
    }, 'Failed to initialize secrets manager');
    throw error;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getSecret,
  getJWTSecret,
  getWebhookSecret,
  getStripeWebhookSecret,
  getInternalServiceToken,
  getDatabaseUrl,
  clearSecretsCache,
  refreshSecret,
  initializeSecrets
};
