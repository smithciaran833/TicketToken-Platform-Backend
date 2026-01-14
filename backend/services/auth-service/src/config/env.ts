import { config } from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables
config();

// CM-S6: Zod schema for environment validation
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),

  // Redis
  REDIS_HOST: z.string().default('redis'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT (RS256) - User tokens
  JWT_ISSUER: z.string().default('tickettoken-auth'),
  JWT_ACCESS_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'Invalid duration format (e.g., 15m, 1h, 7d)').default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'Invalid duration format').default('7d'),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  // Key rotation - previous keys
  JWT_PRIVATE_KEY_PREVIOUS: z.string().optional(),
  JWT_PUBLIC_KEY_PREVIOUS: z.string().optional(),

  // S2S (RS256) - Service-to-service tokens (separate from user JWT keys)
  S2S_PRIVATE_KEY: z.string().optional(),
  S2S_PUBLIC_KEY: z.string().optional(),
  S2S_PRIVATE_KEY_PATH: z.string().optional(),
  S2S_PUBLIC_KEY_PATH: z.string().optional(),
  S2S_TOKEN_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'Invalid duration format').default('24h'),

  // Encryption - optional in schema, handled in validation
  ENCRYPTION_KEY: z.string().optional(),

  // OAuth - Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional().or(z.literal('')),

  // OAuth - GitHub
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().url().optional().or(z.literal('')),

  // OAuth - Apple
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),

  // Security
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().int().min(5).max(60).default(15),

  // MFA
  MFA_ISSUER: z.string().default('TicketToken'),
  MFA_WINDOW: z.coerce.number().int().min(1).max(5).default(2),

  // CAPTCHA
  CAPTCHA_ENABLED: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  CAPTCHA_SECRET_KEY: z.string().optional(),
  CAPTCHA_PROVIDER: z.enum(['recaptcha', 'hcaptcha']).default('recaptcha'),
  CAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  CAPTCHA_FAIL_OPEN: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('TicketToken <noreply@tickettoken.com>'),

  // Swagger
  ENABLE_SWAGGER: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),

  // Service URLs
  API_GATEWAY_URL: z.string().url().default('http://api-gateway:3000'),
  VENUE_SERVICE_URL: z.string().url().default('http://venue-service:3002'),
  NOTIFICATION_SERVICE_URL: z.string().url().default('http://notification-service:3008'),

  // Graceful shutdown
  LB_DRAIN_DELAY: z.coerce.number().int().min(0).max(60).default(5),

  // Trusted proxies
  TRUSTED_PROXIES: z.string().optional(),

  // Multi-tenancy
  DEFAULT_TENANT_ID: z.string().uuid().default('00000000-0000-0000-0000-000000000001'),
});

// Production-specific schema with stricter requirements
const productionEnvSchema = envSchema.extend({
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required in production'),
  JWT_PRIVATE_KEY: z.string().min(1, 'JWT_PRIVATE_KEY is required in production'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY is required in production'),
  // S2S keys required in production for proper isolation
  S2S_PRIVATE_KEY: z.string().min(1, 'S2S_PRIVATE_KEY is required in production'),
  S2S_PUBLIC_KEY: z.string().min(1, 'S2S_PUBLIC_KEY is required in production'),
  // CAPTCHA required in production
  CAPTCHA_SECRET_KEY: z.string().min(1, 'CAPTCHA_SECRET_KEY is required in production'),
});

// Explicit type with ENCRYPTION_KEY as required string (we guarantee it in validateEnv)
export interface EnvConfig {
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  JWT_ISSUER: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  JWT_PRIVATE_KEY?: string;
  JWT_PUBLIC_KEY?: string;
  JWT_PRIVATE_KEY_PATH: string;
  JWT_PUBLIC_KEY_PATH: string;
  JWT_PRIVATE_KEY_PREVIOUS?: string;
  JWT_PUBLIC_KEY_PREVIOUS?: string;
  // S2S keys - separate from user JWT keys
  S2S_PRIVATE_KEY?: string;
  S2S_PUBLIC_KEY?: string;
  S2S_PRIVATE_KEY_PATH: string;
  S2S_PUBLIC_KEY_PATH: string;
  S2S_TOKEN_EXPIRES_IN: string;
  ENCRYPTION_KEY: string; // Always set (dev fallback or prod required)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_REDIRECT_URI?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  BCRYPT_ROUNDS: number;
  LOCKOUT_MAX_ATTEMPTS: number;
  LOCKOUT_DURATION_MINUTES: number;
  MFA_ISSUER: string;
  MFA_WINDOW: number;
  CAPTCHA_ENABLED: boolean;
  CAPTCHA_SECRET_KEY?: string;
  CAPTCHA_PROVIDER: 'recaptcha' | 'hcaptcha';
  CAPTCHA_MIN_SCORE: number;
  CAPTCHA_FAIL_OPEN: boolean;
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  ENABLE_SWAGGER: boolean;
  API_GATEWAY_URL: string;
  VENUE_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
  LB_DRAIN_DELAY: number;
  TRUSTED_PROXIES?: string;
  DEFAULT_TENANT_ID: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

function validateEnv(): EnvConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // Use stricter schema in production
  const schema = isProduction ? productionEnvSchema : envSchema;

  const result = schema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(issue => {
      return `  - ${issue.path.join('.')}: ${issue.message}`;
    }).join('\n');

    console.error('❌ Environment validation failed:\n' + errors);
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }

  const parsed = result.data;

  // Handle encryption key with dev fallback - always ensure it's a string
  let encryptionKey: string = parsed.ENCRYPTION_KEY || '';
  if (!encryptionKey) {
    if (isProduction) {
      throw new Error('ENCRYPTION_KEY is required in production');
    }
    console.warn('⚠️  WARNING: ENCRYPTION_KEY not set. Using insecure default for development only.');
    encryptionKey = 'dev-only-insecure-key-not-for-prod-32chars';
  }

  // JWT key paths (development only)
  const defaultKeyPath = path.join(process.env.HOME || '/tmp', 'tickettoken-secrets');

  return {
    NODE_ENV: parsed.NODE_ENV,
    PORT: parsed.PORT,
    LOG_LEVEL: parsed.LOG_LEVEL,
    DB_HOST: parsed.DB_HOST,
    DB_PORT: parsed.DB_PORT,
    DB_NAME: parsed.DB_NAME,
    DB_USER: parsed.DB_USER,
    DB_PASSWORD: parsed.DB_PASSWORD,
    REDIS_HOST: parsed.REDIS_HOST,
    REDIS_PORT: parsed.REDIS_PORT,
    REDIS_PASSWORD: parsed.REDIS_PASSWORD,
    JWT_ISSUER: parsed.JWT_ISSUER,
    JWT_ACCESS_EXPIRES_IN: parsed.JWT_ACCESS_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: parsed.JWT_REFRESH_EXPIRES_IN,
    JWT_PRIVATE_KEY: parsed.JWT_PRIVATE_KEY,
    JWT_PUBLIC_KEY: parsed.JWT_PUBLIC_KEY,
    JWT_PRIVATE_KEY_PATH: parsed.JWT_PRIVATE_KEY_PATH || path.join(defaultKeyPath, 'jwt-private.pem'),
    JWT_PUBLIC_KEY_PATH: parsed.JWT_PUBLIC_KEY_PATH || path.join(defaultKeyPath, 'jwt-public.pem'),
    JWT_PRIVATE_KEY_PREVIOUS: parsed.JWT_PRIVATE_KEY_PREVIOUS,
    JWT_PUBLIC_KEY_PREVIOUS: parsed.JWT_PUBLIC_KEY_PREVIOUS,
    // S2S keys - fall back to JWT keys in dev if not set
    S2S_PRIVATE_KEY: parsed.S2S_PRIVATE_KEY,
    S2S_PUBLIC_KEY: parsed.S2S_PUBLIC_KEY,
    S2S_PRIVATE_KEY_PATH: parsed.S2S_PRIVATE_KEY_PATH || path.join(defaultKeyPath, 's2s-private.pem'),
    S2S_PUBLIC_KEY_PATH: parsed.S2S_PUBLIC_KEY_PATH || path.join(defaultKeyPath, 's2s-public.pem'),
    S2S_TOKEN_EXPIRES_IN: parsed.S2S_TOKEN_EXPIRES_IN,
    ENCRYPTION_KEY: encryptionKey,
    GOOGLE_CLIENT_ID: parsed.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: parsed.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: parsed.GOOGLE_REDIRECT_URI || undefined,
    GITHUB_CLIENT_ID: parsed.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: parsed.GITHUB_CLIENT_SECRET,
    GITHUB_REDIRECT_URI: parsed.GITHUB_REDIRECT_URI || undefined,
    APPLE_CLIENT_ID: parsed.APPLE_CLIENT_ID,
    APPLE_TEAM_ID: parsed.APPLE_TEAM_ID,
    APPLE_KEY_ID: parsed.APPLE_KEY_ID,
    BCRYPT_ROUNDS: parsed.BCRYPT_ROUNDS,
    LOCKOUT_MAX_ATTEMPTS: parsed.LOCKOUT_MAX_ATTEMPTS,
    LOCKOUT_DURATION_MINUTES: parsed.LOCKOUT_DURATION_MINUTES,
    MFA_ISSUER: parsed.MFA_ISSUER,
    MFA_WINDOW: parsed.MFA_WINDOW,
    CAPTCHA_ENABLED: parsed.CAPTCHA_ENABLED,
    CAPTCHA_SECRET_KEY: parsed.CAPTCHA_SECRET_KEY,
    CAPTCHA_PROVIDER: parsed.CAPTCHA_PROVIDER,
    CAPTCHA_MIN_SCORE: parsed.CAPTCHA_MIN_SCORE,
    CAPTCHA_FAIL_OPEN: parsed.CAPTCHA_FAIL_OPEN,
    RESEND_API_KEY: parsed.RESEND_API_KEY,
    EMAIL_FROM: parsed.EMAIL_FROM,
    ENABLE_SWAGGER: parsed.ENABLE_SWAGGER,
    API_GATEWAY_URL: parsed.API_GATEWAY_URL,
    VENUE_SERVICE_URL: parsed.VENUE_SERVICE_URL,
    NOTIFICATION_SERVICE_URL: parsed.NOTIFICATION_SERVICE_URL,
    LB_DRAIN_DELAY: parsed.LB_DRAIN_DELAY,
    TRUSTED_PROXIES: parsed.TRUSTED_PROXIES,
    DEFAULT_TENANT_ID: parsed.DEFAULT_TENANT_ID,
    isProduction,
    isDevelopment: nodeEnv === 'development',
  };
}

export const env = validateEnv();

// Log environment on startup (non-sensitive fields only)
if (process.env.NODE_ENV !== 'test') {
  console.log('✅ Environment validated:', {
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    LOG_LEVEL: env.LOG_LEVEL,
    DB_HOST: env.DB_HOST,
    REDIS_HOST: env.REDIS_HOST,
    ENABLE_SWAGGER: env.ENABLE_SWAGGER,
    S2S_KEYS_CONFIGURED: !!(env.S2S_PRIVATE_KEY && env.S2S_PUBLIC_KEY),
    CAPTCHA_ENABLED: env.CAPTCHA_ENABLED,
  });
}
