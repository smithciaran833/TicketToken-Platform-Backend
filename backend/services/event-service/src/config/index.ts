import dotenv from 'dotenv';
import { AppConfig } from '../types';

dotenv.config();

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
