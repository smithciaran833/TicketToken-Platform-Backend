import dotenv from 'dotenv';
// import { QUEUES } from "@tickettoken/shared/src/mq/queues";
dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3003'),
    env: process.env.NODE_ENV || 'development'
  },

  database: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'tickettoken',
    user: process.env.DB_USER || 'tickettoken_user',
    password: process.env.DB_PASSWORD || ''
  },

  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
  },

  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    mode: process.env.PAYPAL_MODE || 'sandbox'
  },

  square: {
    accessToken: process.env.SQUARE_ACCESS_TOKEN || '',
    environment: process.env.SQUARE_ENVIRONMENT || 'sandbox'
  },

  plaid: {
    clientId: process.env.PLAID_CLIENT_ID || '',
    secret: process.env.PLAID_SECRET || '',
    env: process.env.PLAID_ENV || 'sandbox'
  },

  taxJar: {
    apiKey: process.env.TAXJAR_API_KEY || ''
  },

  blockchain: {
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    polygonRpcUrl: process.env.POLYGON_RPC_URL || ''
  },

  services: {
    authUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    eventUrl: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
    ticketUrl: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3004',
    venueUrl: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    paymentUrl: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3006',
    marketplaceUrl: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3008'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key'
  }
};
