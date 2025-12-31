import type Redis from 'ioredis';
import type { AwilixContainer } from 'awilix';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'RedisConfig' });

let redis: Redis;
let redisPub: Redis;
let redisSub: Redis;
let initialized = false;

/**
 * SECURITY FIX (RI1-RI3): Enhanced Redis configuration with HA, pooling, and timeout
 */
export interface RedisConfig {
  // Connection settings
  host: string;
  port: number;
  password?: string;
  db?: number;
  
  // SECURITY FIX (RI3): Timeout configuration
  connectTimeout: number;
  commandTimeout: number;
  
  // SECURITY FIX (RI1): Sentinel configuration for HA
  sentinels?: Array<{ host: string; port: number }>;
  sentinelName?: string;
  
  // SECURITY FIX (RI2): Connection pool settings
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  enableReadyCheck: boolean;
  enableOfflineQueue: boolean;
  
  // TLS configuration
  tls?: {
    rejectUnauthorized: boolean;
  };
}

/**
 * Get Redis configuration from environment with sensible defaults
 */
function getRedisConfig(): RedisConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Parse sentinels from environment (format: "host1:port1,host2:port2")
  const sentinelsEnv = process.env.REDIS_SENTINELS;
  const sentinels = sentinelsEnv
    ? sentinelsEnv.split(',').map(s => {
        const [host, port] = s.trim().split(':');
        return { host, port: parseInt(port, 10) || 26379 };
      })
    : undefined;
  
  return {
    // Connection settings
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    
    // SECURITY FIX (RI3): Timeout configuration
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
    
    // SECURITY FIX (RI1): Sentinel configuration for HA
    sentinels,
    sentinelName: process.env.REDIS_SENTINEL_NAME || 'mymaster',
    
    // SECURITY FIX (RI2): Connection pool / retry settings
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
    enableReadyCheck: true,
    enableOfflineQueue: true,
    
    // TLS configuration for production
    tls: isProduction && process.env.REDIS_TLS_ENABLED === 'true'
      ? { rejectUnauthorized: true }
      : undefined,
  };
}

/**
 * SECURITY FIX (RI1-RI3): Create Redis client with enhanced configuration
 */
function createRedisClient(config: RedisConfig): Redis {
  const clientConfig: any = {
    // Connection settings
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
    
    // SECURITY FIX (RI3): Timeout settings
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    
    // SECURITY FIX (RI2): Retry strategy with exponential backoff
    maxRetriesPerRequest: config.maxRetriesPerRequest,
    retryStrategy: (times: number) => {
      if (times > 10) {
        log.error({ retryCount: times }, 'Redis max retries exceeded');
        return null; // Stop retrying
      }
      const delay = Math.min(times * config.retryDelayOnFailover, 3000);
      log.warn({ retryCount: times, delay }, 'Redis connection retry');
      return delay;
    },
    
    // Connection pool settings
    enableReadyCheck: config.enableReadyCheck,
    enableOfflineQueue: config.enableOfflineQueue,
    lazyConnect: false,
    
    // TLS if configured
    tls: config.tls,
  };
  
  // SECURITY FIX (RI1): Use Sentinel for HA if configured
  if (config.sentinels && config.sentinels.length > 0) {
    log.info({ sentinels: config.sentinels, name: config.sentinelName }, 'Configuring Redis Sentinel for HA');
    return new IORedis({
      sentinels: config.sentinels,
      name: config.sentinelName,
      password: config.password,
      db: config.db,
      connectTimeout: config.connectTimeout,
      commandTimeout: config.commandTimeout,
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      retryStrategy: clientConfig.retryStrategy,
      enableReadyCheck: config.enableReadyCheck,
      enableOfflineQueue: config.enableOfflineQueue,
      sentinelRetryStrategy: (times: number) => {
        if (times > 5) {
          log.error({ retryCount: times }, 'Redis Sentinel max retries exceeded');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    }) as Redis;
  }
  
  return new IORedis(clientConfig) as Redis;
}

/**
 * Attach event handlers to Redis client for monitoring
 */
function attachEventHandlers(client: Redis, name: string): void {
  client.on('connect', () => {
    log.info({ client: name }, 'Redis client connected');
  });
  
  client.on('ready', () => {
    log.info({ client: name }, 'Redis client ready');
  });
  
  client.on('error', (error) => {
    log.error({ client: name, error: error.message }, 'Redis client error');
  });
  
  client.on('close', () => {
    log.warn({ client: name }, 'Redis client connection closed');
  });
  
  client.on('reconnecting', (delay: number) => {
    log.info({ client: name, delay }, 'Redis client reconnecting');
  });
  
  client.on('end', () => {
    log.info({ client: name }, 'Redis client connection ended');
  });
}

/**
 * Initialize Redis clients with enhanced configuration
 */
export async function initRedis(): Promise<void> {
  if (initialized) return;
  
  const config = getRedisConfig();
  
  log.info({
    host: config.host,
    port: config.port,
    hasSentinels: !!config.sentinels,
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    maxRetries: config.maxRetriesPerRequest,
    tlsEnabled: !!config.tls,
  }, 'Initializing Redis with enhanced configuration (RI1-RI3)');
  
  // Create main client
  redis = createRedisClient(config);
  attachEventHandlers(redis, 'main');
  
  // Create pub/sub clients (separate connections required for pub/sub)
  redisPub = createRedisClient(config);
  attachEventHandlers(redisPub, 'pub');
  
  redisSub = createRedisClient(config);
  attachEventHandlers(redisSub, 'sub');
  
  // Wait for all clients to be ready with timeout
  const readyTimeout = config.connectTimeout;
  const waitForReady = (client: Redis, name: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis ${name} client connection timeout after ${readyTimeout}ms`));
      }, readyTimeout);
      
      if (client.status === 'ready') {
        clearTimeout(timeout);
        resolve();
        return;
      }
      
      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  };
  
  try {
    await Promise.all([
      waitForReady(redis, 'main'),
      waitForReady(redisPub, 'pub'),
      waitForReady(redisSub, 'sub'),
    ]);
    
    initialized = true;
    log.info('All Redis clients initialized successfully');
  } catch (error: any) {
    log.error({ error: error.message }, 'Failed to initialize Redis clients');
    throw error;
  }
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized. Call initRedis() first.');
  return redis;
}

export function getPub(): Redis {
  if (!redisPub) throw new Error('Redis pub not initialized. Call initRedis() first.');
  return redisPub;
}

export function getSub(): Redis {
  if (!redisSub) throw new Error('Redis sub not initialized. Call initRedis() first.');
  return redisSub;
}

/**
 * Health check for Redis connectivity
 */
export async function checkRedisHealth(): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> {
  if (!redis) {
    return { healthy: false, error: 'Redis not initialized' };
  }
  
  const start = Date.now();
  try {
    await redis.ping();
    const latencyMs = Date.now() - start;
    return { healthy: true, latencyMs };
  } catch (error: any) {
    return { healthy: false, error: error.message };
  }
}

/**
 * Graceful shutdown of Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  log.info('Closing Redis connections...');
  
  const closePromises: Promise<void>[] = [];
  
  if (redis) {
    closePromises.push(
      redis.quit().then(() => log.info('Main Redis client disconnected')).catch(err => {
        log.error({ error: err.message }, 'Error closing main Redis client');
      })
    );
  }
  
  if (redisPub) {
    closePromises.push(
      redisPub.quit().then(() => log.info('Pub Redis client disconnected')).catch(err => {
        log.error({ error: err.message }, 'Error closing pub Redis client');
      })
    );
  }
  
  if (redisSub) {
    closePromises.push(
      redisSub.quit().then(() => log.info('Sub Redis client disconnected')).catch(err => {
        log.error({ error: err.message }, 'Error closing sub Redis client');
      })
    );
  }
  
  await Promise.all(closePromises);
  initialized = false;
  log.info('All Redis connections closed');
}

/**
 * Fastify type augmentation
 */
declare module 'fastify' {
  interface FastifyInstance {
    container: AwilixContainer;
  }
  interface FastifyRequest {
    startTime?: number;
  }
}
