import dotenv from 'dotenv';
dotenv.config();

// Validate required secrets on startup
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `FATAL: Required environment variable ${name} is not set. ` +
      `Please set it in your .env file or environment. ` +
      `See .env.example for details.`
    );
  }
  return value;
}

// Only require secrets in production
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3004', 10),
  
  database: {
    url: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    }
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
    ttl: {
      reservation: 600,
      qrCode: 60,
      cache: 300
    }
  },
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672',
    queues: {
      nftMinting: 'nft-minting',
      ticketEvents: 'ticket-events',
      notifications: 'notifications'
    }
  },
  
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    commitment: 'confirmed' as const,
    walletPrivateKey: process.env.SOLANA_WALLET_PRIVATE_KEY
  },
  
  services: {
    event: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3006',
    auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    order: process.env.ORDER_SERVICE_URL || 'http://order-service:3005', // NEW!
    minting: process.env.MINTING_SERVICE_URL || 'http://minting-service:3007',
  },
  
  jwt: {
    secret: isProduction ? requireEnv('JWT_SECRET') : (process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production')
  },
  
  qr: {
    rotationInterval: 30000,
    encryptionKey: isProduction ? requireEnv('QR_ENCRYPTION_KEY') : (process.env.QR_ENCRYPTION_KEY || 'dev-qr-key-32-chars-long-pls!')
  },
  
  limits: {
    maxTicketsPerPurchase: 10,
    reservationTimeout: 600,
    maxRetriesNFT: 3
  },
  
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'tickettoken-tickets'
  },

  // Feature flags
  serviceTimeout: parseInt(process.env.SERVICE_TIMEOUT || '30000', 10),
  internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET || '',
  features: {
    useOrderService: process.env.USE_ORDER_SERVICE === 'true', // NEW FEATURE FLAG!
  }
};
