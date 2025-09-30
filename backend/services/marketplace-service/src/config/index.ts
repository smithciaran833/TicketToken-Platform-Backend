import { db } from './database';
import { redis, cache } from './redis';
import blockchain from './blockchain';
import constants from './constants';
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
  console.error('Missing required environment variables:', missingEnvVars);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Service configuration
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3008'),
  serviceName: process.env.SERVICE_NAME || 'marketplace-service',
  
  // Service URLs
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
  ticketServiceUrl: process.env.TICKET_SERVICE_URL || process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3007',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'default-secret-key',
  
  // Feature flags
  features: {
    requireWalletForListing: true,
    autoExpireListings: true,
    requireVenueApproval: false,
    enableTaxReporting: true,
  },
};

// Export everything
export { db, redis, cache, blockchain, constants };
export default config;

// Additional service URLs
export const serviceUrls = {
  blockchainServiceUrl: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3010',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
};

// Merge with existing config
Object.assign(config, serviceUrls);
