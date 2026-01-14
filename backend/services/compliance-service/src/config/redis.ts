/**
 * Redis Configuration for Compliance Service
 * 
 * AUDIT FIXES:
 * - GD-H1: Reconnection with jitter
 * - GD-H2: maxRetriesPerRequest set to prevent blocking
 * - CFG-H4: Redis TLS support in production
 */
import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';
import { incrementMetric } from '../utils/metrics';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface RedisConfig {
  url: string;
  keyPrefix: string;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
  enableOfflineQueue: boolean;
  connectTimeout: number;
  commandTimeout: number;
  retryStrategy: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitter: boolean;
  };
  tls: {
    enabled: boolean;
    rejectUnauthorized: boolean;
  };
}

const DEFAULT_CONFIG: RedisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  keyPrefix: 'compliance:',
  maxRetriesPerRequest: 3, // GD-H2: Prevent indefinite blocking
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000, // 10 seconds
  commandTimeout: 5000, // 5 seconds
  retryStrategy: {
    maxRetries: 10,
    baseDelayMs: 100,
    maxDelayMs: 30000,
    jitter: true // GD-H1: Enable jitter
  },
  tls: {
    enabled: process.env.REDIS_TLS_ENABLED === 'true',
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  }
};

// =============================================================================
// JITTER CALCULATION (GD-H1)
// =============================================================================

/**
 * Calculate delay with exponential backoff and jitter
 * Uses "full jitter" strategy for better distribution
 */
function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  useJitter: boolean
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  
  if (!useJitter) {
    return exponentialDelay;
  }
  
  // Full jitter: random value between 0 and exponentialDelay
  return Math.floor(Math.random() * exponentialDelay);
}

// =============================================================================
// REDIS CLIENT FACTORY
// =============================================================================

let redisClient: Redis | null = null;
let retryCount = 0;

/**
 * Create Redis client with proper configuration
 */
export function createRedisClient(customConfig?: Partial<RedisConfig>): Redis {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  
  // Parse URL for TLS and host info
  const parsedUrl = new URL(config.url);
  
  const options: RedisOptions = {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port) || 6379,
    password: parsedUrl.password || undefined,
    db: parseInt(parsedUrl.pathname?.slice(1) || '0'),
    keyPrefix: config.keyPrefix,
    maxRetriesPerRequest: config.maxRetriesPerRequest, // GD-H2
    enableReadyCheck: config.enableReadyCheck,
    enableOfflineQueue: config.enableOfflineQueue,
    connectTimeout: config.connectTimeout,
    commandTimeout: config.commandTimeout,
    
    // GD-H1: Retry strategy with jitter
    retryStrategy: (times: number): number | null => {
      retryCount = times;
      
      if (times > config.retryStrategy.maxRetries) {
        logger.error({
          attempt: times,
          maxRetries: config.retryStrategy.maxRetries
        }, 'Redis max retries exceeded, giving up');
        incrementMetric('redis_connection_failures_total');
        return null; // Stop retrying
      }
      
      const delay = calculateRetryDelay(
        times,
        config.retryStrategy.baseDelayMs,
        config.retryStrategy.maxDelayMs,
        config.retryStrategy.jitter
      );
      
      logger.warn({
        attempt: times,
        delayMs: delay,
        jitter: config.retryStrategy.jitter
      }, 'Redis reconnection attempt');
      
      incrementMetric('redis_reconnection_attempts_total');
      
      return delay;
    },
    
    // CFG-H4: TLS configuration for production
    ...(config.tls.enabled && {
      tls: {
        rejectUnauthorized: config.tls.rejectUnauthorized
      }
    })
  };
  
  const client = new Redis(options);
  
  // Event handlers
  client.on('connect', () => {
    logger.info('Redis connected');
    incrementMetric('redis_connections_total');
    retryCount = 0;
  });
  
  client.on('ready', () => {
    logger.info('Redis ready');
  });
  
  client.on('error', (error) => {
    logger.error({ error: error.message }, 'Redis error');
    incrementMetric('redis_errors_total');
  });
  
  client.on('close', () => {
    logger.warn('Redis connection closed');
  });
  
  client.on('reconnecting', (delay: number) => {
    logger.info({ delayMs: delay }, 'Redis reconnecting');
  });
  
  client.on('end', () => {
    logger.info('Redis connection ended');
  });
  
  return client;
}

/**
 * Get or create Redis client singleton
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    logger.info('Closing Redis connection');
    await redisClient.quit();
    redisClient = null;
  }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  info: {
    version?: string;
    usedMemory?: string;
    connectedClients?: number;
  };
}> {
  const client = getRedisClient();
  const start = Date.now();
  
  try {
    const pong = await client.ping();
    const latencyMs = Date.now() - start;
    
    if (pong !== 'PONG') {
      return { connected: false, latencyMs, info: {} };
    }
    
    // Get additional info
    const info = await client.info('server');
    const memory = await client.info('memory');
    const clients = await client.info('clients');
    
    const versionMatch = info.match(/redis_version:(\S+)/);
    const memoryMatch = memory.match(/used_memory_human:(\S+)/);
    const clientsMatch = clients.match(/connected_clients:(\d+)/);
    
    return {
      connected: true,
      latencyMs,
      info: {
        version: versionMatch?.[1],
        usedMemory: memoryMatch?.[1],
        connectedClients: clientsMatch ? parseInt(clientsMatch[1]) : undefined
      }
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      info: {}
    };
  }
}

// =============================================================================
// CACHE HELPERS WITH TENANT PREFIX
// =============================================================================

/**
 * Get key with tenant prefix
 */
export function getTenantKey(tenantId: string, key: string): string {
  return `tenant:${tenantId}:${key}`;
}

/**
 * Set value with tenant isolation
 */
export async function setWithTenant(
  tenantId: string,
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<void> {
  const client = getRedisClient();
  const fullKey = getTenantKey(tenantId, key);
  
  if (ttlSeconds) {
    await client.setex(fullKey, ttlSeconds, value);
  } else {
    await client.set(fullKey, value);
  }
}

/**
 * Get value with tenant isolation
 */
export async function getWithTenant(
  tenantId: string,
  key: string
): Promise<string | null> {
  const client = getRedisClient();
  const fullKey = getTenantKey(tenantId, key);
  return await client.get(fullKey);
}

/**
 * Delete value with tenant isolation
 */
export async function deleteWithTenant(
  tenantId: string,
  key: string
): Promise<number> {
  const client = getRedisClient();
  const fullKey = getTenantKey(tenantId, key);
  return await client.del(fullKey);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { Redis };

export default {
  createRedisClient,
  getRedisClient,
  closeRedisConnection,
  checkRedisHealth,
  getTenantKey,
  setWithTenant,
  getWithTenant,
  deleteWithTenant
};
