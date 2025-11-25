import { z } from 'zod';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'EnvValidation' });

/**
 * Environment variable validation schema using Zod
 * Provides type safety and runtime validation for all configuration
 */

// Base configuration schema
const envSchema = z.object({
  // Core Service Configuration
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('3004').transform(Number),
  SERVICE_NAME: z.string().default('ticket-service'),

  // Database Configuration (required in production)
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.string().regex(/^\d+$/).default('5432').transform(Number),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DATABASE_URL: z.string().url().optional(),
  
  // Database Pool Configuration
  DB_POOL_MIN: z.string().regex(/^\d+$/).default('2').transform(Number),
  DB_POOL_MAX: z.string().regex(/^\d+$/).default('10').transform(Number),

  // Redis Configuration
  REDIS_HOST: z.string().min(1, 'REDIS_HOST is required'),
  REDIS_PORT: z.string().regex(/^\d+$/).default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().regex(/^\d+$/).default('0').transform(Number),
  REDIS_URL: z.string().optional(),

  // Security Configuration (REQUIRED - no defaults!)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  QR_ENCRYPTION_KEY: z.string().min(32, 'QR_ENCRYPTION_KEY must be at least 32 characters'),
  INTERNAL_WEBHOOK_SECRET: z.string().min(32, 'INTERNAL_WEBHOOK_SECRET must be at least 32 characters'),
  
  // JWT Configuration
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ALGORITHM: z.string().default('HS256'),
  JWT_ISSUER: z.string().default('tickettoken'),
  JWT_AUDIENCE: z.string().default('tickettoken-platform'),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),

  // Service Discovery URLs
  AUTH_SERVICE_URL: z.string().url().optional(),
  VENUE_SERVICE_URL: z.string().url().optional(),
  EVENT_SERVICE_URL: z.string().url().optional(),
  TICKET_SERVICE_URL: z.string().url().optional(),
  PAYMENT_SERVICE_URL: z.string().url().optional(),
  MARKETPLACE_SERVICE_URL: z.string().url().optional(),
  ANALYTICS_SERVICE_URL: z.string().url().optional(),
  NOTIFICATION_SERVICE_URL: z.string().url().optional(),
  INTEGRATION_SERVICE_URL: z.string().url().optional(),
  COMPLIANCE_SERVICE_URL: z.string().url().optional(),
  QUEUE_SERVICE_URL: z.string().url().optional(),
  SEARCH_SERVICE_URL: z.string().url().optional(),
  FILE_SERVICE_URL: z.string().url().optional(),
  MONITORING_SERVICE_URL: z.string().url().optional(),
  BLOCKCHAIN_SERVICE_URL: z.string().url().optional(),
  ORDER_SERVICE_URL: z.string().url().optional(),
  MINTING_SERVICE_URL: z.string().url().optional(),

  // Monitoring & Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  ENABLE_METRICS: z.string().transform(val => val === 'true').default(true),
  METRICS_PORT: z.string().regex(/^\d+$/).default('9090').transform(Number),

  // Rate Limiting
  ENABLE_RATE_LIMITING: z.string().transform(val => val === 'true').default(true),
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).default('100').transform(Number),

  // Background Workers
  CLEANUP_INTERVAL_MS: z.string().regex(/^\d+$/).default('60000').transform(Number),
  RESERVATION_EXPIRY_MINUTES: z.string().regex(/^\d+$/).default('15').transform(Number),

  // Solana/NFT Configuration (optional for stub implementation)
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_NETWORK: z.enum(['devnet', 'mainnet-beta', 'testnet']).optional(),
  SOLANA_WALLET_PRIVATE_KEY: z.string().optional(),

  // RabbitMQ Configuration (optional)
  RABBITMQ_URL: z.string().url().optional(),
  RABBITMQ_EXCHANGE: z.string().optional(),
});

// Production-specific validations
const productionSchema = envSchema.refine(
  (data) => {
    if (data.NODE_ENV === 'production') {
      // In production, service URLs must be configured
      const requiredServices = [
        'AUTH_SERVICE_URL',
        'EVENT_SERVICE_URL',
        'PAYMENT_SERVICE_URL',
        'ORDER_SERVICE_URL',
      ] as const;

      for (const service of requiredServices) {
        if (!data[service]) {
          throw new Error(`${service} is required in production`);
        }
      }
    }
    return true;
  },
  {
    message: 'Required service URLs missing in production environment',
  }
);

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns typed configuration
 * @throws {Error} if validation fails
 */
export function validateEnv(): ValidatedEnv {
  try {
    log.info('Validating environment variables');

    // Parse and validate environment
    const env = productionSchema.parse(process.env);

    // Build DATABASE_URL if not provided
    if (!env.DATABASE_URL) {
      env.DATABASE_URL = `postgresql://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
    }

    // Build REDIS_URL if not provided
    if (!env.REDIS_URL) {
      const auth = env.REDIS_PASSWORD ? `:${env.REDIS_PASSWORD}@` : '';
      env.REDIS_URL = `redis://${auth}${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`;
    }

    log.info('Environment validation successful', {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      dbHost: env.DB_HOST,
      redisHost: env.REDIS_HOST,
      logLevel: env.LOG_LEVEL,
    });

    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      log.error('Environment validation failed', {
        errors: error.issues.map((err: any) => ({
          path: err.path.join('.'),
          message: err.message,
        })),
      });

      // Format error message
      const errorMessages = error.issues.map((err: any) => 
        `  - ${err.path.join('.')}: ${err.message}`
      ).join('\n');

      throw new Error(
        `Environment validation failed:\n${errorMessages}\n\n` +
        `Please check your .env file or environment variables.`
      );
    }
    throw error;
  }
}

/**
 * Generates a secure random secret (for documentation/testing purposes)
 */
export function generateSecret(length: number = 64): string {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Prints environment variable documentation
 */
export function printEnvDocs(): void {
  console.log(`
================================================================================
TICKET SERVICE - ENVIRONMENT VARIABLE GUIDE
================================================================================

REQUIRED SECRETS (must be set, no defaults):
  
  JWT_SECRET
    Description: Secret key for JWT token signing
    Min Length: 32 characters
    Generate: openssl rand -hex 32
    Example: JWT_SECRET=a1b2c3d4e5f6...

  QR_ENCRYPTION_KEY
    Description: Encryption key for QR code generation
    Min Length: 32 characters
    Generate: openssl rand -hex 32
    Example: QR_ENCRYPTION_KEY=x1y2z3a4b5c6...

  INTERNAL_WEBHOOK_SECRET
    Description: Secret for internal webhook authentication
    Min Length: 32 characters
    Generate: openssl rand -hex 32
    Example: INTERNAL_WEBHOOK_SECRET=p1q2r3s4t5u6...

REQUIRED CONFIGURATION:
  - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
  - REDIS_HOST, REDIS_PORT
  
PRODUCTION-ONLY REQUIRED:
  - AUTH_SERVICE_URL
  - EVENT_SERVICE_URL
  - PAYMENT_SERVICE_URL
  - ORDER_SERVICE_URL

For complete documentation, see .env.example
================================================================================
  `);
}
