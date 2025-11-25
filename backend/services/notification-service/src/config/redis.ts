import Redis, { RedisOptions } from 'ioredis';
import { logger } from './logger';
import { metricsService } from '../services/metrics.service';

/**
 * Redis connection configuration with pooling
 */
const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  
  // Connection pool settings
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  
  // Connection timeout
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
  
  // Command timeout
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
  
  // Keep connection alive
  keepAlive: 30000,
  
  // Retry strategy with exponential backoff
  retryStrategy: (times: number) => {
    const maxRetryTime = parseInt(process.env.REDIS_MAX_RETRY_TIME || '60000');
    const delay = Math.min(times * 50, maxRetryTime);
    
    logger.warn(`Redis retry attempt ${times}, delay: ${delay}ms`);
    
    // Stop retrying after 20 attempts
    if (times > 20) {
      logger.error('Redis max retry attempts reached');
      return null;
    }
    
    return delay;
  },
  
  // Reconnect on error
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect on READONLY errors
      return true;
    }
    return false;
  },
};

/**
 * Redis client with connection pooling
 */
export const redis = new Redis(redisConfig);

/**
 * Redis pub/sub client (separate connection)
 */
export const redisPubSub = new Redis(redisConfig);

/**
 * Redis connection health monitor
 */
class RedisHealthMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private isHealthy: boolean = false;

  /**
   * Start monitoring Redis health
   */
  start(): void {
    // Check every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkHealth();
    }, 30000);

    logger.info('Redis health monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Redis health monitor stopped');
  }

  /**
   * Check Redis health
   */
  async checkHealth(): Promise<boolean> {
    try {
      await redis.ping();
      
      if (!this.isHealthy) {
        logger.info('Redis connection restored');
        this.isHealthy = true;
      }

      // Update metrics
      metricsService.setGauge('redis_health', 1);
      
      return true;
    } catch (error) {
      logger.error('Redis health check failed', { error });
      
      if (this.isHealthy) {
        logger.error('Redis connection lost');
        this.isHealthy = false;
      }

      // Update metrics
      metricsService.setGauge('redis_health', 0);
      
      return false;
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): boolean {
    return this.isHealthy;
  }
}

export const redisHealthMonitor = new RedisHealthMonitor();

/**
 * Track Redis metrics periodically
 */
function trackRedisMetrics(): void {
  setInterval(async () => {
    try {
      // Get Redis info
      const info = await redis.info('stats');
      const lines = info.split('\r\n');
      
      const stats: Record<string, string> = {};
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      // Track key metrics
      if (stats.connected_clients) {
        metricsService.setGauge('redis_connected_clients', parseInt(stats.connected_clients));
      }
      
      if (stats.blocked_clients) {
        metricsService.setGauge('redis_blocked_clients', parseInt(stats.blocked_clients));
      }

      // Track memory usage
      const memoryInfo = await redis.info('memory');
      const memoryLines = memoryInfo.split('\r\n');
      
      memoryLines.forEach(line => {
        if (line.startsWith('used_memory:')) {
          const bytes = parseInt(line.split(':')[1]);
          metricsService.setGauge('redis_memory_used_bytes', bytes);
        }
        if (line.startsWith('used_memory_peak:')) {
          const bytes = parseInt(line.split(':')[1]);
          metricsService.setGauge('redis_memory_peak_bytes', bytes);
        }
      });

    } catch (error) {
      logger.error('Failed to track Redis metrics', { error });
    }
  }, 15000); // Every 15 seconds
}

/**
 * Setup Redis event handlers
 */
function setupEventHandlers(): void {
  redis.on('connect', () => {
    logger.info('Redis connecting...');
  });

  redis.on('ready', () => {
    logger.info('Redis connection ready');
    metricsService.setGauge('redis_connection_status', 1);
  });

  redis.on('error', (error: Error) => {
    logger.error('Redis error', { error: error.message });
    metricsService.incrementCounter('redis_errors_total', {
      error_type: error.name,
    });
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
    metricsService.setGauge('redis_connection_status', 0);
  });

  redis.on('reconnecting', (delay: number) => {
    logger.info(`Redis reconnecting in ${delay}ms`);
    metricsService.incrementCounter('redis_reconnect_total');
  });

  redis.on('end', () => {
    logger.warn('Redis connection ended');
    metricsService.setGauge('redis_connection_status', 0);
  });

  // PubSub client events
  redisPubSub.on('ready', () => {
    logger.info('Redis pub/sub connection ready');
  });

  redisPubSub.on('error', (error: Error) => {
    logger.error('Redis pub/sub error', { error: error.message });
  });
}

/**
 * Initialize Redis connection
 */
export async function connectRedis(): Promise<void> {
  try {
    // Setup event handlers
    setupEventHandlers();

    // Wait for connection to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 10000);

      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      redis.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    logger.info('Redis connected successfully', {
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db,
    });

    // Start health monitoring
    redisHealthMonitor.start();

    // Start tracking metrics
    trackRedisMetrics();

  } catch (error) {
    logger.error('Failed to connect to Redis', { error });
    throw error;
  }
}

/**
 * Close Redis connections gracefully
 */
export async function closeRedisConnections(): Promise<void> {
  try {
    // Stop health monitoring
    redisHealthMonitor.stop();

    // Close connections
    await redis.quit();
    await redisPubSub.quit();
    
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections', { error });
    // Force quit if graceful close fails
    redis.disconnect();
    redisPubSub.disconnect();
  }
}

/**
 * Check if Redis is connected
 */
export async function isRedisConnected(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get Redis connection stats
 */
export async function getRedisStats(): Promise<{
  connected: boolean;
  clients: number;
  blockedClients: number;
  memoryUsed: number;
  memoryPeak: number;
}> {
  try {
    const info = await redis.info('stats');
    const memoryInfo = await redis.info('memory');
    
    const parseInfo = (str: string): Record<string, string> => {
      const result: Record<string, string> = {};
      str.split('\r\n').forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) result[key] = value;
      });
      return result;
    };

    const stats = parseInfo(info);
    const memory = parseInfo(memoryInfo);

    return {
      connected: true,
      clients: parseInt(stats.connected_clients || '0'),
      blockedClients: parseInt(stats.blocked_clients || '0'),
      memoryUsed: parseInt(memory.used_memory || '0'),
      memoryPeak: parseInt(memory.used_memory_peak || '0'),
    };
  } catch (error) {
    return {
      connected: false,
      clients: 0,
      blockedClients: 0,
      memoryUsed: 0,
      memoryPeak: 0,
    };
  }
}

/**
 * Create a Redis client with custom configuration
 */
export function createRedisClient(options: Partial<RedisOptions> = {}): Redis {
  const config = { ...redisConfig, ...options };
  const client = new Redis(config);
  
  client.on('error', (error: Error) => {
    logger.error('Custom Redis client error', { error: error.message });
  });

  return client;
}
