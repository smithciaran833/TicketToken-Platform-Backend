/**
 * Environment Configuration Types
 * 
 * Shared types for environment-specific configuration files.
 */

export interface ServerConfig {
  port: number;
  host: string;
  trustProxy: boolean;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean | { rejectUnauthorized: boolean; ca?: string };
  poolMin: number;
  poolMax: number;
  connectionTimeout: number;
  idleTimeout: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string | undefined;
  tls: boolean | {
    rejectUnauthorized: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  db: number;
  keyPrefix: string;
  sentinels?: Array<{ host: string; port: number }>;
  sentinelName?: string;
}

export interface SolanaConfig {
  cluster: 'devnet' | 'testnet' | 'mainnet-beta';
  rpcEndpoint: string;
  rpcEndpointFallback?: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
  skipPreflight: boolean;
  maxRetries: number;
}

export interface IPFSConfig {
  provider: 'pinata' | 'nft.storage';
  gatewayUrl: string;
  pinataApiKey: string;
  pinataSecretKey: string;
  nftStorageApiKey: string;
  timeout: number;
}

export interface QueueConfig {
  concurrency: number;
  maxQueueSize: number;
  highWaterMark: number;
  staleJobCheckInterval: number;
  staleActiveThreshold: number;
  staleWaitingThreshold: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipFailedRequests: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'pretty';
  includeTimestamp: boolean;
  redactSecrets: boolean;
}

export interface FeatureFlags {
  enableBullBoard: boolean;
  enableMetrics: boolean;
  enableHealthDetail: boolean;
  enableLoadShedding: boolean;
}

export interface EnvironmentConfig {
  env: 'development' | 'staging' | 'production';
  debug: boolean;
  server: ServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  solana: SolanaConfig;
  ipfs: IPFSConfig;
  queue: QueueConfig;
  rateLimit: RateLimitConfig;
  logging: LoggingConfig;
  features: FeatureFlags;
}

/**
 * Get the current environment name
 */
export function getEnvironment(): 'development' | 'staging' | 'production' {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'staging') return 'staging';
  if (env === 'production') return 'production';
  return 'development';
}
