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

  // Security
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  JWT_ALGORITHM: Joi.string().default('HS256'),
  JWT_ISSUER: Joi.string().default('tickettoken'),
  JWT_AUDIENCE: Joi.string().default('tickettoken-platform'),

  // Service URLs
  AUTH_SERVICE_URL: Joi.string().uri().required(),
  VENUE_SERVICE_URL: Joi.string().uri().required(),
  EVENT_SERVICE_URL: Joi.string().uri().required(),
  TICKET_SERVICE_URL: Joi.string().uri().required(),
  PAYMENT_SERVICE_URL: Joi.string().uri().required(),
  MARKETPLACE_SERVICE_URL: Joi.string().uri().required(),
  ANALYTICS_SERVICE_URL: Joi.string().uri().required(),
  NOTIFICATION_SERVICE_URL: Joi.string().uri().required(),
  INTEGRATION_SERVICE_URL: Joi.string().uri().required(),
  COMPLIANCE_SERVICE_URL: Joi.string().uri().required(),
  QUEUE_SERVICE_URL: Joi.string().uri().required(),
  SEARCH_SERVICE_URL: Joi.string().uri().required(),
  FILE_SERVICE_URL: Joi.string().uri().required(),
  MONITORING_SERVICE_URL: Joi.string().uri().required(),
  BLOCKCHAIN_SERVICE_URL: Joi.string().uri().required(),
  ORDER_SERVICE_URL: Joi.string().uri().required(),

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
