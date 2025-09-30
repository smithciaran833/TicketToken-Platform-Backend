import { config } from 'dotenv';

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
  
  // JWT
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ISSUER: string;
  JWT_ACCESS_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  
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
  
  // Swagger
  ENABLE_SWAGGER?: boolean;
  
  // Service URLs
  API_GATEWAY_URL: string;
  VENUE_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
}

function validateEnv(): EnvConfig {
  const required = [
    'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  
  // Validate JWT secrets are different
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different');
  }
  
  // Validate JWT secrets length (256-bit minimum)
  if (process.env.JWT_ACCESS_SECRET!.length < 32 || process.env.JWT_REFRESH_SECRET!.length < 32) {
    throw new Error('JWT secrets must be at least 32 characters (256 bits)');
  }
  
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
    
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_ISSUER: process.env.JWT_ISSUER || 'api.tickettoken.com',
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '2h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    LOCKOUT_MAX_ATTEMPTS: parseInt(process.env.LOCKOUT_MAX_ATTEMPTS || '5', 10),
    LOCKOUT_DURATION_MINUTES: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
    
    MFA_ISSUER: process.env.MFA_ISSUER || 'TicketToken',
    MFA_WINDOW: parseInt(process.env.MFA_WINDOW || '2', 10),
    
    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',
    
    API_GATEWAY_URL: process.env.API_GATEWAY_URL || 'http://api-gateway:3000',
    VENUE_SERVICE_URL: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
  };
}

export const env = validateEnv();
