import { db } from './database';
import { getRedis, cache, initRedis, closeRedisConnections } from './redis';
import blockchain from './blockchain';
import constants from './constants';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'REDIS_HOST',
  'JWT_SECRET',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables:', missingEnvVars);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

/**
 * FIX #32: Validate JWT_SECRET properly - no insecure fallback
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('CRITICAL: JWT_SECRET is required in production');
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    // In development, generate a random secret and log a warning
    const randomSecret = require('crypto').randomBytes(32).toString('hex');
    logger.warn('JWT_SECRET not set - using randomly generated secret for this session (dev mode only). Set JWT_SECRET in .env for persistent sessions.');
    return randomSecret;
  }
  
  // Warn if secret looks too weak (less than 32 chars)
  if (secret.length < 32) {
    logger.warn('JWT_SECRET appears weak (< 32 characters). Consider using a stronger secret.');
  }
  
  return secret;
}

// Service configuration
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3016'),
  serviceName: process.env.SERVICE_NAME || 'marketplace-service',

  // Service URLs
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  ticketServiceUrl: process.env.TICKET_SERVICE_URL || process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3007',

  // JWT - FIX #32: No insecure default, throws in production if missing
  jwtSecret: getJwtSecret(),

  // Feature flags
  features: {
    requireWalletForListing: true,
    autoExpireListings: true,
    requireVenueApproval: false,
    enableTaxReporting: true,
  },
};

// Export everything
export { db, getRedis, cache, blockchain, constants, initRedis, closeRedisConnections };
export default config;

// Additional service URLs
export const serviceUrls = {
  blockchainServiceUrl: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3010',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
};

// Merge with existing config
Object.assign(config, serviceUrls);
