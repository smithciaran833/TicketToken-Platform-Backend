/// <reference types="node" />
import { PoolConfig } from 'pg';

/**
 * BLOCKCHAIN SERVICE CONFIGURATION
 * 
 * SECURITY: No fallback to public RPCs in production
 * AUDIT FIX #85: Remove public RPC fallback
 * AUDIT FIX #27: Use HTTPS for internal service URLs
 */

interface SolanaConfig {
  rpcUrl: string;
  rpcFallbackUrls: string[];
  wsUrl?: string;
  commitment: 'processed' | 'confirmed' | 'finalized';
  network: 'devnet' | 'testnet' | 'mainnet-beta';
  programId?: string;
  // Priority fees
  minPriorityFee: number;
  maxPriorityFee: number;
  defaultPriorityFee: number;
  // Bundlr/Irys configuration
  bundlrAddress: string;
  bundlrProviderUrl: string;
  bundlrTimeout: number;
}

interface Config {
  solana: SolanaConfig;
  database: PoolConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    tls?: boolean;
  };
  service: {
    name: string;
    port: number;
    env: string;
  };
}

// Validate required config in production
function validateConfig(): void {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    if (!process.env.SOLANA_RPC_URL) {
      throw new Error('CRITICAL: SOLANA_RPC_URL is required in production. Do not use public RPCs!');
    }
    
    if (process.env.SOLANA_RPC_URL.includes('api.devnet.solana.com') ||
        process.env.SOLANA_RPC_URL.includes('api.testnet.solana.com') ||
        process.env.SOLANA_RPC_URL.includes('api.mainnet-beta.solana.com')) {
      throw new Error('CRITICAL: Public Solana RPCs are not allowed in production. Use a paid RPC provider (Helius, QuickNode, Triton, etc.)');
    }

    if (!process.env.TREASURY_WALLET_KEY && !process.env.AWS_KMS_KEY_ID) {
      throw new Error('CRITICAL: Treasury wallet key must be configured (TREASURY_WALLET_KEY or AWS_KMS_KEY_ID)');
    }
  }
}

// Parse RPC fallback URLs from comma-separated list
function parseRpcFallbackUrls(): string[] {
  const fallbackUrls = process.env.SOLANA_RPC_FALLBACK_URLS;
  if (!fallbackUrls) return [];
  
  return fallbackUrls
    .split(',')
    .map(url => url.trim())
    .filter(url => url.length > 0);
}

// Validate and run
validateConfig();

const config: Config = {
  solana: {
    // SECURITY: Require RPC URL in production, allow devnet only in development
    rpcUrl: process.env.SOLANA_RPC_URL || (
      process.env.NODE_ENV === 'development' 
        ? 'https://api.devnet.solana.com' 
        : (() => { throw new Error('SOLANA_RPC_URL is required'); })()
    ),
    rpcFallbackUrls: parseRpcFallbackUrls(),
    wsUrl: process.env.SOLANA_WS_URL,
    commitment: (process.env.SOLANA_COMMITMENT as 'processed' | 'confirmed' | 'finalized') || 'confirmed',
    network: (process.env.SOLANA_NETWORK as 'devnet' | 'testnet' | 'mainnet-beta') || 'devnet',
    programId: process.env.SOLANA_PROGRAM_ID,
    
    // Priority fees (in microlamports)
    // AUDIT FIX #82: Dynamic priority fees
    minPriorityFee: parseInt(process.env.SOLANA_MIN_PRIORITY_FEE || '1000', 10),
    maxPriorityFee: parseInt(process.env.SOLANA_MAX_PRIORITY_FEE || '1000000', 10),
    defaultPriorityFee: parseInt(process.env.SOLANA_DEFAULT_PRIORITY_FEE || '50000', 10),
    
    // Bundlr/Irys configuration for metadata storage
    // AUDIT FIX #81: Re-enable Bundlr/Irys
    bundlrAddress: process.env.BUNDLR_ADDRESS || 'https://devnet.bundlr.network',
    bundlrProviderUrl: process.env.BUNDLR_PROVIDER_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    bundlrTimeout: parseInt(process.env.BUNDLR_TIMEOUT || '60000', 10),
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
    // SSL should be enabled in production
    ssl: process.env.NODE_ENV === 'production' 
      ? { rejectUnauthorized: true }
      : (process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined)
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    tls: process.env.REDIS_TLS === 'true' || process.env.NODE_ENV === 'production'
  },
  service: {
    name: process.env.SERVICE_NAME || 'blockchain-service',
    port: parseInt(process.env.PORT || '3015'),
    env: process.env.NODE_ENV || 'development'
  }
};

export default config;
