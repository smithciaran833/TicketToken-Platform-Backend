/**
 * Environment Variable Validator
 * Validates all required environment variables on startup
 */

interface EnvConfig {
  // Service
  NODE_ENV: string;
  PORT: string;
  SERVICE_NAME: string;

  // Database
  DATABASE_URL: string;
  DATABASE_POOL_MIN: string;
  DATABASE_POOL_MAX: string;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_PASSWORD?: string;

  // JWT
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;

  // External Services
  TICKET_SERVICE_URL: string;
  PAYMENT_SERVICE_URL: string;
  EVENT_SERVICE_URL: string;

  // Event Bus
  RABBITMQ_URL: string;

  // Observability
  LOG_LEVEL: string;
  ENABLE_METRICS: string;
}

const requiredEnvVars: (keyof EnvConfig)[] = [
  'NODE_ENV',
  'PORT',
  'SERVICE_NAME',
  'DATABASE_URL',
  'DATABASE_POOL_MIN',
  'DATABASE_POOL_MAX',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'TICKET_SERVICE_URL',
  'PAYMENT_SERVICE_URL',
  'EVENT_SERVICE_URL',
  'RABBITMQ_URL',
  'LOG_LEVEL',
  'ENABLE_METRICS',
];

const optionalEnvVars: string[] = [
  'REDIS_PASSWORD',
  'PLATFORM_FEE_PERCENTAGE',
  'PROCESSING_FEE_PERCENTAGE',
  'PROCESSING_FEE_FIXED_CENTS',
  'DEFAULT_TAX_RATE',
  'RESERVATION_DURATION_MINUTES',
  'MAX_ORDER_VALUE_CENTS',
  'MAX_ITEMS_PER_ORDER',
];

export function validateEnvironment(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate formats
  if (process.env.PORT && isNaN(parseInt(process.env.PORT, 10))) {
    errors.push('PORT must be a valid number');
  }

  if (process.env.DATABASE_POOL_MIN && isNaN(parseInt(process.env.DATABASE_POOL_MIN, 10))) {
    errors.push('DATABASE_POOL_MIN must be a valid number');
  }

  if (process.env.DATABASE_POOL_MAX && isNaN(parseInt(process.env.DATABASE_POOL_MAX, 10))) {
    errors.push('DATABASE_POOL_MAX must be a valid number');
  }

  if (process.env.REDIS_PORT && isNaN(parseInt(process.env.REDIS_PORT, 10))) {
    errors.push('REDIS_PORT must be a valid number');
  }

  // Validate NODE_ENV
  const validEnvs = ['development', 'staging', 'production', 'test'];
  if (process.env.NODE_ENV && !validEnvs.includes(process.env.NODE_ENV)) {
    errors.push(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
  }

  // Validate URLs
  const urlVars = ['DATABASE_URL', 'TICKET_SERVICE_URL', 'PAYMENT_SERVICE_URL', 'EVENT_SERVICE_URL', 'RABBITMQ_URL'];
  for (const varName of urlVars) {
    const value = process.env[varName];
    if (value) {
      try {
        new URL(value);
      } catch {
        errors.push(`${varName} must be a valid URL`);
      }
    }
  }

  // Validate LOG_LEVEL
  const validLogLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
  if (process.env.LOG_LEVEL && !validLogLevels.includes(process.env.LOG_LEVEL)) {
    warnings.push(`LOG_LEVEL should be one of: ${validLogLevels.join(', ')}. Using 'info' as default.`);
  }

  // Validate boolean flags
  if (process.env.ENABLE_METRICS && !['true', 'false'].includes(process.env.ENABLE_METRICS)) {
    warnings.push('ENABLE_METRICS should be "true" or "false"');
  }

  // Check optional but recommended variables
  for (const varName of optionalEnvVars) {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable not set: ${varName} (will use default)`);
    }
  }

  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }

    if (!process.env.REDIS_PASSWORD) {
      warnings.push('REDIS_PASSWORD not set in production - Redis authentication disabled');
    }

    if (process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'silly') {
      warnings.push('LOG_LEVEL set to debug/silly in production - may impact performance');
    }
  }

  // Display warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment Configuration Warnings:');
    warnings.forEach(warning => console.warn(`   - ${warning}`));
  }

  // Throw error if validation failed
  if (errors.length > 0) {
    console.error('\n❌ Environment Configuration Errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error('Environment validation failed. Please check your .env file.');
  }

  console.log('✅ Environment configuration validated successfully');
}

/**
 * Get typed environment config
 */
export function getEnvConfig(): EnvConfig {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '3004',
    SERVICE_NAME: process.env.SERVICE_NAME || 'order-service',
    DATABASE_URL: process.env.DATABASE_URL || '',
    DATABASE_POOL_MIN: process.env.DATABASE_POOL_MIN || '2',
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX || '10',
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: process.env.REDIS_PORT || '6379',
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    JWT_SECRET: process.env.JWT_SECRET || '',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    TICKET_SERVICE_URL: process.env.TICKET_SERVICE_URL || '',
    PAYMENT_SERVICE_URL: process.env.PAYMENT_SERVICE_URL || '',
    EVENT_SERVICE_URL: process.env.EVENT_SERVICE_URL || '',
    RABBITMQ_URL: process.env.RABBITMQ_URL || '',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    ENABLE_METRICS: process.env.ENABLE_METRICS || 'true',
  };
}
