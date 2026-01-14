import dotenv from 'dotenv';
dotenv.config();

// =============================================================================
// SECURITY: Environment validation helpers
// =============================================================================

/**
 * Require an environment variable - throws if not set
 */
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

/**
 * Require an environment variable in production only
 */
function requireInProduction(name: string, devDefault?: string): string {
  const value = process.env[name];
  
  if (isProduction) {
    if (!value) {
      throw new Error(
        `FATAL: ${name} is REQUIRED in production but not set. ` +
        `This service cannot start without proper configuration.`
      );
    }
    return value;
  }
  
  // In development, warn but allow fallback
  if (!value && devDefault) {
    console.warn(
      `WARNING: ${name} not set, using development fallback. ` +
      `This is INSECURE and must not be used in production.`
    );
    return devDefault;
  }
  
  return value || '';
}

/**
 * Validate a secret meets minimum security requirements
 */
function validateSecret(name: string, value: string, minLength: number = 32): string {
  if (isProduction && value.length < minLength) {
    throw new Error(
      `FATAL: ${name} must be at least ${minLength} characters in production. ` +
      `Current length: ${value.length}`
    );
  }
  return value;
}

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// =============================================================================
// CONFIGURATION EXPORT
// =============================================================================

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3004', 10),
  
  // ---------------------------------------------------------------------------
  // Database Configuration
  // ---------------------------------------------------------------------------
  database: {
    url: requireInProduction(
      'DATABASE_URL',
      `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'tickettoken'}`
    ),
    pool: {
      // MEDIUM Fix: Pool min set to 0 for better scaling under low load
      min: parseInt(process.env.DB_POOL_MIN || '0', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10),
    },
    // SECURITY: Statement timeout to prevent long-running queries
    statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
    // SECURITY: Lock timeout to prevent deadlocks (Batch 11 Fix #4)
    lockTimeout: parseInt(process.env.DB_LOCK_TIMEOUT || '10000', 10),
    // SECURITY: TLS/SSL configuration (MEDIUM Fix: Database TLS not explicit)
    ssl: (() => {
      const sslMode = process.env.DB_SSL_MODE || (isProduction ? 'require' : 'prefer');
      if (sslMode === 'disable') {
        if (isProduction) {
          console.error('FATAL: SSL cannot be disabled in production');
          process.exit(1);
        }
        return false;
      }
      // In production, require TLS with certificate verification
      if (isProduction) {
        return {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ca: process.env.DB_SSL_CA ? Buffer.from(process.env.DB_SSL_CA, 'base64').toString() : undefined,
          cert: process.env.DB_SSL_CERT ? Buffer.from(process.env.DB_SSL_CERT, 'base64').toString() : undefined,
          key: process.env.DB_SSL_KEY ? Buffer.from(process.env.DB_SSL_KEY, 'base64').toString() : undefined,
        };
      }
      // In development, allow flexible SSL modes
      return sslMode === 'require' ? { rejectUnauthorized: false } : false;
    })(),
  },
  
  // ---------------------------------------------------------------------------
  // Redis Configuration
  // ---------------------------------------------------------------------------
  redis: {
    // SECURITY: Require Redis URL in production (no defaults)
    url: requireInProduction('REDIS_URL', 'redis://localhost:6379'),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true',
    ttl: {
      reservation: parseInt(process.env.REDIS_TTL_RESERVATION || '600', 10),
      qrCode: parseInt(process.env.REDIS_TTL_QR || '60', 10),
      cache: parseInt(process.env.REDIS_TTL_CACHE || '300', 10),
    },
  },
  
  // ---------------------------------------------------------------------------
  // RabbitMQ Configuration
  // SECURITY: NO DEFAULT CREDENTIALS - must be explicitly configured
  // ---------------------------------------------------------------------------
  rabbitmq: {
    url: requireInProduction('RABBITMQ_URL'),
    // SECURITY: In production, require TLS (amqps://)
    validateTls: () => {
      const url = process.env.RABBITMQ_URL || '';
      if (isProduction && !url.startsWith('amqps://')) {
        console.error('WARNING: RabbitMQ should use amqps:// (TLS) in production');
      }
    },
    queues: {
      nftMinting: process.env.RABBITMQ_QUEUE_MINTING || 'nft-minting',
      ticketEvents: process.env.RABBITMQ_QUEUE_EVENTS || 'ticket-events',
      notifications: process.env.RABBITMQ_QUEUE_NOTIFICATIONS || 'notifications',
    },
  },
  
  // ---------------------------------------------------------------------------
  // Solana/Blockchain Configuration
  // ---------------------------------------------------------------------------
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    commitment: (process.env.SOLANA_COMMITMENT || 'confirmed') as 'processed' | 'confirmed' | 'finalized',
    // SECURITY: Wallet private key is REQUIRED for blockchain operations
    walletPrivateKey: process.env.SOLANA_WALLET_PRIVATE_KEY,
    // SECURITY: In production, require mainnet or specific cluster
    cluster: process.env.SOLANA_CLUSTER || 'devnet',
  },
  
  // ---------------------------------------------------------------------------
  // Internal Service URLs
  // SECURITY: In production, these should use HTTPS or be behind a service mesh
  // ---------------------------------------------------------------------------
  services: {
    event: requireInProduction('EVENT_SERVICE_URL', 'http://event-service:3003'),
    payment: requireInProduction('PAYMENT_SERVICE_URL', 'http://payment-service:3006'),
    auth: requireInProduction('AUTH_SERVICE_URL', 'http://auth-service:3001'),
    order: process.env.ORDER_SERVICE_URL || 'http://order-service:3005',
    minting: process.env.MINTING_SERVICE_URL || 'http://minting-service:3007',
    user: process.env.USER_SERVICE_URL || 'http://user-service:3002',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3007',
  },
  
  // ---------------------------------------------------------------------------
  // JWT Configuration
  // SECURITY: JWT_SECRET is REQUIRED - no fallbacks
  // ---------------------------------------------------------------------------
  jwt: {
    secret: validateSecret(
      'JWT_SECRET',
      requireInProduction('JWT_SECRET'),
      64 // Require 64+ chars in production
    ),
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH,
    issuer: process.env.JWT_ISSUER || 'tickettoken-auth',
    audience: process.env.JWT_AUDIENCE || 'tickettoken-services',
  },
  
  // ---------------------------------------------------------------------------
  // QR Code Configuration
  // SECURITY: QR_ENCRYPTION_KEY is REQUIRED - must be 32 bytes for AES-256
  // ---------------------------------------------------------------------------
  qr: {
    rotationInterval: parseInt(process.env.QR_ROTATION_INTERVAL || '30000', 10),
    encryptionKey: (() => {
      const key = requireInProduction('QR_ENCRYPTION_KEY');
      if (isProduction && key.length !== 32) {
        throw new Error(
          `FATAL: QR_ENCRYPTION_KEY must be exactly 32 characters for AES-256. ` +
          `Current length: ${key.length}`
        );
      }
      return key;
    })(),
  },
  
  // ---------------------------------------------------------------------------
  // Service-to-Service Authentication
  // SECURITY: INTERNAL_SERVICE_SECRET is REQUIRED in production
  // ---------------------------------------------------------------------------
  internalServiceSecret: validateSecret(
    'INTERNAL_SERVICE_SECRET',
    requireInProduction('INTERNAL_SERVICE_SECRET'),
    64
  ),
  
  // ---------------------------------------------------------------------------
  // Business Logic Limits
  // ---------------------------------------------------------------------------
  limits: {
    maxTicketsPerPurchase: parseInt(process.env.MAX_TICKETS_PER_PURCHASE || '10', 10),
    reservationTimeout: parseInt(process.env.RESERVATION_TIMEOUT || '600', 10),
    maxRetriesNFT: parseInt(process.env.MAX_NFT_RETRIES || '3', 10),
    maxConcurrentPurchases: parseInt(process.env.MAX_CONCURRENT_PURCHASES || '100', 10),
  },
  
  // ---------------------------------------------------------------------------
  // AWS Configuration
  // ---------------------------------------------------------------------------
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET,
    // SECURITY: AWS credentials should come from IAM roles, not env vars
    // But if using env vars, they're required
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  // ---------------------------------------------------------------------------
  // Timeouts and Resilience
  // ---------------------------------------------------------------------------
  serviceTimeout: parseInt(process.env.SERVICE_TIMEOUT || '30000', 10),
  
  // ---------------------------------------------------------------------------
  // Feature Flags
  // ---------------------------------------------------------------------------
  features: {
    useOrderService: process.env.USE_ORDER_SERVICE === 'true',
    enableBlockchainSync: process.env.ENABLE_BLOCKCHAIN_SYNC === 'true',
    enableMetrics: process.env.ENABLE_METRICS !== 'false', // Default true
    enableTracing: process.env.ENABLE_TRACING !== 'false', // Default true
  },
  
  // ---------------------------------------------------------------------------
  // Rate Limiting Configuration
  // ---------------------------------------------------------------------------
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    // Redis is REQUIRED for rate limiting in production (for distributed consistency)
    useRedis: isProduction || process.env.RATE_LIMIT_USE_REDIS === 'true',
  },
  
  // ---------------------------------------------------------------------------
  // Proxy & Network Configuration
  // SECURITY: Only trust known reverse proxies to prevent IP spoofing
  // ---------------------------------------------------------------------------
  proxy: {
    /**
     * SECURITY: List of trusted proxy IP addresses/CIDR ranges
     * Only these proxies will be trusted to set X-Forwarded-For headers.
     * 
     * In production, this should be your load balancer/reverse proxy IPs.
     * Using `true` trusts ALL proxies which is INSECURE.
     * 
     * Examples:
     * - ['10.0.0.0/8'] - Trust all private 10.x.x.x addresses
     * - ['172.17.0.1', '192.168.1.0/24'] - Specific IPs/ranges
     * - ['loopback'] - Trust localhost only
     */
    trustedProxies: (() => {
      const envValue = process.env.TRUSTED_PROXIES;
      if (envValue) {
        // Parse comma-separated list
        return envValue.split(',').map(p => p.trim()).filter(Boolean);
      }
      // Default: trust common internal network ranges in development
      // In production, this MUST be explicitly configured
      if (isProduction) {
        // Production: require explicit configuration
        console.warn('WARNING: TRUSTED_PROXIES not set in production. Defaulting to loopback only.');
        return ['loopback'];
      }
      // Development: trust Docker and Kubernetes internal networks
      return [
        'loopback',           // 127.0.0.0/8, ::1
        '10.0.0.0/8',         // Private class A
        '172.16.0.0/12',      // Private class B (includes Docker)
        '192.168.0.0/16',     // Private class C
      ];
    })(),
    
    /**
     * Maximum number of hops to trust when parsing X-Forwarded-For
     * Prevents attackers from adding spoofed entries
     */
    maxHops: parseInt(process.env.PROXY_MAX_HOPS || '2', 10),
  },
};

// =============================================================================
// STARTUP VALIDATION
// =============================================================================

// Validate critical configuration at startup
if (isProduction) {
  // Verify RabbitMQ TLS
  config.rabbitmq.validateTls();
  
  // Verify service URLs use HTTPS in production (warning only)
  Object.entries(config.services).forEach(([name, url]) => {
    if (url && !url.startsWith('https://') && !url.includes('localhost')) {
      console.warn(
        `WARNING: Service ${name} URL should use HTTPS in production: ${url}`
      );
    }
  });
  
  console.log('✓ Production configuration validated');
} else {
  console.log('⚠ Running in development mode - some security checks relaxed');
}
