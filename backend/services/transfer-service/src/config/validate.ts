/**
 * Configuration Validation for Transfer Service
 * 
 * AUDIT FIX LOW-2: No config validation → Zod-based validation
 * 
 * Validates all environment variables on startup
 */

import { z } from 'zod';
import logger from '../utils/logger';

// =============================================================================
// ENVIRONMENT SCHEMA
// =============================================================================

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3019),
  HOST: z.string().default('0.0.0.0'),
  
  // Database
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z.enum(['true', 'false', 'require']).default('false'),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  
  // Redis
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),
  
  // Solana
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_RPC_URL_SECONDARY: z.string().url().optional(),
  SOLANA_RPC_URL_TERTIARY: z.string().url().optional(),
  SOLANA_NETWORK: z.enum(['mainnet-beta', 'devnet', 'testnet']).default('devnet'),
  SOLANA_COMMITMENT: z.enum(['processed', 'confirmed', 'finalized']).default('confirmed'),
  
  // Secrets
  SECRETS_PROVIDER: z.enum(['aws', 'env', 'vault']).default('env'),
  AWS_REGION: z.string().optional(),
  AWS_SECRET_NAME: z.string().optional(),
  
  // JWT (only in dev/test, use secrets manager in prod)
  JWT_SECRET: z.string().optional(),
  JWT_ISSUER: z.string().default('tickettoken'),
  JWT_AUDIENCE: z.string().default('tickettoken-api'),
  
  // Internal Auth
  INTERNAL_SERVICE_SECRET: z.string().optional(),
  INTERNAL_SERVICE_ID: z.string().default('transfer-service'),
  
  // Rate Limiting
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  
  // Transfer Settings
  TRANSFER_EXPIRY_HOURS: z.coerce.number().int().min(1).max(168).default(48),
  TRANSFER_MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  
  // CORS
  CORS_ORIGIN: z.string().default('*'),
  CORS_CREDENTIALS: z.enum(['true', 'false']).default('false'),
  
  // Trusted Proxies
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  TRUSTED_PROXY_IPS: z.string().optional()
});

// =============================================================================
// VALIDATION RESULT TYPE
// =============================================================================

export type EnvConfig = z.infer<typeof envSchema>;

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

let validatedConfig: EnvConfig | null = null;

/**
 * Validate environment configuration
 */
export function validateConfig(): EnvConfig {
  if (validatedConfig) {
    return validatedConfig;
  }
  
  try {
    validatedConfig = envSchema.parse(process.env);
    
    // Additional validation rules
    validateProductionRequirements(validatedConfig);
    
    logger.info('Configuration validated successfully');
    
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }));
      
      logger.fatal({ issues }, 'Configuration validation failed');
      
      // In development, show detailed errors
      if (process.env.NODE_ENV !== 'production') {
        console.error('\n❌ Configuration Validation Failed:\n');
        issues.forEach(issue => {
          console.error(`  • ${issue.field}: ${issue.message}`);
        });
        console.error('\n');
      }
    } else {
      logger.fatal({ error }, 'Configuration validation failed');
    }
    
    process.exit(1);
  }
}

/**
 * Additional validation for production environment
 */
function validateProductionRequirements(config: EnvConfig): void {
  if (config.NODE_ENV === 'production') {
    const errors: string[] = [];
    
    // Secrets must come from secrets manager
    if (config.SECRETS_PROVIDER === 'env') {
      errors.push('SECRETS_PROVIDER must be "aws" or "vault" in production');
    }
    
    // Database SSL required
    if (config.DB_SSL === 'false') {
      errors.push('DB_SSL must be enabled in production');
    }
    
    // Redis TLS recommended
    if (config.REDIS_TLS === 'false' && config.REDIS_URL) {
      logger.warn('Redis TLS is disabled in production - this is not recommended');
    }
    
    // Trust proxy should be configured
    if (config.TRUST_PROXY === 'false') {
      logger.warn('TRUST_PROXY is disabled - ensure this is intentional');
    }
    
    // CORS should not be wildcard
    if (config.CORS_ORIGIN === '*') {
      errors.push('CORS_ORIGIN must not be "*" in production');
    }
    
    if (errors.length > 0) {
      logger.fatal({ errors }, 'Production configuration requirements not met');
      process.exit(1);
    }
  }
}

/**
 * Get validated configuration
 */
export function getConfig(): EnvConfig {
  if (!validatedConfig) {
    return validateConfig();
  }
  return validatedConfig;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return getConfig().NODE_ENV === 'test';
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  validateConfig,
  getConfig,
  isProduction,
  isDevelopment,
  isTest,
  envSchema
};
