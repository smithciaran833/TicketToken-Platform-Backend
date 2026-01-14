/**
 * Development Environment Configuration
 * 
 * This file contains environment-specific settings for development.
 * Values here are defaults that can be overridden by environment variables.
 */

import { EnvironmentConfig } from './env.types';

const developmentConfig: EnvironmentConfig = {
  // ==========================================================================
  // ENVIRONMENT
  // ==========================================================================
  env: 'development',
  debug: true,
  
  // ==========================================================================
  // SERVER
  // ==========================================================================
  server: {
    port: 3000,
    host: '0.0.0.0',
    trustProxy: false,
  },
  
  // ==========================================================================
  // DATABASE
  // ==========================================================================
  database: {
    host: 'localhost',
    port: 5432,
    name: 'minting_dev',
    user: 'postgres',
    password: 'postgres',  // OK for development only
    ssl: false,
    poolMin: 2,
    poolMax: 10,
    connectionTimeout: 10000,
    idleTimeout: 30000,
  },
  
  // ==========================================================================
  // REDIS
  // ==========================================================================
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,  // No password in development
    tls: false,
    db: 0,
    keyPrefix: 'minting:dev:',
  },
  
  // ==========================================================================
  // SOLANA
  // ==========================================================================
  solana: {
    cluster: 'devnet',
    rpcEndpoint: 'https://api.devnet.solana.com',
    rpcEndpointFallback: 'https://devnet.helius-rpc.com',
    commitment: 'confirmed',
    skipPreflight: false,
    maxRetries: 3,
  },
  
  // ==========================================================================
  // IPFS
  // ==========================================================================
  ipfs: {
    provider: 'pinata',
    gatewayUrl: 'https://gateway.pinata.cloud',
    pinataApiKey: '',  // Set via PINATA_API_KEY
    pinataSecretKey: '',  // Set via PINATA_SECRET_KEY
    nftStorageApiKey: '',  // Set via NFT_STORAGE_API_KEY
    timeout: 30000,
  },
  
  // ==========================================================================
  // QUEUE
  // ==========================================================================
  queue: {
    concurrency: 2,  // Lower for development
    maxQueueSize: 1000,
    highWaterMark: 500,
    staleJobCheckInterval: 60000,
    staleActiveThreshold: 600000,
    staleWaitingThreshold: 1800000,
  },
  
  // ==========================================================================
  // RATE LIMITING
  // ==========================================================================
  rateLimit: {
    windowMs: 60000,
    maxRequests: 1000,  // Higher for development
    skipFailedRequests: true,
  },
  
  // ==========================================================================
  // LOGGING
  // ==========================================================================
  logging: {
    level: 'debug',
    format: 'pretty',  // Human-readable in development
    includeTimestamp: true,
    redactSecrets: true,
  },
  
  // ==========================================================================
  // FEATURES
  // ==========================================================================
  features: {
    enableBullBoard: true,  // Enable in development
    enableMetrics: true,
    enableHealthDetail: true,  // No auth required in dev
    enableLoadShedding: false,  // Disabled in development
  },
};

export default developmentConfig;
