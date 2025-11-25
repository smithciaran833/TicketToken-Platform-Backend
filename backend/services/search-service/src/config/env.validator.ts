/**
 * Environment Variable Validator
 * Validates all required environment variables on startup
 */

import Joi from 'joi';

/**
 * Environment configuration schema
 */
const envSchema = Joi.object({
  // Server Configuration
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  
  PORT: Joi.number()
    .port()
    .default(3000),
  
  HOST: Joi.string()
    .hostname()
    .default('0.0.0.0'),
  
  // Security
  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().min(64).required(),
      otherwise: Joi.string().default('dev-secret-key-change-in-production')
    })
    .description('JWT signing secret - MUST be strong in production'),
  
  // Elasticsearch Configuration
  ELASTICSEARCH_NODE: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .description('Elasticsearch node URL'),
  
  ELASTICSEARCH_USERNAME: Joi.string()
    .optional()
    .description('Elasticsearch username for authentication'),
  
  ELASTICSEARCH_PASSWORD: Joi.string()
    .optional()
    .description('Elasticsearch password for authentication'),
  
  ELASTICSEARCH_CLOUD_ID: Joi.string()
    .optional()
    .description('Elasticsearch Cloud ID (for Elastic Cloud)'),
  
  ELASTICSEARCH_API_KEY: Joi.string()
    .optional()
    .description('Elasticsearch API key (alternative to username/password)'),
  
  // Redis Configuration
  REDIS_HOST: Joi.string()
    .hostname()
    .default('localhost'),
  
  REDIS_PORT: Joi.number()
    .port()
    .default(6379),
  
  REDIS_PASSWORD: Joi.string()
    .optional()
    .description('Redis password if authentication is enabled'),
  
  REDIS_DB: Joi.number()
    .integer()
    .min(0)
    .max(15)
    .default(0),
  
  // PostgreSQL Configuration (for consistency tracking)
  DATABASE_HOST: Joi.string()
    .hostname()
    .default('localhost'),
  
  DATABASE_PORT: Joi.number()
    .port()
    .default(5432),
  
  DATABASE_NAME: Joi.string()
    .required()
    .description('PostgreSQL database name'),
  
  DATABASE_USER: Joi.string()
    .required()
    .description('PostgreSQL username'),
  
  DATABASE_PASSWORD: Joi.string()
    .required()
    .description('PostgreSQL password'),
  
  DATABASE_POOL_MIN: Joi.number()
    .integer()
    .min(0)
    .default(2),
  
  DATABASE_POOL_MAX: Joi.number()
    .integer()
    .min(1)
    .default(10),
  
  // RabbitMQ Configuration
  RABBITMQ_URL: Joi.string()
    .uri()
    .optional()
    .description('RabbitMQ connection URL'),
  
  // Rate Limiting
  RATE_LIMIT_MAX: Joi.number()
    .integer()
    .min(1)
    .default(100)
    .description('Maximum requests per time window'),
  
  RATE_LIMIT_WINDOW: Joi.number()
    .integer()
    .min(1000)
    .default(60000)
    .description('Rate limit time window in milliseconds'),
  
  // Search Configuration
  SEARCH_MAX_RESULTS: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(100)
    .description('Maximum search results per request'),
  
  SEARCH_DEFAULT_RESULTS: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .description('Default number of search results'),
  
  SEARCH_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(30000)
    .default(5000)
    .description('Search timeout in milliseconds'),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
  
  // Monitoring
  METRICS_ENABLED: Joi.boolean()
    .default(true),
  
  METRICS_PORT: Joi.number()
    .port()
    .default(9090)
}).unknown(true); // Allow other env vars but validate known ones

/**
 * Validates environment variables and returns validated config
 */
export function validateEnv(): Record<string, any> {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: false
  });
  
  if (error) {
    const errors = error.details.map(detail => ({
      key: detail.path.join('.'),
      message: detail.message,
      type: detail.type
    }));
    
    console.error('❌ Environment validation failed:');
    errors.forEach(err => {
      console.error(`  - ${err.key}: ${err.message}`);
    });
    
    throw new Error('Invalid environment configuration. Please check your .env file.');
  }
  
  return value;
}

/**
 * Checks for critical missing variables in production
 */
export function checkProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  
  const criticalVars = [
    'JWT_SECRET',
    'ELASTICSEARCH_NODE',
    'DATABASE_HOST',
    'DATABASE_NAME',
    'DATABASE_USER',
    'DATABASE_PASSWORD'
  ];
  
  const missing = criticalVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error('❌ Missing critical production environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    throw new Error('Cannot start in production without required environment variables');
  }
  
  // Check JWT_SECRET strength in production
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 64) {
    console.warn('⚠️  WARNING: JWT_SECRET should be at least 64 characters in production');
  }
}

/**
 * Gets validated environment configuration
 */
export function getConfig() {
  const env = validateEnv();
  
  return {
    server: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      host: env.HOST
    },
    auth: {
      jwtSecret: env.JWT_SECRET
    },
    elasticsearch: {
      node: env.ELASTICSEARCH_NODE,
      username: env.ELASTICSEARCH_USERNAME,
      password: env.ELASTICSEARCH_PASSWORD,
      cloudId: env.ELASTICSEARCH_CLOUD_ID,
      apiKey: env.ELASTICSEARCH_API_KEY
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB
    },
    database: {
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      database: env.DATABASE_NAME,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      pool: {
        min: env.DATABASE_POOL_MIN,
        max: env.DATABASE_POOL_MAX
      }
    },
    rabbitmq: {
      url: env.RABBITMQ_URL
    },
    rateLimit: {
      max: env.RATE_LIMIT_MAX,
      window: env.RATE_LIMIT_WINDOW
    },
    search: {
      maxResults: env.SEARCH_MAX_RESULTS,
      defaultResults: env.SEARCH_DEFAULT_RESULTS,
      timeoutMs: env.SEARCH_TIMEOUT_MS
    },
    logging: {
      level: env.LOG_LEVEL
    },
    metrics: {
      enabled: env.METRICS_ENABLED,
      port: env.METRICS_PORT
    }
  };
}
