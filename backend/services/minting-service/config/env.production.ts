/**
 * Production Environment Configuration
 * 
 * This file contains environment-specific settings for production.
 * Most values MUST be set via environment variables (secrets).
 * 
 * SECURITY NOTE: Never commit actual secrets to this file.
 */

import { EnvironmentConfig } from './env.types';
import fs from 'fs';

/**
 * Load TLS certificate from file or environment variable
 */
function loadCertificate(envVar: string, filePath?: string): string | undefined {
  // First try environment variable (for K8s secrets mounted as env vars)
  if (process.env[envVar]) {
    return process.env[envVar];
  }
  
  // Then try file path (for mounted secret files)
  if (filePath && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  
  return undefined;
}

const productionConfig: EnvironmentConfig = {
  // ==========================================================================
  // ENVIRONMENT
  // ==========================================================================
  env: 'production',
  debug: false,
  
  // ==========================================================================
  // SERVER
  // ==========================================================================
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: '0.0.0.0',
    trustProxy: true,  // Required when behind load balancer
  },
  
  // ==========================================================================
  // DATABASE
  // ==========================================================================
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME || 'minting',
    user: process.env.DATABASE_USER || 'minting_app',
    password: process.env.DATABASE_PASSWORD || '',  // REQUIRED
    ssl: {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
      ca: loadCertificate('DATABASE_SSL_CA', '/etc/ssl/certs/rds-ca.pem'),
    },
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '5', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    connectionTimeout: parseInt(process.env.DATABASE_CONN_TIMEOUT || '5000', 10),
    idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '10000', 10),
  },
  
  // ==========================================================================
  // REDIS WITH TLS SUPPORT (Issue #21)
  // ==========================================================================
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,  // REQUIRED for production
    
    // TLS Configuration for Redis (e.g., AWS ElastiCache with encryption)
    tls: process.env.REDIS_TLS_ENABLED === 'true' ? {
      // Reject unauthorized certificates in production
      rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
      
      // CA certificate (for self-signed or custom CA)
      ca: loadCertificate('REDIS_TLS_CA', '/etc/ssl/certs/redis-ca.pem'),
      
      // Client certificate (for mutual TLS)
      cert: loadCertificate('REDIS_TLS_CERT', '/etc/ssl/certs/redis-client.crt'),
      
      // Client key (for mutual TLS)
      key: loadCertificate('REDIS_TLS_KEY', '/etc/ssl/private/redis-client.key'),
    } : false,
    
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'minting:prod:',
    
    // Redis Sentinel configuration (for HA)
    sentinels: process.env.REDIS_SENTINELS 
      ? JSON.parse(process.env.REDIS_SENTINELS)
      : undefined,
    sentinelName: process.env.REDIS_SENTINEL_NAME,
  },
  
  // ==========================================================================
  // SOLANA
  // ==========================================================================
  solana: {
    cluster: 'mainnet-beta',
    rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
    rpcEndpointFallback: process.env.SOLANA_RPC_FALLBACK,
    commitment: 'confirmed',
    skipPreflight: false,
    maxRetries: parseInt(process.env.SOLANA_MAX_RETRIES || '5', 10),
  },
  
  // ==========================================================================
  // IPFS
  // ==========================================================================
  ipfs: {
    provider: 'pinata',
    gatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud',
    pinataApiKey: process.env.PINATA_API_KEY || '',  // REQUIRED
    pinataSecretKey: process.env.PINATA_SECRET_KEY || '',  // REQUIRED
    nftStorageApiKey: process.env.NFT_STORAGE_API_KEY || '',  // For failover
    timeout: parseInt(process.env.IPFS_TIMEOUT || '60000', 10),
  },
  
  // ==========================================================================
  // QUEUE
  // ==========================================================================
  queue: {
    concurrency: parseInt(process.env.MINT_CONCURRENCY || '5', 10),
    maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '10000', 10),
    highWaterMark: parseInt(process.env.QUEUE_HIGH_WATER_MARK || '5000', 10),
    staleJobCheckInterval: parseInt(process.env.STALE_JOB_CHECK_INTERVAL_MS || '60000', 10),
    staleActiveThreshold: parseInt(process.env.STALE_ACTIVE_JOB_THRESHOLD_MS || '600000', 10),
    staleWaitingThreshold: parseInt(process.env.STALE_WAITING_JOB_THRESHOLD_MS || '1800000', 10),
  },
  
  // ==========================================================================
  // RATE LIMITING
  // ==========================================================================
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    skipFailedRequests: false,  // Count failed requests in production
  },
  
  // ==========================================================================
  // LOGGING
  // ==========================================================================
  logging: {
    level: (process.env.LOG_LEVEL as 'info' | 'warn' | 'error') || 'info',
    format: 'json',  // Always JSON in production for log aggregation
    includeTimestamp: true,
    redactSecrets: true,  // Always redact secrets
  },
  
  // ==========================================================================
  // FEATURES
  // ==========================================================================
  features: {
    enableBullBoard: process.env.ENABLE_BULL_BOARD === 'true',  // Default off
    enableMetrics: true,  // Always enable metrics
    enableHealthDetail: false,  // Require auth for detailed health
    enableLoadShedding: true,  // Always enable load shedding
  },
};

export default productionConfig;

/**
 * Environment Variables Reference for Production:
 * 
 * Required:
 * - DATABASE_PASSWORD: PostgreSQL password
 * - REDIS_PASSWORD: Redis password
 * - PINATA_API_KEY: Pinata API key
 * - PINATA_SECRET_KEY: Pinata secret key
 * - MINTING_WALLET_PRIVATE_KEY: Solana wallet private key
 * 
 * Optional (with defaults):
 * - PORT: Server port (3000)
 * - DATABASE_HOST: PostgreSQL host
 * - DATABASE_PORT: PostgreSQL port (5432)
 * - DATABASE_NAME: Database name (minting)
 * - DATABASE_USER: Database user (minting_app)
 * - DATABASE_POOL_MIN: Min pool size (5)
 * - DATABASE_POOL_MAX: Max pool size (20)
 * - REDIS_HOST: Redis host (localhost)
 * - REDIS_PORT: Redis port (6379)
 * - REDIS_TLS_ENABLED: Enable TLS (false)
 * - SOLANA_RPC_ENDPOINT: RPC URL
 * - SOLANA_RPC_FALLBACK: Fallback RPC URL
 * - LOG_LEVEL: Logging level (info)
 * 
 * TLS Certificates (if REDIS_TLS_ENABLED=true):
 * - REDIS_TLS_CA: CA certificate content
 * - REDIS_TLS_CERT: Client certificate content
 * - REDIS_TLS_KEY: Client private key content
 * - Or mount files at /etc/ssl/certs/redis-*
 */
