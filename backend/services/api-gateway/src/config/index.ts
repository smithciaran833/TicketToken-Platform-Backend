import { serviceUrls } from './services';

const isProduction = process.env.NODE_ENV === 'production';

// Helper to get required env vars - fails fast in production if missing
function requireEnv(name: string, devDefault?: string): string {
  const value = process.env[name];
  if (value) return value;
  
  if (isProduction) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  
  if (devDefault !== undefined) {
    console.warn(`[CONFIG] Using development default for ${name} - DO NOT USE IN PRODUCTION`);
    return devDefault;
  }
  
  throw new Error(`Missing required environment variable: ${name}`);
}

// Helper for optional env vars with defaults (safe for any environment)
function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  environment: process.env.NODE_ENV || 'development',
  server: {
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    host: optionalEnv('HOST', '0.0.0.0'),
  },
  redis: {
    host: optionalEnv('REDIS_HOST', 'redis'),
    port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(optionalEnv('REDIS_DB', '0'), 10),
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
    // SECURITY: No fallback secrets in production - must be explicitly configured
    secret: requireEnv('JWT_SECRET', 'dev-jwt-secret-do-not-use-in-production'),
    accessSecret: process.env.JWT_ACCESS_SECRET || requireEnv('JWT_SECRET', 'dev-jwt-secret-do-not-use-in-production'),
    refreshSecret: process.env.JWT_REFRESH_SECRET || requireEnv('JWT_SECRET', 'dev-jwt-secret-do-not-use-in-production'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '24h'),
    accessTokenExpiry: optionalEnv('JWT_ACCESS_EXPIRY', optionalEnv('JWT_EXPIRES_IN', '24h')),
    refreshTokenExpiry: optionalEnv('JWT_REFRESH_EXPIRY', '7d'),
    issuer: optionalEnv('JWT_ISSUER', 'tickettoken-api'),
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    global: {
      max: parseInt(optionalEnv('RATE_LIMIT_GLOBAL_MAX', '100'), 10),
      timeWindow: parseInt(optionalEnv('RATE_LIMIT_GLOBAL_WINDOW', '60000'), 10),
    },
    ticketPurchase: {
      max: parseInt(optionalEnv('RATE_LIMIT_TICKET_MAX', '5'), 10),
      timeWindow: parseInt(optionalEnv('RATE_LIMIT_TICKET_WINDOW', '60000'), 10),
      blockDuration: parseInt(optionalEnv('RATE_LIMIT_TICKET_BLOCK', '300000'), 10),
    },
  },
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://api-gateway:3000', 'http://frontend:5173'],
    credentials: true,
  },
  logging: {
    level: optionalEnv('LOG_LEVEL', 'info'),
    pretty: process.env.NODE_ENV !== 'production',
  },
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    enableTracing: process.env.ENABLE_TRACING === 'true',
  },
  timeouts: {
    default: parseInt(optionalEnv('TIMEOUT_DEFAULT', '10000'), 10),
    payment: parseInt(optionalEnv('TIMEOUT_PAYMENT', '30000'), 10),
    nftMinting: parseInt(optionalEnv('TIMEOUT_NFT_MINTING', '120000'), 10),
  },
  circuitBreaker: {
    timeout: parseInt(optionalEnv('CIRCUIT_BREAKER_TIMEOUT', '10000'), 10),
    errorThresholdPercentage: parseInt(optionalEnv('CIRCUIT_BREAKER_ERROR_THRESHOLD', '50'), 10),
    resetTimeout: parseInt(optionalEnv('CIRCUIT_BREAKER_RESET_TIMEOUT', '30000'), 10),
    volumeThreshold: parseInt(optionalEnv('CIRCUIT_BREAKER_VOLUME_THRESHOLD', '10'), 10),
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
