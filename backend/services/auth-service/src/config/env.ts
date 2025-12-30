import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config();

export interface EnvConfig {
  // Server
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  LOG_LEVEL: string;

  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;

  // JWT (RS256)
  JWT_ISSUER: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  // File paths only used in development
  JWT_PRIVATE_KEY_PATH?: string;
  JWT_PUBLIC_KEY_PATH?: string;

  // Encryption
  ENCRYPTION_KEY: string;

  // OAuth - Google
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;

  // OAuth - GitHub
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_REDIRECT_URI?: string;

  // OAuth - Apple
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;

  // Security
  BCRYPT_ROUNDS: number;
  LOCKOUT_MAX_ATTEMPTS: number;
  LOCKOUT_DURATION_MINUTES: number;

  // MFA
  MFA_ISSUER: string;
  MFA_WINDOW: number;

  // Email (Resend)
  RESEND_API_KEY: string;
  EMAIL_FROM: string;

  // Swagger
  ENABLE_SWAGGER?: boolean;

  // Service URLs
  API_GATEWAY_URL: string;
  VENUE_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
}

function validateEnv(): EnvConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // Required in all environments
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Production-only requirements
  if (isProduction) {
    const productionRequired = [
      'ENCRYPTION_KEY',
      'RESEND_API_KEY',
      'JWT_PRIVATE_KEY',
      'JWT_PUBLIC_KEY',
    ];

    for (const key of productionRequired) {
      if (!process.env[key]) {
        throw new Error(`Missing required production environment variable: ${key}`);
      }
    }
  }

  // Encryption key validation
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    if (isProduction) {
      throw new Error('ENCRYPTION_KEY is required in production environment');
    }
    console.warn('⚠️  WARNING: ENCRYPTION_KEY not set. Using insecure default for development only.');
  } else if (encryptionKey.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters for AES-256 encryption');
  }

  // Development-only fallback (will fail in production due to check above)
  const finalEncryptionKey = encryptionKey || 'dev-only-insecure-key-not-for-prod-32chars';

  // JWT key paths (development only)
  const defaultKeyPath = path.join(process.env.HOME || '/tmp', 'tickettoken-secrets');

  return {
    NODE_ENV: nodeEnv as EnvConfig['NODE_ENV'],
    PORT: parseInt(process.env.PORT || '3001', 10),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    DB_HOST: process.env.DB_HOST!,
    DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
    DB_NAME: process.env.DB_NAME!,
    DB_USER: process.env.DB_USER!,
    DB_PASSWORD: process.env.DB_PASSWORD!,

    REDIS_HOST: process.env.REDIS_HOST || 'redis',
    REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,

    JWT_ISSUER: process.env.JWT_ISSUER || 'tickettoken-auth',
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    // Only used in development - production loads from secrets manager
    JWT_PRIVATE_KEY_PATH: process.env.JWT_PRIVATE_KEY_PATH || path.join(defaultKeyPath, 'jwt-private.pem'),
    JWT_PUBLIC_KEY_PATH: process.env.JWT_PUBLIC_KEY_PATH || path.join(defaultKeyPath, 'jwt-public.pem'),

    ENCRYPTION_KEY: finalEncryptionKey,

    // OAuth - loaded from secrets manager in production
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,

    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GITHUB_REDIRECT_URI: process.env.GITHUB_REDIRECT_URI,

    APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
    APPLE_KEY_ID: process.env.APPLE_KEY_ID,

    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    LOCKOUT_MAX_ATTEMPTS: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10),
    LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),

    MFA_ISSUER: process.env.MFA_ISSUER || 'TicketToken',
    MFA_WINDOW: parseInt(process.env.MFA_WINDOW || '2', 10),

    // Email - required in production
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    EMAIL_FROM: process.env.EMAIL_FROM || 'TicketToken <noreply@tickettoken.com>',

    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',

    API_GATEWAY_URL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
    VENUE_SERVICE_URL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008',
  };
}

export const env = validateEnv();
