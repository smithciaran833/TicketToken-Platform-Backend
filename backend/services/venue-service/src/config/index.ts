import { cleanEnv, str, port, bool, num, url, makeValidator } from 'envalid';

/**
 * SECURITY FIX (CS1, CS5): Centralized configuration with envalid validation
 */

// Custom validator for comma-separated strings
const commaSeparated = makeValidator<string[]>((input) => {
  if (!input || input === '') return ['*'];
  return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
});

// Custom validator for URLs with domain allowlist
const allowedUrlDomains = makeValidator<string[]>((input) => {
  if (!input || input === '') return ['localhost', 'tickettoken.com'];
  return input.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
});

/**
 * Load and validate all environment variables
 */
function loadConfig() {
  const env = cleanEnv(process.env, {
    // Server
    NODE_ENV: str({
      choices: ['development', 'test', 'staging', 'production'],
      default: 'development'
    }),
    SERVICE_NAME: str({ default: 'venue-service' }),
    SERVICE_VERSION: str({ default: '1.0.0' }),
    PORT: port({ default: 3004 }),
    HOST: str({ default: '0.0.0.0' }),
    LOG_LEVEL: str({
      choices: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
      default: 'info'
    }),

    // Database
    DB_HOST: str({ default: 'localhost' }),
    DB_PORT: port({ default: 6432 }),
    DB_NAME: str({ default: 'tickettoken_db' }),
    DB_USER: str({ default: 'postgres' }),
    DB_PASSWORD: str({ default: 'postgres', devDefault: 'postgres' }),
    DB_SSL_MODE: str({
      choices: ['disable', 'require', 'verify-ca', 'verify-full'],
      default: 'disable'
    }),
    DB_POOL_MIN: num({ default: 0 }),
    DB_POOL_MAX: num({ default: 10 }),
    DB_STATEMENT_TIMEOUT: num({ default: 30000 }),
    DB_LOCK_TIMEOUT: num({ default: 10000 }),

    // Redis
    REDIS_HOST: str({ default: 'localhost' }),
    REDIS_PORT: port({ default: 6379 }),
    REDIS_PASSWORD: str({ default: '' }),
    REDIS_DB: num({ default: 0 }),

    // RabbitMQ
    RABBITMQ_URL: str({ default: 'amqp://admin:admin@rabbitmq:5672' }),
    RABBITMQ_HOST: str({ default: 'rabbitmq' }),
    RABBITMQ_PORT: port({ default: 5672 }),
    RABBITMQ_USER: str({ default: 'admin' }),
    RABBITMQ_PASSWORD: str({ default: 'admin', devDefault: 'admin' }),

    // JWT & Auth
    JWT_SECRET: str({ devDefault: 'dev-jwt-secret-do-not-use-in-production' }),
    JWT_EXPIRY: str({ default: '1h' }),

    // Internal Service Auth
    INTERNAL_SERVICE_SECRET: str({ devDefault: '' }),
    INTERNAL_VALIDATION_SECRET: str({ devDefault: '' }),

    // Stripe
    STRIPE_SECRET_KEY: str({ devDefault: '' }),
    STRIPE_WEBHOOK_SECRET_VENUE: str({ devDefault: '' }),
    STRIPE_API_VERSION: str({ default: '2025-12-15.clover' }),

    // Rate Limiting
    RATE_LIMIT_MAX: num({ default: 100 }),
    RATE_LIMIT_WINDOW_MS: num({ default: 60000 }),

    // Security
    FORCE_HTTPS: bool({ default: false }),
    CORS_ORIGINS: str({ default: '*' }),
    ALLOWED_URL_DOMAINS: str({ default: 'localhost,tickettoken.com,*.tickettoken.com' }),

    // Features
    ENABLE_METRICS: bool({ default: true }),
    ENABLE_TRACING: bool({ default: false }),

    // External Services
    EVENT_SERVICE_URL: url({ devDefault: 'http://localhost:3002' }),
    AUTH_SERVICE_URL: url({ devDefault: 'http://localhost:3001' }),
    NOTIFICATION_SERVICE_URL: url({ devDefault: 'http://localhost:3008' }),
    ANALYTICS_API_URL: url({ devDefault: 'http://localhost:3010' }),

    // Compliance
    COMPLIANCE_TEAM_EMAIL: str({ default: 'compliance@tickettoken.com' }),
  });

  // Parse comma-separated values
  const corsOrigins = env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  const allowedUrlDomains = env.ALLOWED_URL_DOMAINS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  return {
    // Server config
    server: {
      nodeEnv: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      serviceVersion: env.SERVICE_VERSION,
      port: env.PORT,
      host: env.HOST,
      logLevel: env.LOG_LEVEL,
      isProduction: env.isProduction,
      isDevelopment: env.isDevelopment,
      isTest: env.isTest,
    },

    // Database config
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      name: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      sslMode: env.DB_SSL_MODE,
      pool: {
        min: env.DB_POOL_MIN,
        max: env.DB_POOL_MAX,
      },
      statementTimeout: env.DB_STATEMENT_TIMEOUT,
      lockTimeout: env.DB_LOCK_TIMEOUT,
    },

    // Redis config
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
    },

    // RabbitMQ config
    rabbitmq: {
      url: env.RABBITMQ_URL,
      host: env.RABBITMQ_HOST,
      port: env.RABBITMQ_PORT,
      user: env.RABBITMQ_USER,
      password: env.RABBITMQ_PASSWORD,
    },

    // Auth config
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiry: env.JWT_EXPIRY,
      internalServiceSecret: env.INTERNAL_SERVICE_SECRET,
      internalValidationSecret: env.INTERNAL_VALIDATION_SECRET,
    },

    // Stripe config
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET_VENUE,
      apiVersion: env.STRIPE_API_VERSION,
    },

    // Rate limiting config
    rateLimit: {
      max: env.RATE_LIMIT_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    },

    // Security config
    security: {
      forceHttps: env.FORCE_HTTPS,
      corsOrigins,
      allowedUrlDomains,
    },

    // Features config
    features: {
      enableMetrics: env.ENABLE_METRICS,
      enableTracing: env.ENABLE_TRACING,
    },

    // External services
    services: {
      eventService: env.EVENT_SERVICE_URL,
      authService: env.AUTH_SERVICE_URL,
      notificationService: env.NOTIFICATION_SERVICE_URL,
      analyticsService: env.ANALYTICS_API_URL,
    },

    // Compliance
    compliance: {
      teamEmail: env.COMPLIANCE_TEAM_EMAIL,
    },
  };
}

let configInstance: ReturnType<typeof loadConfig> | null = null;

export function getConfig() {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function isUrlAllowed(urlString: string): boolean {
  try {
    const parsedUrl = new URL(urlString);
    const config = getConfig();
    const allowedDomains = config.security.allowedUrlDomains;

    return allowedDomains.some(domain => {
      if (domain.startsWith('*.')) {
        const baseDomain = domain.slice(2);
        return parsedUrl.hostname === baseDomain ||
               parsedUrl.hostname.endsWith('.' + baseDomain);
      }
      return parsedUrl.hostname === domain;
    });
  } catch {
    return false;
  }
}

export function requireConfig(key: string, value: any): void {
  if (!value || value === '') {
    throw new Error(`Required configuration '${key}' is not set`);
  }
}

export type Config = ReturnType<typeof loadConfig>;
export default getConfig;
