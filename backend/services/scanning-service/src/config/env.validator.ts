import * as Joi from 'joi';
import logger from '../utils/logger';

const envSchema = Joi.object({
  // Service Config
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().default(3009),
  HOST: Joi.string().default('0.0.0.0'),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),

  // Security (Phase 2.3: Required secrets)
  HMAC_SECRET: Joi.string()
    .min(32)
    .required()
    .messages({
      'string.min': 'HMAC_SECRET must be at least 32 characters',
      'any.required': 'HMAC_SECRET is required for QR code security'
    }),
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .messages({
      'string.min': 'JWT_SECRET must be at least 32 characters',
      'any.required': 'JWT_SECRET is required for authentication'
    }),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_POOL_MAX: Joi.number().default(20),
  DB_POOL_MIN: Joi.number().default(5),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(0),

  // Service URLs (if using microservice architecture)
  TICKET_SERVICE_URL: Joi.string().uri().optional(),
  EVENT_SERVICE_URL: Joi.string().uri().optional(),
  AUTH_SERVICE_URL: Joi.string().uri().optional(),

  // Feature Configuration
  DUPLICATE_SCAN_WINDOW_SECONDS: Joi.number().default(600),
  QR_EXPIRATION_SECONDS: Joi.number().default(30),
  OFFLINE_MANIFEST_VALIDITY_HOURS: Joi.number().default(4),
  MAX_REENTRY_LIMIT: Joi.number().default(5),

  // Rate Limiting
  RATE_LIMIT_MAX: Joi.number().default(100),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
}).unknown(true); // Allow other env vars

export function validateEnv(): Record<string, any> {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false
  });

  if (error) {
    const errors = error.details.map(d => `  ❌ ${d.message}`).join('\n');
    logger.error('Environment validation failed:\n' + errors);
    console.error('\n❌ Environment Variable Validation Failed:\n' + errors + '\n');
    process.exit(1);
  }

  logger.info('✅ Environment variables validated successfully');
  return value;
}

export function getRequiredEnvVars(): string[] {
  return [
    'HMAC_SECRET',
    'JWT_SECRET',
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'REDIS_HOST'
  ];
}
