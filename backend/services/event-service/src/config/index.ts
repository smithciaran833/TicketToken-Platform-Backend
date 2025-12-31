import dotenv from 'dotenv';
import { AppConfig } from '../types';

dotenv.config();

/**
 * Environment-specific log levels.
 * Production uses 'info' to avoid excessive logging.
 * Development uses 'debug' for more verbose output.
 */
const LOG_LEVELS: Record<string, string> = {
  production: 'info',
  staging: 'info',
  development: 'debug',
  test: 'warn',
};

/**
 * Logging configuration.
 * 
 * CRITICAL FIX for audit findings:
 * - PII redaction fields to prevent sensitive data leakage
 * - Environment-specific log levels
 * - Sampling rate for high-volume production environments
 */
export const loggingConfig = {
  /** Log level based on environment */
  level: process.env.LOG_LEVEL || LOG_LEVELS[process.env.NODE_ENV || 'development'] || 'info',
  
  /** Log format: 'json' for production, 'pretty' for development */
  format: process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
  
  /**
   * Sampling rate for request logging (0.0 - 1.0).
   * In production, set to < 1.0 to reduce log volume.
   * 1.0 = log all requests, 0.1 = log 10% of requests
   */
  samplingRate: parseFloat(process.env.LOG_SAMPLING_RATE || '1.0'),
  
  /**
   * Fields to redact from logs.
   * These will be replaced with '[REDACTED]' to prevent PII leakage.
   */
  redactFields: [
    // Direct PII fields
    'email',
    'password',
    'token',
    'authorization',
    'creditCard',
    'ssn',
    'phone',
    'address',
    'apiKey',
    'secret',
    'refreshToken',
    'accessToken',
    
    // Nested fields
    '*.email',
    '*.password',
    '*.token',
    '*.authorization',
    '*.creditCard',
    '*.ssn',
    '*.phone',
    '*.address',
    '*.apiKey',
    '*.secret',
    
    // Request/response headers
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.headers["x-auth-token"]',
    'req.headers["x-service-token"]',
    'res.headers["set-cookie"]',
  ],
  
  /** Include request body in logs (only in development) */
  includeRequestBody: process.env.NODE_ENV !== 'production',
  
  /** Include response body in logs (only in development, be careful with size) */
  includeResponseBody: false,
};

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3003', 10),
  host: process.env.HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '6432', 10),
    user: process.env.DB_USER || 'tickettoken_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tickettoken'
  },
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD
  },
  services: {
    venueServiceUrl: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001'
  }
};
