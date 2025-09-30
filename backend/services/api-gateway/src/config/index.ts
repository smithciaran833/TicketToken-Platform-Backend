import { serviceUrls } from './services';

export const config = {
 environment: process.env.NODE_ENV || 'development',
 server: {
   port: parseInt(process.env.PORT || '3000', 10),
   host: process.env.HOST || '0.0.0.0',
 },
 redis: {
   host: process.env.REDIS_HOST || 'redis',
   port: parseInt(process.env.REDIS_PORT || '6379', 10),
   password: process.env.REDIS_PASSWORD,
   db: parseInt(process.env.REDIS_DB || '0', 10),
 },
 services: {
   auth: serviceUrls.auth,
   venue: serviceUrls.venue,
   ticket: serviceUrls.ticket,
   payment: serviceUrls.payment,
   nft: serviceUrls.marketplace,
   notification: serviceUrls.notification,
   search: serviceUrls.search,
   event: serviceUrls.event,
   marketplace: serviceUrls.marketplace,
   analytics: serviceUrls.analytics,
   integration: serviceUrls.integration,
   compliance: serviceUrls.compliance,
   queue: serviceUrls.queue,
   file: serviceUrls.file,
   monitoring: serviceUrls.monitoring,
   blockchain: serviceUrls.blockchain,
   order: serviceUrls.order,
   scanning: serviceUrls.scanning,
   minting: serviceUrls.minting,
   transfer: serviceUrls.transfer,
 },
 jwt: {
   secret: process.env.JWT_SECRET || 'development_secret_change_in_production',
   accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'development_secret_change_in_production',
   refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'development_secret_change_in_production',
   expiresIn: process.env.JWT_EXPIRES_IN || '24h',
   accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || process.env.JWT_EXPIRES_IN || '24h',
   refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
   issuer: process.env.JWT_ISSUER || 'tickettoken-api',
 },
 rateLimit: {
   enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
   global: {
     max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '100', 10),
     timeWindow: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW || '60000', 10),
   },
   ticketPurchase: {
     max: parseInt(process.env.RATE_LIMIT_TICKET_MAX || '5', 10),
     timeWindow: parseInt(process.env.RATE_LIMIT_TICKET_WINDOW || '60000', 10),
     blockDuration: parseInt(process.env.RATE_LIMIT_TICKET_BLOCK || '300000', 10),
   },
 },
 cors: {
   origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://api-gateway:3000', 'http://frontend:5173'],
   credentials: true,
 },
 logging: {
   level: process.env.LOG_LEVEL || 'info',
   pretty: process.env.NODE_ENV !== 'production',
 },
 monitoring: {
   enableMetrics: process.env.ENABLE_METRICS !== 'false',
   enableTracing: process.env.ENABLE_TRACING === 'true',
 },
 timeouts: {
   default: parseInt(process.env.TIMEOUT_DEFAULT || '10000', 10),
   payment: parseInt(process.env.TIMEOUT_PAYMENT || '30000', 10),
   nftMinting: parseInt(process.env.TIMEOUT_NFT_MINTING || '120000', 10),
 },
 circuitBreaker: {
   timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '10000', 10),
   errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50', 10),
   resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000', 10),
   volumeThreshold: parseInt(process.env.CIRCUIT_BREAKER_VOLUME_THRESHOLD || '10', 10),
 },
};

export const timeoutConfig = {
 services: {
   'ticket-service': {
     default: 10000,
     endpoints: {
       'POST /tickets/purchase': 30000,
       'GET /tickets/:id': 5000,
       'POST /tickets/validate': 5000,
     },
   },
   'nft-service': {
     default: 60000,
     endpoints: {
       'POST /nft/mint': 120000,
       'POST /nft/transfer': 90000,
       'GET /nft/metadata': 10000,
     },
   },
   'payment-service': {
     default: 30000,
     endpoints: {
       'POST /payments/process': 45000,
       'POST /payments/refund': 30000,
       'GET /payments/:id': 5000,
     },
   },
 },
};
