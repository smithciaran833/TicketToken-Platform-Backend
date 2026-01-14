/**
 * Redis Configuration with TLS Support
 * 
 * AUDIT FIX #73: Add Redis TLS configuration
 * 
 * Features:
 * - TLS enabled by default in production
 * - Support for rediss:// URL scheme
 * - Connection error handling with retry
 * - Centralized config for all Redis clients (queue, cache, locks)
 */

import { logger } from '../utils/logger';

// TLS Options type
interface TlsOptions {
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

// Redis connection options
interface RedisOptions {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls?: TlsOptions;
  maxRetriesPerRequest: number | null;
  enableReadyCheck: boolean;
  retryStrategy: (times: number) => number | void;
  reconnectOnError: (err: Error) => boolean;
  lazyConnect?: boolean;
  keepAlive?: number;
  connectTimeout?: number;
  commandTimeout?: number;
}

// Full Redis configuration
interface RedisConfig {
  options: RedisOptions;
  url: string;
  tlsEnabled: boolean;
}

/**
 * Determine if TLS should be enabled
 * - Explicit REDIS_TLS env var takes precedence
 * - Otherwise, enabled in production by default
 * - URL scheme rediss:// also enables TLS
 */
function shouldEnableTls(): boolean {
  const explicitTls = process.env.REDIS_TLS;
  if (explicitTls !== undefined) {
    return explicitTls === 'true' || explicitTls === '1';
  }
  
  // Check if URL uses rediss:// scheme
  const redisUrl = process.env.REDIS_URL || '';
  if (redisUrl.startsWith('rediss://')) {
    return true;
  }
  
  // Default: TLS in production
  return process.env.NODE_ENV === 'production';
}

/**
 * Build TLS options for Redis connection
 * AUDIT FIX #73: TLS configuration
 */
function buildTlsOptions(): TlsOptions | undefined {
  if (!shouldEnableTls()) {
    return undefined;
  }

  const tlsOptions: TlsOptions = {
    // Reject unauthorized certificates in production
    // Set to false only for self-signed certs in development
    rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
  };

  // Optional: Custom CA certificate for self-signed or private CA
  if (process.env.REDIS_TLS_CA) {
    tlsOptions.ca = process.env.REDIS_TLS_CA;
  }

  // Optional: Client certificate authentication (mTLS)
  if (process.env.REDIS_TLS_CERT) {
    tlsOptions.cert = process.env.REDIS_TLS_CERT;
  }
  if (process.env.REDIS_TLS_KEY) {
    tlsOptions.key = process.env.REDIS_TLS_KEY;
  }

  return tlsOptions;
}

/**
 * Parse Redis URL if provided, otherwise build from components
 */
function parseRedisConnection(): { host: string; port: number; password?: string; db: number } {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    try {
      // Support both redis:// and rediss:// schemes
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port, 10) || 6379,
        password: url.password || undefined,
        db: parseInt(url.pathname.slice(1), 10) || 0
      };
    } catch (error) {
      logger.warn('Failed to parse REDIS_URL, using component values', { 
        error: (error as Error).message 
      });
    }
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  };
}

/**
 * Retry strategy with exponential backoff
 */
function retryStrategy(times: number): number | void {
  const maxRetries = parseInt(process.env.REDIS_MAX_RETRIES || '10', 10);
  
  if (times > maxRetries) {
    logger.error('Redis max retries exceeded', { 
      times, 
      maxRetries,
      hint: 'Check Redis server availability and TLS configuration'
    });
    return undefined; // Stop retrying
  }

  // Exponential backoff: 100ms, 200ms, 400ms, 800ms... max 30s
  const delay = Math.min(Math.pow(2, times) * 100, 30000);
  
  logger.warn('Redis connection retry', { 
    attempt: times, 
    delayMs: delay,
    maxRetries
  });
  
  return delay;
}

/**
 * Determine which errors should trigger reconnection
 */
function reconnectOnError(err: Error): boolean {
  const targetErrors = [
    'READONLY',      // Failover in progress
    'ECONNRESET',    // Connection reset
    'ETIMEDOUT',     // Connection timeout
    'ENOTFOUND',     // DNS resolution failed
    'ECONNREFUSED',  // Connection refused
    'EPIPE',         // Broken pipe
    'CERT_',         // TLS certificate errors (will retry with backoff)
    'SSL',           // SSL/TLS errors
  ];

  const shouldReconnect = targetErrors.some(e => 
    err.message.includes(e) || err.name.includes(e)
  );

  if (shouldReconnect) {
    logger.warn('Redis reconnect triggered', { 
      error: err.message,
      name: err.name
    });
  }

  return shouldReconnect;
}

/**
 * Build the Redis URL for logging (password masked)
 */
function buildRedisUrl(connection: ReturnType<typeof parseRedisConnection>, tlsEnabled: boolean): string {
  const scheme = tlsEnabled ? 'rediss' : 'redis';
  const auth = connection.password ? ':****@' : '';
  return `${scheme}://${auth}${connection.host}:${connection.port}/${connection.db}`;
}

/**
 * Main Redis configuration
 */
function buildRedisConfig(): RedisConfig {
  const connection = parseRedisConnection();
  const tlsOptions = buildTlsOptions();
  const tlsEnabled = !!tlsOptions;

  const options: RedisOptions = {
    host: connection.host,
    port: connection.port,
    password: connection.password,
    db: connection.db,
    
    // AUDIT FIX #73: TLS configuration
    tls: tlsOptions,
    
    // Retry configuration
    maxRetriesPerRequest: null, // Infinite retries for queue operations
    enableReadyCheck: true,
    retryStrategy,
    reconnectOnError,
    
    // Connection settings
    lazyConnect: false,
    keepAlive: 30000, // 30 seconds
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10)
  };

  const url = buildRedisUrl(connection, tlsEnabled);

  // Log configuration (without sensitive data)
  logger.info('Redis configuration initialized', {
    host: connection.host,
    port: connection.port,
    db: connection.db,
    tlsEnabled,
    tlsRejectUnauthorized: tlsOptions?.rejectUnauthorized,
    hasPassword: !!connection.password,
    url
  });

  return {
    options,
    url,
    tlsEnabled
  };
}

// Export the built configuration
export const redisConfig = buildRedisConfig();

/**
 * Get Redis options for IORedis client
 */
export function getRedisOptions(): RedisOptions {
  return { ...redisConfig.options };
}

/**
 * Get Redis options for BullMQ
 * BullMQ uses a slightly different format
 */
export function getBullMQRedisOptions(): {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: TlsOptions;
  maxRetriesPerRequest: number | null;
} {
  return {
    host: redisConfig.options.host,
    port: redisConfig.options.port,
    password: redisConfig.options.password,
    db: redisConfig.options.db,
    tls: redisConfig.options.tls,
    maxRetriesPerRequest: null
  };
}

/**
 * Get Redis URL for clients that support URL connections
 */
export function getRedisUrl(): string {
  return redisConfig.url;
}

/**
 * Check if TLS is enabled
 */
export function isTlsEnabled(): boolean {
  return redisConfig.tlsEnabled;
}

/**
 * Handle Redis client errors (attach to client)
 */
export function attachErrorHandlers(client: any, clientName: string = 'default'): void {
  client.on('error', (err: Error) => {
    logger.error(`Redis client error [${clientName}]`, {
      error: err.message,
      name: err.name,
      stack: err.stack
    });

    // Special handling for TLS errors
    if (err.message.includes('TLS') || 
        err.message.includes('SSL') || 
        err.message.includes('CERT')) {
      logger.error(`TLS handshake failed for Redis [${clientName}]`, {
        hint: 'Check REDIS_TLS_CA, REDIS_TLS_CERT, REDIS_TLS_KEY environment variables',
        rejectUnauthorized: redisConfig.options.tls?.rejectUnauthorized
      });
    }
  });

  client.on('connect', () => {
    logger.info(`Redis client connected [${clientName}]`, {
      host: redisConfig.options.host,
      port: redisConfig.options.port,
      tlsEnabled: redisConfig.tlsEnabled
    });
  });

  client.on('ready', () => {
    logger.info(`Redis client ready [${clientName}]`);
  });

  client.on('reconnecting', () => {
    logger.warn(`Redis client reconnecting [${clientName}]`);
  });

  client.on('close', () => {
    logger.info(`Redis client connection closed [${clientName}]`);
  });

  client.on('end', () => {
    logger.info(`Redis client connection ended [${clientName}]`);
  });
}

export default {
  redisConfig,
  getRedisOptions,
  getBullMQRedisOptions,
  getRedisUrl,
  isTlsEnabled,
  attachErrorHandlers
};
