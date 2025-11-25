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
  JWT_PRIVATE_KEY_PATH: string;
  JWT_PUBLIC_KEY_PATH: string;

  // Encryption
  ENCRYPTION_KEY: string;

  // OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
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
  const required = [
    'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Validate email configuration in production
  if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required in production');
  }

  // Set default JWT key paths
  const defaultKeyPath = path.join(process.env.HOME!, 'tickettoken-secrets');
  const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || path.join(defaultKeyPath, 'jwt-private.pem');
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(defaultKeyPath, 'jwt-public.pem');

  // Generate or use encryption key (32 bytes for AES-256)
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32chars';

  return {
    NODE_ENV: (process.env.NODE_ENV as any) || 'development',
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
    JWT_PRIVATE_KEY_PATH: privateKeyPath,
    JWT_PUBLIC_KEY_PATH: publicKeyPath,

    ENCRYPTION_KEY: encryptionKey,

    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    LOCKOUT_MAX_ATTEMPTS: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10),
    LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),

    MFA_ISSUER: process.env.MFA_ISSUER || 'TicketToken',
    MFA_WINDOW: parseInt(process.env.MFA_WINDOW || '2', 10),

    // Email configuration
    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    EMAIL_FROM: process.env.EMAIL_FROM || 'TicketToken <noreply@tickettoken.com>',

    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',

    API_GATEWAY_URL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
    VENUE_SERVICE_URL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
  };
}

export const env = validateEnv();
