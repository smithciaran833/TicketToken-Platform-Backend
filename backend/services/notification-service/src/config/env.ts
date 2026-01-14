import { config } from 'dotenv';

// Load environment variables
config();

export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  SERVICE_NAME: string;

  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_POOL_MIN: number;
  DB_POOL_MAX: number;
  /** Optional DATABASE_URL for validation - alternative to individual DB_* vars */
  DATABASE_URL?: string;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;
  /** Enable TLS for Redis in production */
  REDIS_TLS?: boolean;

  // RabbitMQ
  RABBITMQ_URL: string;
  RABBITMQ_EXCHANGE: string;
  RABBITMQ_QUEUE: string;

  // SendGrid
  SENDGRID_API_KEY: string;
  SENDGRID_FROM_EMAIL: string;
  SENDGRID_FROM_NAME: string;

  // AWS SES (alternative email provider)
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;

  // Twilio
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;

  // JWT
  JWT_SECRET: string;

  // Service URLs
  AUTH_SERVICE_URL: string;
  VENUE_SERVICE_URL: string;
  EVENT_SERVICE_URL: string;
  TICKET_SERVICE_URL: string;
  PAYMENT_SERVICE_URL: string;
  /** Application URL for links in notifications */
  APP_URL?: string;
  /** Frontend URL for links in notifications */
  FRONTEND_URL?: string;

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Notification Settings
  SMS_TIME_RESTRICTION_START: number;
  SMS_TIME_RESTRICTION_END: number;
  DEFAULT_TIMEZONE: string;
  MAX_RETRY_ATTEMPTS: number;
  RETRY_DELAY_MS: number;
  /** Default from email address */
  DEFAULT_FROM_EMAIL?: string;

  // Template Settings
  TEMPLATE_CACHE_TTL: number;
  ENABLE_TEMPLATE_PREVIEW: boolean;

  // Compliance Settings
  ENABLE_CONSENT_CHECK: boolean;
  ENABLE_SUPPRESSION_CHECK: boolean;
  LOG_ALL_NOTIFICATIONS: boolean;
  DATA_RETENTION_DAYS: number;

  // Feature Flags
  ENABLE_SMS: boolean;
  ENABLE_EMAIL: boolean;
  ENABLE_PUSH: boolean;
  ENABLE_WEBHOOK_DELIVERY: boolean;

  // Queue Settings
  /** Queue processing concurrency */
  QUEUE_CONCURRENCY?: number;

  // Logging
  /** Log level: error, warn, info, http, verbose, debug, silly */
  LOG_LEVEL?: string;
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

function getEnvVarAsNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value && defaultValue !== undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value || '', 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  return parsed;
}

function getEnvVarAsBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const env: EnvConfig = {
  // Server
  NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
  PORT: getEnvVarAsNumber('PORT', 3007),
  SERVICE_NAME: getEnvVar('SERVICE_NAME', 'notification-service'),

  // Database
  DB_HOST: getEnvVar('DB_HOST', 'postgres'),
  DB_PORT: getEnvVarAsNumber('DB_PORT', 5432),
  DB_NAME: getEnvVar('DB_NAME', 'tickettoken_db'),
  DB_USER: getEnvVar('DB_USER', 'postgres'),
  DB_PASSWORD: getEnvVar('DB_PASSWORD', ''),
  DB_POOL_MIN: getEnvVarAsNumber('DB_POOL_MIN', 2),
  DB_POOL_MAX: getEnvVarAsNumber('DB_POOL_MAX', 10),

  // Redis
  REDIS_HOST: getEnvVar('REDIS_HOST', 'postgres'),
  REDIS_PORT: getEnvVarAsNumber('REDIS_PORT', 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: getEnvVarAsNumber('REDIS_DB', 9),

  // RabbitMQ
  RABBITMQ_URL: getEnvVar('RABBITMQ_URL', 'amqp://rabbitmq:5672'),
  RABBITMQ_EXCHANGE: getEnvVar('RABBITMQ_EXCHANGE', 'tickettoken_events'),
  RABBITMQ_QUEUE: getEnvVar('RABBITMQ_QUEUE', 'notifications'),

  // AUDIT FIX CFG-1: Remove empty defaults for API keys - require in production
  // SendGrid
  SENDGRID_API_KEY: process.env.NODE_ENV === 'production' 
    ? getEnvVar('SENDGRID_API_KEY') 
    : getEnvVar('SENDGRID_API_KEY', 'dev-sendgrid-key'),
  SENDGRID_FROM_EMAIL: getEnvVar('SENDGRID_FROM_EMAIL', 'noreply@tickettoken.com'),
  SENDGRID_FROM_NAME: getEnvVar('SENDGRID_FROM_NAME', 'TicketToken'),

  // AUDIT FIX CFG-1: Remove empty defaults for API keys - require in production
  // Twilio
  TWILIO_ACCOUNT_SID: process.env.NODE_ENV === 'production'
    ? getEnvVar('TWILIO_ACCOUNT_SID')
    : getEnvVar('TWILIO_ACCOUNT_SID', 'dev-twilio-sid'),
  TWILIO_AUTH_TOKEN: process.env.NODE_ENV === 'production'
    ? getEnvVar('TWILIO_AUTH_TOKEN')
    : getEnvVar('TWILIO_AUTH_TOKEN', 'dev-twilio-token'),
  TWILIO_FROM_NUMBER: process.env.NODE_ENV === 'production'
    ? getEnvVar('TWILIO_FROM_NUMBER')
    : getEnvVar('TWILIO_FROM_NUMBER', '+15551234567'),
  TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,

  // JWT - REMOVED DANGEROUS DEFAULT
  JWT_SECRET: getEnvVar('JWT_SECRET'),

  // Service URLs
  AUTH_SERVICE_URL: getEnvVar('AUTH_SERVICE_URL', 'http://auth-service:3001'),
  VENUE_SERVICE_URL: getEnvVar('VENUE_SERVICE_URL', 'http://venue-service:3002'),
  EVENT_SERVICE_URL: getEnvVar('EVENT_SERVICE_URL', 'http://event-service:3003'),
  TICKET_SERVICE_URL: getEnvVar('TICKET_SERVICE_URL', 'http://ticket-service:3004'),
  PAYMENT_SERVICE_URL: getEnvVar('PAYMENT_SERVICE_URL', 'http://payment-service:3005'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: getEnvVarAsNumber('RATE_LIMIT_WINDOW_MS', 60000),
  RATE_LIMIT_MAX_REQUESTS: getEnvVarAsNumber('RATE_LIMIT_MAX_REQUESTS', 100),

  // Notification Settings
  SMS_TIME_RESTRICTION_START: getEnvVarAsNumber('SMS_TIME_RESTRICTION_START', 8),
  SMS_TIME_RESTRICTION_END: getEnvVarAsNumber('SMS_TIME_RESTRICTION_END', 21),
  DEFAULT_TIMEZONE: getEnvVar('DEFAULT_TIMEZONE', 'America/Chicago'),
  MAX_RETRY_ATTEMPTS: getEnvVarAsNumber('MAX_RETRY_ATTEMPTS', 3),
  RETRY_DELAY_MS: getEnvVarAsNumber('RETRY_DELAY_MS', 5000),

  // Template Settings
  TEMPLATE_CACHE_TTL: getEnvVarAsNumber('TEMPLATE_CACHE_TTL', 3600),
  ENABLE_TEMPLATE_PREVIEW: getEnvVarAsBoolean('ENABLE_TEMPLATE_PREVIEW', true),

  // Compliance Settings
  ENABLE_CONSENT_CHECK: getEnvVarAsBoolean('ENABLE_CONSENT_CHECK', true),
  ENABLE_SUPPRESSION_CHECK: getEnvVarAsBoolean('ENABLE_SUPPRESSION_CHECK', true),
  LOG_ALL_NOTIFICATIONS: getEnvVarAsBoolean('LOG_ALL_NOTIFICATIONS', true),
  DATA_RETENTION_DAYS: getEnvVarAsNumber('DATA_RETENTION_DAYS', 90),

  // Feature Flags
  ENABLE_SMS: getEnvVarAsBoolean('ENABLE_SMS', true),
  ENABLE_EMAIL: getEnvVarAsBoolean('ENABLE_EMAIL', true),
  ENABLE_PUSH: getEnvVarAsBoolean('ENABLE_PUSH', false),
  ENABLE_WEBHOOK_DELIVERY: getEnvVarAsBoolean('ENABLE_WEBHOOK_DELIVERY', true),
};
