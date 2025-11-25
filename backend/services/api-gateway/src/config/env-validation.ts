import { z } from 'zod';

// Environment variable schema with Zod
const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // JWT Configuration (REQUIRED in production)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRY: z.string().default('7d'),
  JWT_ISSUER: z.string().default('tickettoken-api-gateway'),

  // Redis Configuration (REQUIRED in production)
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).pipe(z.number()).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).pipe(z.number().min(0).max(15)).default('0'),

  // Service URLs (REQUIRED)
  AUTH_SERVICE_URL: z.string().url('AUTH_SERVICE_URL must be a valid URL'),
  VENUE_SERVICE_URL: z.string().url('VENUE_SERVICE_URL must be a valid URL'),
  EVENT_SERVICE_URL: z.string().url('EVENT_SERVICE_URL must be a valid URL'),
  TICKET_SERVICE_URL: z.string().url('TICKET_SERVICE_URL must be a valid URL'),
  PAYMENT_SERVICE_URL: z.string().url('PAYMENT_SERVICE_URL must be a valid URL'),
  MARKETPLACE_SERVICE_URL: z.string().url('MARKETPLACE_SERVICE_URL must be a valid URL'),
  ANALYTICS_SERVICE_URL: z.string().url('ANALYTICS_SERVICE_URL must be a valid URL'),
  NOTIFICATION_SERVICE_URL: z.string().url('NOTIFICATION_SERVICE_URL must be a valid URL'),
  INTEGRATION_SERVICE_URL: z.string().url('INTEGRATION_SERVICE_URL must be a valid URL'),
  COMPLIANCE_SERVICE_URL: z.string().url('COMPLIANCE_SERVICE_URL must be a valid URL'),
  QUEUE_SERVICE_URL: z.string().url('QUEUE_SERVICE_URL must be a valid URL'),
  SEARCH_SERVICE_URL: z.string().url('SEARCH_SERVICE_URL must be a valid URL'),
  FILE_SERVICE_URL: z.string().url('FILE_SERVICE_URL must be a valid URL'),
  MONITORING_SERVICE_URL: z.string().url('MONITORING_SERVICE_URL must be a valid URL'),
  BLOCKCHAIN_SERVICE_URL: z.string().url('BLOCKCHAIN_SERVICE_URL must be a valid URL'),
  ORDER_SERVICE_URL: z.string().url('ORDER_SERVICE_URL must be a valid URL'),
  SCANNING_SERVICE_URL: z.string().url('SCANNING_SERVICE_URL must be a valid URL'),
  MINTING_SERVICE_URL: z.string().url('MINTING_SERVICE_URL must be a valid URL'),
  TRANSFER_SERVICE_URL: z.string().url('TRANSFER_SERVICE_URL must be a valid URL'),

  // Optional Configuration
  RATE_LIMIT_MAX: z.string().transform(Number).pipe(z.number().positive()).default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().positive()).default('60000'),
  MAX_REQUEST_SIZE: z.string().default('10mb'),
  CORS_ORIGIN: z.string().default('*'),
  ENABLE_SWAGGER: z.string().transform((v: string) => v === 'true').default('false'),
});

// Production-specific validation
const productionSchema = envSchema.extend({
  JWT_SECRET: z.string()
    .min(32, 'JWT_SECRET must be at least 32 characters in production')
    .refine(
      (val: string) => val !== 'your-secret-key-here' && val !== 'default',
      'JWT_SECRET cannot be default value in production'
    ),
  REDIS_PASSWORD: z.string().min(8, 'REDIS_PASSWORD is required and must be at least 8 characters in production'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate environment variables on startup
 * Throws error if validation fails
 */
export function validateEnv(): EnvConfig {
  const env = process.env;

  try {
    // Use production schema if NODE_ENV is production
    const schema = env.NODE_ENV === 'production' ? productionSchema : envSchema;
    
    const validated = schema.parse(env);

    return validated;
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const formatted = error.issues.map((issue: z.ZodIssue) => {
        return `${issue.path.join('.')}: ${issue.message}`;
      }).join('\n');

      console.error('❌ Environment variable validation failed:');
      console.error(formatted);
      console.error('\nPlease check your .env file and ensure all required variables are set correctly.');
      
      throw new Error(`Environment validation failed:\n${formatted}`);
    }
    throw error;
  }
}

/**
 * Log sanitized environment configuration (no secrets)
 */
export function logSanitizedConfig(config: EnvConfig): void {
  const sanitized = {
    nodeEnv: config.NODE_ENV,
    port: config.PORT,
    host: config.HOST,
    logLevel: config.LOG_LEVEL,
    jwtIssuer: config.JWT_ISSUER,
    jwtAccessExpiry: config.JWT_ACCESS_TOKEN_EXPIRY,
    jwtRefreshExpiry: config.JWT_REFRESH_TOKEN_EXPIRY,
    redis: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      db: config.REDIS_DB,
      passwordSet: !!config.REDIS_PASSWORD,
    },
    services: {
      auth: config.AUTH_SERVICE_URL,
      venue: config.VENUE_SERVICE_URL,
      event: config.EVENT_SERVICE_URL,
      ticket: config.TICKET_SERVICE_URL,
      payment: config.PAYMENT_SERVICE_URL,
      marketplace: config.MARKETPLACE_SERVICE_URL,
      analytics: config.ANALYTICS_SERVICE_URL,
      notification: config.NOTIFICATION_SERVICE_URL,
      integration: config.INTEGRATION_SERVICE_URL,
      compliance: config.COMPLIANCE_SERVICE_URL,
      queue: config.QUEUE_SERVICE_URL,
      search: config.SEARCH_SERVICE_URL,
      file: config.FILE_SERVICE_URL,
      monitoring: config.MONITORING_SERVICE_URL,
      blockchain: config.BLOCKCHAIN_SERVICE_URL,
      order: config.ORDER_SERVICE_URL,
      scanning: config.SCANNING_SERVICE_URL,
      minting: config.MINTING_SERVICE_URL,
      transfer: config.TRANSFER_SERVICE_URL,
    },
    rateLimit: {
      max: config.RATE_LIMIT_MAX,
      windowMs: config.RATE_LIMIT_WINDOW_MS,
    },
    maxRequestSize: config.MAX_REQUEST_SIZE,
    corsOrigin: config.CORS_ORIGIN,
    swaggerEnabled: config.ENABLE_SWAGGER,
  };

  console.log('✅ Environment configuration loaded:');
  console.log(JSON.stringify(sanitized, null, 2));
}
