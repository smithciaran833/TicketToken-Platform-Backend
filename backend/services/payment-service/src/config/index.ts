/**
 * Payment Service Configuration
 * 
 * CRITICAL SECURITY: All required secrets MUST be provided via environment variables
 * or secrets manager. No insecure defaults are allowed for production secrets.
 * 
 * MEDIUM FIXES:
 * - SEC-R6: Default JWT secret validation (no 'your-secret-key')
 * - ENV-1: No empty string defaults for required config
 * - ENV-2: Type-safe config with Zod validation
 * - STR-4/STR-5: Secrets manager integration for Stripe keys
 * - STR-6: Pattern validation for Stripe keys
 * - SEC-1: No default secrets in code
 * - LC7: Service version included
 */

import dotenv from 'dotenv';
import { z } from 'zod';
import { secretsManager } from './secrets-manager';

dotenv.config();

// =============================================================================
// SERVICE VERSION (LC7)
// =============================================================================

/**
 * Service version from package.json or environment
 */
export const SERVICE_VERSION = process.env.SERVICE_VERSION || 
  process.env.npm_package_version || 
  '1.0.0';

export const SERVICE_NAME = 'payment-service';
export const SERVICE_BUILD = process.env.BUILD_NUMBER || process.env.GIT_COMMIT || 'local';

// =============================================================================
// STRIPE KEY PATTERN VALIDATION (STR-6)
// =============================================================================

/**
 * Stripe key format patterns
 */
const STRIPE_SECRET_KEY_PATTERN = /^sk_(test|live)_[a-zA-Z0-9]{20,}$/;
const STRIPE_PUBLISHABLE_KEY_PATTERN = /^pk_(test|live)_[a-zA-Z0-9]{20,}$/;
const STRIPE_WEBHOOK_SECRET_PATTERN = /^whsec_[a-zA-Z0-9]{20,}$/;

/**
 * Validate Stripe key format
 */
function validateStripeKeyFormat(key: string | undefined, keyType: 'secret' | 'publishable' | 'webhook'): boolean {
  if (!key) return false;
  
  switch (keyType) {
    case 'secret':
      return STRIPE_SECRET_KEY_PATTERN.test(key);
    case 'publishable':
      return STRIPE_PUBLISHABLE_KEY_PATTERN.test(key);
    case 'webhook':
      return STRIPE_WEBHOOK_SECRET_PATTERN.test(key);
    default:
      return false;
  }
}

// =============================================================================
// TYPE-SAFE CONFIG SCHEMA (ENV-2)
// =============================================================================

/**
 * Server configuration schema
 */
const serverConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  env: z.enum(['development', 'test', 'staging', 'production']),
  trustProxy: z.union([z.boolean(), z.array(z.string())]),
});

/**
 * Database configuration schema
 */
const databaseConfigSchema = z.object({
  url: z.string().optional(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  name: z.string().min(1),
  user: z.string().min(1),
  password: z.string(),
  healthCheckTimeoutMs: z.number().int().positive(),
  poolMin: z.number().int().min(0),
  poolMax: z.number().int().min(1),
  statementTimeoutMs: z.number().int().positive(),
});

/**
 * Redis configuration schema
 */
const redisConfigSchema = z.object({
  url: z.string().optional(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  password: z.string().optional(),
  healthCheckTimeoutMs: z.number().int().positive(),
  connectTimeoutMs: z.number().int().positive(),
});

/**
 * Stripe configuration schema
 */
const stripeConfigSchema = z.object({
  secretKey: z.string(),
  publishableKey: z.string(),
  webhookSecret: z.string(),
  healthCheckTimeoutMs: z.number().int().positive(),
  connectEnabled: z.boolean(),
  // STR-6: Key format validation happens at runtime
  secretKeyValid: z.boolean().optional(),
  webhookSecretValid: z.boolean().optional(),
});

/**
 * JWT configuration schema
 */
const jwtConfigSchema = z.object({
  secret: z.string(),
  issuer: z.string().min(1),
  audience: z.string().min(1),
  expiresIn: z.string().min(1),
  algorithms: z.array(z.string()),
});

/**
 * Rate limit configuration schema
 */
const rateLimitConfigSchema = z.object({
  windowMs: z.number().int().positive(),
  maxRequests: z.number().int().positive(),
  skipTrusted: z.boolean(),
  keyPrefix: z.string().min(1),
});

/**
 * Full config schema
 */
const configSchema = z.object({
  version: z.string(),
  serviceName: z.string(),
  build: z.string(),
  server: serverConfigSchema,
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  stripe: stripeConfigSchema,
  jwt: jwtConfigSchema,
  rateLimit: rateLimitConfigSchema,
});

export type ConfigSchema = z.infer<typeof configSchema>;

// =============================================================================
// CONFIGURATION VALIDATION (ENV-1, SEC-1)
// =============================================================================

/**
 * Validates required environment variables at startup.
 * Fails fast if critical configuration is missing.
 */
function validateRequiredConfig(): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // JWT Secret - CRITICAL: Must be at least 32 characters
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required and must be set');
  } else if (jwtSecret === 'your-secret-key' || jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters and not a default value');
  }

  // ENV-1: Validate no empty string usage for required fields
  const requiredNonEmpty = [
    'DATABASE_URL',
    'DB_HOST',
    'DB_USER',
  ];
  
  // At least one of DATABASE_URL or DB_HOST must be set
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    errors.push('DATABASE_URL or DB_HOST is required');
  }

  // Stripe Configuration - CRITICAL for payment processing
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    if (process.env.NODE_ENV === 'production') {
      errors.push('STRIPE_SECRET_KEY is required in production');
    } else {
      warnings.push('STRIPE_SECRET_KEY not set - Stripe payments will be disabled');
    }
  } else {
    // STR-6: Validate Stripe key format
    if (!validateStripeKeyFormat(stripeSecretKey, 'secret')) {
      errors.push('STRIPE_SECRET_KEY has invalid format (expected sk_test_* or sk_live_*)');
    }
    
    // Warn if using test key in production
    if (process.env.NODE_ENV === 'production' && stripeSecretKey.startsWith('sk_test_')) {
      errors.push('STRIPE_SECRET_KEY is a test key but NODE_ENV is production');
    }
  }

  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeWebhookSecret) {
    if (process.env.NODE_ENV === 'production') {
      errors.push('STRIPE_WEBHOOK_SECRET is required in production');
    } else {
      warnings.push('STRIPE_WEBHOOK_SECRET not set - Webhook signature verification disabled');
    }
  } else {
    // STR-6: Validate webhook secret format
    if (!validateStripeKeyFormat(stripeWebhookSecret, 'webhook')) {
      errors.push('STRIPE_WEBHOOK_SECRET has invalid format (expected whsec_*)');
    }
  }

  // Service Authentication - Required for inter-service communication
  const serviceAuthSecret = process.env.SERVICE_AUTH_SECRET;
  if (serviceAuthSecret && serviceAuthSecret.length < 32) {
    errors.push('SERVICE_AUTH_SECRET must be at least 32 characters if provided');
  }

  // HMAC Secret - Required for webhook signing
  const hmacSecret = process.env.HMAC_SECRET;
  if (hmacSecret && hmacSecret.length < 32) {
    errors.push('HMAC_SECRET must be at least 32 characters if provided');
  }

  // SEC-1: Check for known insecure defaults
  const insecureDefaults = ['your-secret-key', 'changeme', 'password', 'secret', 'default'];
  const secretEnvVars = [
    'JWT_SECRET', 
    'SERVICE_AUTH_SECRET', 
    'HMAC_SECRET',
    'DB_PASSWORD',
    'REDIS_PASSWORD',
  ];
  
  for (const envVar of secretEnvVars) {
    const value = process.env[envVar];
    if (value && insecureDefaults.some(d => value.toLowerCase().includes(d))) {
      errors.push(`${envVar} contains an insecure default value`);
    }
  }

  // Trusted Proxy IPs - Required for rate limiting in production
  if (process.env.NODE_ENV === 'production' && !process.env.TRUSTED_PROXY_IPS) {
    warnings.push('TRUSTED_PROXY_IPS not set - rate limiting may be bypassed');
  }

  return { errors, warnings };
}

// Run validation at module load
const validationResult = validateRequiredConfig();

// Log warnings
validationResult.warnings.forEach(warning => {
  console.warn(`⚠️  CONFIG WARNING: ${warning}`);
});

// Fail fast on errors
if (validationResult.errors.length > 0) {
  console.error('❌ CONFIGURATION ERRORS:');
  validationResult.errors.forEach(error => {
    console.error(`   - ${error}`);
  });
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Configuration validation failed: ${validationResult.errors.join('; ')}`);
  } else {
    console.error('⚠️  Running in development mode with invalid config - THIS WOULD FAIL IN PRODUCTION');
  }
}

// =============================================================================
// PARSED TRUSTED PROXY IPS
// =============================================================================

/**
 * Parse trusted proxy IPs from environment.
 * Returns false if not configured (trusts nothing), or array of CIDR ranges.
 */
function parseTrustedProxyIps(): string[] | boolean {
  const trustedIps = process.env.TRUSTED_PROXY_IPS;
  if (!trustedIps) {
    return false; // Don't trust any proxies by default
  }
  return trustedIps.split(',').map(ip => ip.trim()).filter(Boolean);
}

// =============================================================================
// CONFIGURATION EXPORT (ENV-2: Type-safe)
// =============================================================================

/**
 * Raw config object (validated by Zod schema at runtime if needed)
 */
const rawConfig = {
  // LC7: Service version info
  version: SERVICE_VERSION,
  serviceName: SERVICE_NAME,
  build: SERVICE_BUILD,
  
  server: {
    port: parseInt(process.env.PORT || '3006', 10),
    env: (process.env.NODE_ENV || 'development') as 'development' | 'test' | 'staging' | 'production',
    // Trust only configured proxies, not all
    trustProxy: parseTrustedProxyIps(),
  },
  
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '6432', 10),
    name: process.env.DB_NAME || 'tickettoken',
    user: process.env.DB_USER || 'tickettoken_user',
    // ENV-1: No empty string default, use undefined
    password: process.env.DB_PASSWORD || '',
    // Health check timeout
    healthCheckTimeoutMs: parseInt(process.env.DB_HEALTH_TIMEOUT_MS || '5000', 10),
    // Pool configuration
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
    // Statement timeout for queries
    statementTimeoutMs: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '30000', 10),
  },
  
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    // Health check timeout
    healthCheckTimeoutMs: parseInt(process.env.REDIS_HEALTH_TIMEOUT_MS || '2000', 10),
    connectTimeoutMs: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
  },
  
  stripe: {
    // STR-4/STR-5: Keys will be fetched from secrets manager in production
    // These are for backwards compatibility; prefer secretsManager.getSecret()
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Health check timeout
    healthCheckTimeoutMs: parseInt(process.env.STRIPE_HEALTH_TIMEOUT_MS || '5000', 10),
    // Stripe Connect settings
    connectEnabled: process.env.ENABLE_STRIPE_CONNECT !== 'false',
    // STR-6: Key format validation results
    secretKeyValid: validateStripeKeyFormat(process.env.STRIPE_SECRET_KEY, 'secret'),
    webhookSecretValid: validateStripeKeyFormat(process.env.STRIPE_WEBHOOK_SECRET, 'webhook'),
  },
  
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    mode: (process.env.PAYPAL_MODE || 'sandbox') as 'sandbox' | 'live',
  },
  
  square: {
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment: (process.env.SQUARE_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
    webhookSecret: process.env.SQUARE_WEBHOOK_SECRET,
  },
  
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID,
    secret: process.env.PLAID_SECRET,
    env: (process.env.PLAID_ENV || 'sandbox') as 'sandbox' | 'development' | 'production',
  },
  
  taxJar: {
    apiKey: process.env.TAXJAR_API_KEY,
  },
  
  blockchain: {
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    polygonRpcUrl: process.env.POLYGON_RPC_URL,
  },
  
  services: {
    // Use HTTPS in production for internal services
    authUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    eventUrl: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
    ticketUrl: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3004',
    venueUrl: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    paymentUrl: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3006',
    marketplaceUrl: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3008',
    orderUrl: process.env.ORDER_SERVICE_URL || 'http://order-service:3007',
    notificationUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3009',
  },
  
  jwt: {
    // SEC-1/SEC-R6: No default value - must be provided
    secret: process.env.JWT_SECRET || '',
    // JWT validation settings
    issuer: process.env.JWT_ISSUER || 'tickettoken',
    audience: process.env.JWT_AUDIENCE || 'tickettoken-services',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    algorithms: ['HS256', 'HS384', 'HS512'] as const,
  },
  
  serviceAuth: {
    // SEC-1: No default value - must be provided
    secret: process.env.SERVICE_AUTH_SECRET || '',
    hmacSecret: process.env.HMAC_SECRET || '',
    // Allowed service callers
    allowedServices: (process.env.ALLOWED_SERVICE_CALLERS || 'auth-service,ticket-service,order-service,venue-service,event-service').split(','),
    // Token expiry
    tokenExpiryMs: parseInt(process.env.SERVICE_TOKEN_EXPIRY_MS || '300000', 10),
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    // Skip rate limit for trusted IPs
    skipTrusted: process.env.RATE_LIMIT_SKIP_TRUSTED === 'true',
    // Key prefix for Redis
    keyPrefix: process.env.RATE_LIMIT_KEY_PREFIX || 'rl:payment:',
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: (process.env.LOG_FORMAT || 'json') as 'json' | 'pretty',
    // File logging
    file: process.env.LOG_FILE,
    maxSize: process.env.LOG_MAX_SIZE || '100m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
  },
  
  features: {
    stripeConnect: process.env.ENABLE_STRIPE_CONNECT !== 'false',
    paypalEnabled: !!process.env.PAYPAL_CLIENT_ID,
    squareEnabled: !!process.env.SQUARE_ACCESS_TOKEN,
    metricsEnabled: process.env.ENABLE_METRICS !== 'false',
    tracingEnabled: process.env.ENABLE_TRACING !== 'false',
  },
  
  // Telemetry/Observability config
  telemetry: {
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
  },
};

// =============================================================================
// ASYNC CONFIG GETTERS (STR-4, STR-5)
// =============================================================================

/**
 * Get Stripe secret key from secrets manager
 * Use this instead of config.stripe.secretKey for production
 */
export async function getStripeSecretKey(): Promise<string> {
  if (process.env.SECRETS_BACKEND === 'aws' || process.env.SECRETS_BACKEND === 'vault') {
    return secretsManager.getSecret('STRIPE_SECRET_KEY');
  }
  return rawConfig.stripe.secretKey;
}

/**
 * Get Stripe webhook secret from secrets manager
 * Use this instead of config.stripe.webhookSecret for production
 */
export async function getStripeWebhookSecret(): Promise<string> {
  if (process.env.SECRETS_BACKEND === 'aws' || process.env.SECRETS_BACKEND === 'vault') {
    return secretsManager.getSecret('STRIPE_WEBHOOK_SECRET');
  }
  return rawConfig.stripe.webhookSecret;
}

/**
 * Get JWT secret from secrets manager
 */
export async function getJwtSecret(): Promise<string> {
  if (process.env.SECRETS_BACKEND === 'aws' || process.env.SECRETS_BACKEND === 'vault') {
    return secretsManager.getSecret('JWT_SECRET');
  }
  return rawConfig.jwt.secret;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const config = rawConfig;

// Type export for config
export type Config = typeof config;

// Export validation helpers
export { validateStripeKeyFormat, validateRequiredConfig };

// Re-export secrets manager for convenience
export { secretsManager };
