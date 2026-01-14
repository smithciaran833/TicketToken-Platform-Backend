/**
 * Configuration Validation for Compliance Service
 * 
 * AUDIT FIX CFG-2: No config validation → Zod-based validation
 * 
 * Validates all environment variables on startup.
 * Critical for compliance service since it handles TAX DATA.
 */

import { z } from 'zod';
import { logger } from '../utils/logger';

// =============================================================================
// ENVIRONMENT SCHEMA
// =============================================================================

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  HOST: z.string().default('0.0.0.0'),
  
  // Database - REQUIRED (no defaults in production)
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1), // NEVER allow default - AUDIT FIX SEC-1
  DB_SSL: z.enum(['true', 'false', 'require']).default('false'),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DB_STATEMENT_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
  
  // Redis
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),
  
  // JWT Authentication - REQUIRED
  JWT_SECRET: z.string().min(32), // Minimum 32 chars for security
  JWT_ISSUER: z.string().default('tickettoken'),
  JWT_AUDIENCE: z.string().default('tickettoken-api'),
  
  // Webhook Authentication
  WEBHOOK_SECRET: z.string().min(32).optional(), // Required in prod (validated below)
  
  // Internal Service Auth
  INTERNAL_SERVICE_SECRET: z.string().optional(),
  INTERNAL_SERVICE_ID: z.string().default('compliance-service'),
  
  // Rate Limiting
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  
  // Compliance-Specific Settings
  OFAC_API_URL: z.string().url().optional(),
  OFAC_API_KEY: z.string().optional(),
  TAX_REPORTING_THRESHOLD: z.coerce.number().default(600), // IRS 1099 threshold
  DATA_RETENTION_YEARS: z.coerce.number().int().min(1).max(10).default(7), // IRS requires 7 years
  
  // External Services
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_ENV: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  
  // CORS
  CORS_ORIGIN: z.string().default('*'),
  CORS_CREDENTIALS: z.enum(['true', 'false']).default('false'),
  
  // Trusted Proxies
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

// =============================================================================
// VALIDATION RESULT TYPE
// =============================================================================

export type EnvConfig = z.infer<typeof envSchema>;

// =============================================================================
// VALIDATION FUNCTIONS
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
    validateComplianceRequirements(validatedConfig);
    
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
    
    // Database SSL required in production
    if (config.DB_SSL === 'false') {
      errors.push('DB_SSL must be enabled in production');
    }
    
    // Webhook secret required in production
    if (!config.WEBHOOK_SECRET) {
      errors.push('WEBHOOK_SECRET is required in production');
    }
    
    // Internal service secret required
    if (!config.INTERNAL_SERVICE_SECRET) {
      errors.push('INTERNAL_SERVICE_SECRET is required in production');
    }
    
    // CORS should not be wildcard
    if (config.CORS_ORIGIN === '*') {
      errors.push('CORS_ORIGIN must not be "*" in production');
    }
    
    // Trust proxy should be configured
    if (config.TRUST_PROXY === 'false') {
      logger.warn('TRUST_PROXY is disabled in production - ensure this is intentional');
    }
    
    if (errors.length > 0) {
      logger.fatal({ errors }, 'Production configuration requirements not met');
      process.exit(1);
    }
  }
}

/**
 * Additional validation for compliance-specific requirements
 */
function validateComplianceRequirements(config: EnvConfig): void {
  // Data retention must be at least 7 years for IRS compliance
  if (config.DATA_RETENTION_YEARS < 7) {
    logger.warn({ 
      years: config.DATA_RETENTION_YEARS 
    }, 'DATA_RETENTION_YEARS less than 7 - IRS requires 7 year retention for tax records');
  }
  
  // OFAC API should be configured in production for AML compliance
  if (config.NODE_ENV === 'production' && !config.OFAC_API_URL) {
    logger.warn('OFAC_API_URL not configured - OFAC screening will use mock data');
  }
  
  // Tax reporting threshold validation
  if (config.TAX_REPORTING_THRESHOLD < 600) {
    logger.warn({ 
      threshold: config.TAX_REPORTING_THRESHOLD 
    }, 'TAX_REPORTING_THRESHOLD below IRS minimum of $600');
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
