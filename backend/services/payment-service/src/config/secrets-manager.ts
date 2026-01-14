/**
 * Secrets Manager
 * 
 * HIGH FIX: Abstracts secret retrieval from environment variables
 * to support AWS Secrets Manager, HashiCorp Vault, or env vars.
 * 
 * Features:
 * - Secrets caching with TTL
 * - Automatic refresh before expiry
 * - Support for multiple backends
 * - No secrets in code
 */

import { logger } from '../utils/logger';

const log = logger.child({ component: 'SecretsManager' });

// =============================================================================
// TYPES
// =============================================================================

export interface Secret {
  value: string;
  expiresAt?: Date;
}

export interface SecretsConfig {
  backend: 'env' | 'aws' | 'vault';
  awsRegion?: string;
  awsSecretPrefix?: string;
  vaultAddr?: string;
  vaultToken?: string;
  cacheTtlMs?: number;
  refreshBeforeExpiryMs?: number;
}

export type SecretName = 
  | 'JWT_SECRET'
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_WEBHOOK_SECRET'
  | 'HMAC_SECRET'
  | 'SERVICE_AUTH_SECRET'
  | 'DATABASE_URL'
  | 'REDIS_URL';

// =============================================================================
// SECRETS CACHE
// =============================================================================

class SecretsCache {
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();
  private defaultTtlMs = 5 * 60 * 1000; // 5 minutes

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  set(key: string, value: string, ttlMs?: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs || this.defaultTtlMs),
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// =============================================================================
// SECRETS MANAGER
// =============================================================================

class SecretsManager {
  private config: SecretsConfig;
  private cache: SecretsCache;
  private refreshTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config?: Partial<SecretsConfig>) {
    this.config = {
      backend: (process.env.SECRETS_BACKEND as SecretsConfig['backend']) || 'env',
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      awsSecretPrefix: process.env.AWS_SECRET_PREFIX || 'tickettoken/payment-service',
      vaultAddr: process.env.VAULT_ADDR,
      vaultToken: process.env.VAULT_TOKEN,
      cacheTtlMs: parseInt(process.env.SECRETS_CACHE_TTL_MS || '300000', 10),
      refreshBeforeExpiryMs: parseInt(process.env.SECRETS_REFRESH_BEFORE_MS || '60000', 10),
      ...config,
    };
    
    this.cache = new SecretsCache();
    
    log.info({ backend: this.config.backend }, 'Secrets manager initialized');
  }

  /**
   * Get a secret by name
   */
  async getSecret(name: SecretName): Promise<string> {
    // Check cache first
    const cached = this.cache.get(name);
    if (cached) {
      return cached;
    }

    // Fetch from backend
    let value: string;
    
    switch (this.config.backend) {
      case 'aws':
        value = await this.getFromAws(name);
        break;
      case 'vault':
        value = await this.getFromVault(name);
        break;
      case 'env':
      default:
        value = this.getFromEnv(name);
        break;
    }

    // Validate critical secrets
    this.validateSecret(name, value);

    // Cache the value
    this.cache.set(name, value, this.config.cacheTtlMs);

    // Schedule refresh if using a dynamic backend
    if (this.config.backend !== 'env') {
      this.scheduleRefresh(name);
    }

    return value;
  }

  /**
   * Get secret from environment variable
   */
  private getFromEnv(name: SecretName): string {
    const value = process.env[name];
    
    if (!value) {
      throw new Error(`Required secret ${name} not found in environment`);
    }

    return value;
  }

  /**
   * Get secret from AWS Secrets Manager
   */
  private async getFromAws(name: SecretName): Promise<string> {
    try {
      // Dynamic import to avoid loading AWS SDK if not needed
      const { SecretsManager: AwsSecretsManager } = await import('@aws-sdk/client-secrets-manager');
      
      const client = new AwsSecretsManager({
        region: this.config.awsRegion,
      });

      const secretId = `${this.config.awsSecretPrefix}/${name}`;
      
      const response = await client.getSecretValue({
        SecretId: secretId,
      });

      if (!response.SecretString) {
        throw new Error(`Secret ${secretId} has no string value`);
      }

      // Handle JSON secrets
      try {
        const parsed = JSON.parse(response.SecretString);
        return parsed.value || response.SecretString;
      } catch {
        return response.SecretString;
      }
    } catch (error) {
      log.error({ error, name }, 'Failed to get secret from AWS');
      
      // Fall back to environment variable
      return this.getFromEnv(name);
    }
  }

  /**
   * Get secret from HashiCorp Vault
   */
  private async getFromVault(name: SecretName): Promise<string> {
    if (!this.config.vaultAddr || !this.config.vaultToken) {
      log.warn('Vault not configured, falling back to env');
      return this.getFromEnv(name);
    }

    try {
      const response = await fetch(
        `${this.config.vaultAddr}/v1/secret/data/payment-service/${name}`,
        {
          headers: {
            'X-Vault-Token': this.config.vaultToken,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Vault returned ${response.status}`);
      }

      const data = await response.json() as { data?: { data?: { value: string } } };
      return data.data?.data?.value as string;
    } catch (error) {
      log.error({ error, name }, 'Failed to get secret from Vault');
      
      // Fall back to environment variable
      return this.getFromEnv(name);
    }
  }

  /**
   * Validate a secret meets security requirements
   */
  private validateSecret(name: SecretName, value: string): void {
    const minLengths: Partial<Record<SecretName, number>> = {
      JWT_SECRET: 32,
      HMAC_SECRET: 32,
      SERVICE_AUTH_SECRET: 32,
      STRIPE_SECRET_KEY: 20,
      STRIPE_WEBHOOK_SECRET: 20,
    };

    const minLength = minLengths[name];
    if (minLength && value.length < minLength) {
      throw new Error(`Secret ${name} must be at least ${minLength} characters`);
    }

    // Check for known insecure defaults
    const insecureDefaults = [
      'your-secret-key',
      'changeme',
      'password',
      'secret',
      'test',
      'development',
    ];

    const lowerValue = value.toLowerCase();
    for (const insecure of insecureDefaults) {
      if (lowerValue.includes(insecure)) {
        throw new Error(`Secret ${name} contains insecure default value`);
      }
    }
  }

  /**
   * Schedule automatic refresh of a secret
   */
  private scheduleRefresh(name: SecretName): void {
    // Clear existing timer
    const existingTimer = this.refreshTimers.get(name);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new refresh
    const refreshDelay = (this.config.cacheTtlMs || 300000) - (this.config.refreshBeforeExpiryMs || 60000);
    
    const timer = setTimeout(async () => {
      try {
        // Clear cache to force refresh
        this.cache.delete(name);
        await this.getSecret(name);
        log.debug({ name }, 'Secret refreshed');
      } catch (error) {
        log.error({ error, name }, 'Failed to refresh secret');
      }
    }, refreshDelay);

    this.refreshTimers.set(name, timer);
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(...names: SecretName[]): Promise<Record<SecretName, string>> {
    const result: Partial<Record<SecretName, string>> = {};
    
    await Promise.all(
      names.map(async (name) => {
        result[name] = await this.getSecret(name);
      })
    );

    return result as Record<SecretName, string>;
  }

  /**
   * Rotate a secret (invalidate cache)
   */
  rotateSecret(name: SecretName): void {
    this.cache.delete(name);
    log.info({ name }, 'Secret cache invalidated');
  }

  /**
   * Clear all cached secrets
   */
  clearCache(): void {
    this.cache.clear();
    log.info('All secret caches cleared');
  }

  /**
   * Cleanup (call on shutdown)
   */
  cleanup(): void {
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.cache.clear();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const secretsManager = new SecretsManager();

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Get JWT secret
 */
export async function getJwtSecret(): Promise<string> {
  return secretsManager.getSecret('JWT_SECRET');
}

/**
 * Get Stripe secret key
 */
export async function getStripeSecretKey(): Promise<string> {
  return secretsManager.getSecret('STRIPE_SECRET_KEY');
}

/**
 * Get Stripe webhook secret
 */
export async function getStripeWebhookSecret(): Promise<string> {
  return secretsManager.getSecret('STRIPE_WEBHOOK_SECRET');
}

/**
 * Get HMAC secret
 */
export async function getHmacSecret(): Promise<string> {
  return secretsManager.getSecret('HMAC_SECRET');
}

/**
 * Get service auth secret
 */
export async function getServiceAuthSecret(): Promise<string> {
  return secretsManager.getSecret('SERVICE_AUTH_SECRET');
}

/**
 * Validate all required secrets at startup
 */
export async function validateRequiredSecrets(): Promise<void> {
  const requiredSecrets: SecretName[] = [
    'JWT_SECRET',
    'DATABASE_URL',
  ];

  const productionSecrets: SecretName[] = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  const allRequired = process.env.NODE_ENV === 'production'
    ? [...requiredSecrets, ...productionSecrets]
    : requiredSecrets;

  for (const name of allRequired) {
    try {
      await secretsManager.getSecret(name);
      log.info({ name }, 'Secret validated');
    } catch (error) {
      log.fatal({ error, name }, 'Required secret validation failed');
      throw error;
    }
  }

  log.info('All required secrets validated');
}
