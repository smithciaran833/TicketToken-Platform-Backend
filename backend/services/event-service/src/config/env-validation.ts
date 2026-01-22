import Joi from 'joi';
import { logger } from '../utils/logger';

const envSchema = Joi.object({
  // Core
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().port().required(),
  SERVICE_NAME: Joi.string().required(),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_POOL_MIN: Joi.number().min(1).default(2),
  DB_POOL_MAX: Joi.number().min(1).default(10),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().required(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().min(0).default(0),

  // MEDIUM FIX (Issue #5): MongoDB URI validation
  MONGODB_URI: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('mongodb://localhost:27017/tickettoken_content'),
    }),

  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_ALGORITHM: Joi.string().default('HS256'),
  JWT_ISSUER: Joi.string().default('tickettoken'),
  JWT_AUDIENCE: Joi.string().default('tickettoken-platform'),

  // MEDIUM FIX (Issue #4): Service URLs - conditionally required based on NODE_ENV
  // In production/staging: required for reliability
  // In development/test: optional with localhost defaults for easier local development
  AUTH_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3001'),
    }),
  VENUE_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3002'),
    }),
  EVENT_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3003'),
    }),
  TICKET_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3004'),
    }),
  PAYMENT_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3005'),
    }),
  MARKETPLACE_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3006'),
    }),
  ANALYTICS_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3007'),
    }),
  NOTIFICATION_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3008'),
    }),
  INTEGRATION_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3009'),
    }),
  COMPLIANCE_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3010'),
    }),
  QUEUE_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3011'),
    }),
  SEARCH_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3012'),
    }),
  FILE_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3013'),
    }),
  MONITORING_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3014'),
    }),
  BLOCKCHAIN_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3015'),
    }),
  ORDER_SERVICE_URL: Joi.string()
    .uri()
    .when('NODE_ENV', {
      is: Joi.string().valid('production', 'staging'),
      then: Joi.required(),
      otherwise: Joi.optional().default('http://localhost:3016'),
    }),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('debug', 'info', 'warn', 'error')
    .default('info'),
  LOG_FORMAT: Joi.string()
    .valid('json', 'pretty')
    .default('json'),

  // Metrics
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().port().default(9090),

  // Rate Limiting
  ENABLE_RATE_LIMITING: Joi.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: Joi.number().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().positive().default(100),

  // Background Jobs
  RESERVATION_CLEANUP_INTERVAL_MINUTES: Joi.number()
    .positive()
    .default(1),
}).unknown(true); // Allow other env vars

export function validateEnv(): void {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    const errors = error.details.map((detail) => detail.message).join('; ');
    logger.error({ errors }, 'Environment validation failed');
    throw new Error(`Environment validation failed: ${errors}`);
  }

  // Override process.env with validated values
  Object.assign(process.env, value);
  
  logger.info('Environment variables validated successfully');
}
