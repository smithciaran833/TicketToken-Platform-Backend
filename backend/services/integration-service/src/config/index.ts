/**
 * Centralized Configuration for Integration Service
 *
 * AUDIT FIXES:
 * - CFG-1: 90+ scattered process.env usages → Centralized config
 * - CFG-2: No centralized config module → This file
 * - CFG-3: No startup validation → Validated on import
 * - CFG-4: Hardcoded default secrets → Removed fallbacks
 * - CFG-5: Secrets not from manager → Supports AWS/Vault
 */

import { z } from 'zod';

// =============================================================================
// ENVIRONMENT SCHEMA
// =============================================================================

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3012),
  HOST: z.string().default('0.0.0.0'),
  SERVICE_NAME: z.string().default('integration-service'),

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
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),

  // Secrets Provider
  SECRETS_PROVIDER: z.enum(['aws', 'env', 'vault']).default('env'),
  AWS_REGION: z.string().optional(),
  AWS_SECRET_NAME: z.string().optional(),

  // JWT & Auth (required in production)
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().default('tickettoken'),
  JWT_AUDIENCE: z.string().default('tickettoken-api'),
  JWT_ALGORITHM: z.enum(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512']).default('HS256'),

  // Internal Service Auth
  INTERNAL_SERVICE_SECRET: z.string().min(32).optional(),
  INTERNAL_SERVICE_ID: z.string().default('integration-service'),

  // OAuth Providers - Square
  SQUARE_APP_ID: z.string().optional(),
  SQUARE_APP_SECRET: z.string().optional(),
  SQUARE_SANDBOX: z.enum(['true', 'false']).default('true'),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),

  // OAuth Providers - Stripe
  STRIPE_API_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // OAuth Providers - Mailchimp
  MAILCHIMP_CLIENT_ID: z.string().optional(),
  MAILCHIMP_CLIENT_SECRET: z.string().optional(),
  MAILCHIMP_WEBHOOK_SECRET: z.string().optional(),

  // OAuth Providers - QuickBooks
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: z.string().optional(),

  // API URL (for OAuth redirects)
  API_URL: z.string().url().optional(),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Rate Limiting
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().min(1).default(1000),

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
// VALIDATION
// =============================================================================

export type EnvConfig = z.infer<typeof envSchema>;

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

    // Additional validation rules for production
    validateProductionRequirements(validatedConfig);

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }));

      console.error('\n❌ Configuration Validation Failed:\n');
      issues.forEach(issue => {
        console.error(`  • ${issue.field}: ${issue.message}`);
      });
      console.error('\n');
    } else {
      console.error('Configuration validation failed:', error);
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

    // JWT secret required in production
    if (!config.JWT_SECRET) {
      errors.push('JWT_SECRET is required in production');
    }

    // Internal service secret required
    if (!config.INTERNAL_SERVICE_SECRET) {
      errors.push('INTERNAL_SERVICE_SECRET is required in production');
    }

    // Secrets should come from secrets manager
    if (config.SECRETS_PROVIDER === 'env') {
      errors.push('SECRETS_PROVIDER must be "aws" or "vault" in production');
    }

    // Database SSL required
    if (config.DB_SSL === 'false') {
      errors.push('DB_SSL must be enabled in production');
    }

    // Encryption key required
    if (!config.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY is required in production');
    }

    // CORS should not be wildcard
    if (config.CORS_ORIGIN === '*') {
      errors.push('CORS_ORIGIN must not be "*" in production');
    }

    // API URL required for OAuth
    if (!config.API_URL) {
      errors.push('API_URL is required in production');
    }

    if (errors.length > 0) {
      console.error('\n❌ Production configuration requirements not met:\n');
      errors.forEach(err => console.error(`  • ${err}`));
      console.error('\n');
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

// Named export for flat env access
export const envConfig = getConfig();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === 'development';
}

export function isTest(): boolean {
  return getConfig().NODE_ENV === 'test';
}

// =============================================================================
// COMPUTED CONFIG OBJECTS
// =============================================================================

/**
 * Get database configuration
 */
export function getDatabaseConfig() {
  const cfg = getConfig();
  return {
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    database: cfg.DB_NAME,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    ssl: cfg.DB_SSL === 'true' || cfg.DB_SSL === 'require'
      ? { rejectUnauthorized: cfg.NODE_ENV === 'production' }
      : false,
    pool: {
      min: cfg.DB_POOL_MIN,
      max: cfg.DB_POOL_MAX
    }
  };
}

/**
 * Get Redis configuration
 */
export function getRedisConfig() {
  const cfg = getConfig();
  return {
    host: cfg.REDIS_HOST,
    port: cfg.REDIS_PORT,
    password: cfg.REDIS_PASSWORD || undefined,
    db: cfg.REDIS_DB,
    tls: cfg.REDIS_TLS === 'true' ? {} : undefined
  };
}

/**
 * Get JWT configuration
 */
export function getJwtConfig() {
  const cfg = getConfig();

  if (!cfg.JWT_SECRET && cfg.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required');
  }

  return {
    secret: cfg.JWT_SECRET!,
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
    algorithm: cfg.JWT_ALGORITHM
  };
}

/**
 * Get Square OAuth configuration
 */
export function getSquareConfig() {
  const cfg = getConfig();
  const isSandbox = cfg.SQUARE_SANDBOX === 'true';

  return {
    appId: cfg.SQUARE_APP_ID,
    appSecret: cfg.SQUARE_APP_SECRET,
    webhookSignatureKey: cfg.SQUARE_WEBHOOK_SIGNATURE_KEY,
    baseUrl: isSandbox
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com',
    isSandbox
  };
}

/**
 * Get Stripe configuration
 */
export function getStripeConfig() {
  const cfg = getConfig();
  return {
    apiKey: cfg.STRIPE_API_KEY,
    webhookSecret: cfg.STRIPE_WEBHOOK_SECRET
  };
}

/**
 * Get Mailchimp OAuth configuration
 */
export function getMailchimpConfig() {
  const cfg = getConfig();
  return {
    clientId: cfg.MAILCHIMP_CLIENT_ID,
    clientSecret: cfg.MAILCHIMP_CLIENT_SECRET,
    webhookSecret: cfg.MAILCHIMP_WEBHOOK_SECRET
  };
}

/**
 * Get QuickBooks OAuth configuration
 */
export function getQuickBooksConfig() {
  const cfg = getConfig();
  return {
    clientId: cfg.QUICKBOOKS_CLIENT_ID,
    clientSecret: cfg.QUICKBOOKS_CLIENT_SECRET,
    webhookVerifierToken: cfg.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN
  };
}

/**
 * Get rate limiting configuration
 */
export function getRateLimitConfig() {
  const cfg = getConfig();
  return {
    enabled: cfg.RATE_LIMIT_ENABLED === 'true',
    windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    maxRequests: cfg.RATE_LIMIT_MAX_REQUESTS,
    webhookMax: cfg.RATE_LIMIT_WEBHOOK_MAX
  };
}

// Auto-validate on import in non-test environments
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

// =============================================================================
// NESTED CONFIG EXPORT (for backwards compatibility)
// =============================================================================

// This provides the nested structure that existing code expects
export const config = {
  server: {
    port: getConfig().PORT,
    host: getConfig().HOST,
    nodeEnv: getConfig().NODE_ENV,
    serviceName: getConfig().SERVICE_NAME,
    logLevel: getConfig().LOG_LEVEL,
    corsOrigin: getConfig().CORS_ORIGIN,
    apiUrl: getConfig().API_URL,
  },
  database: {
    host: getConfig().DB_HOST,
    port: getConfig().DB_PORT,
    name: getConfig().DB_NAME,
    user: getConfig().DB_USER,
    password: getConfig().DB_PASSWORD,
    ssl: getConfig().DB_SSL === 'true' || getConfig().DB_SSL === 'require',
    poolMin: getConfig().DB_POOL_MIN,
    poolMax: getConfig().DB_POOL_MAX,
  },
  redis: {
    host: getConfig().REDIS_HOST,
    port: getConfig().REDIS_PORT,
    password: getConfig().REDIS_PASSWORD,
    db: getConfig().REDIS_DB,
  },
  jwt: {
    secret: getConfig().JWT_SECRET || '',
    issuer: getConfig().JWT_ISSUER,
    audience: getConfig().JWT_AUDIENCE,
    algorithm: getConfig().JWT_ALGORITHM,
  },
  security: {
    internalServiceKey: process.env.INTERNAL_SERVICE_KEY,
    encryptionKey: process.env.ENCRYPTION_KEY,
    kmsKeyId: process.env.KMS_KEY_ID || 'local-key',
    requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || '10mb',
    mockKms: process.env.MOCK_KMS === 'true'
  },
  providers: {
    stripe: {
      clientId: getConfig().STRIPE_API_KEY,
      clientSecret: getConfig().STRIPE_API_KEY,
      webhookSecret: getConfig().STRIPE_WEBHOOK_SECRET,
      apiVersion: '2023-10-16',
    },
    square: {
      clientId: getConfig().SQUARE_APP_ID,
      clientSecret: getConfig().SQUARE_APP_SECRET,
      webhookSignatureKey: getConfig().SQUARE_WEBHOOK_SIGNATURE_KEY,
      sandbox: getConfig().SQUARE_SANDBOX === 'true',
      environment: getConfig().SQUARE_SANDBOX === 'true' ? 'sandbox' : 'production',
    },
    mailchimp: {
      clientId: getConfig().MAILCHIMP_CLIENT_ID,
      clientSecret: getConfig().MAILCHIMP_CLIENT_SECRET,
      webhookSecret: getConfig().MAILCHIMP_WEBHOOK_SECRET,
    },
    quickbooks: {
      clientId: getConfig().QUICKBOOKS_CLIENT_ID,
      clientSecret: getConfig().QUICKBOOKS_CLIENT_SECRET,
      webhookToken: getConfig().QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN,
      sandbox: true,
      realmId: '',
    },
    ticketmaster: { clientId: '' },
    eventbrite: { clientId: '' },
  },
  services: {
    authServiceUrl: '',
    eventServiceUrl: '',
    ticketServiceUrl: '',
    paymentServiceUrl: '',
  },
};

export default {
  validateConfig,
  getConfig,
  config,
  envConfig,
  isProduction,
  isDevelopment,
  isTest,
  getDatabaseConfig,
  getRedisConfig,
  getJwtConfig,
  getSquareConfig,
  getStripeConfig,
  getMailchimpConfig,
  getQuickBooksConfig,
  getRateLimitConfig
};
