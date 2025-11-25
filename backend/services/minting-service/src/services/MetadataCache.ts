import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';
import { cacheHits, cacheMisses } from '../utils/metrics';

export class MetadataCache {
  private client: RedisClientType | null = null;
  private readonly TTL = 3600; // 1 hour default TTL
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.REDIS_ENABLED === 'true';
    
    if (this.enabled) {
      this.initialize();
    } else {
      logger.info('Metadata cache disabled (REDIS_ENABLED=false)');
    }
  }

  /**
   * Initialize Redis connection
   */
  private async initialize(): Promise<void> {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis max reconnection attempts reached');
              return new Error('Max retries reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected for metadata caching');
      });

      this.client.on('reconnecting', () => {
        logger.warn('Redis reconnecting...');
      });

      await this.client.connect();

    } catch (error) {
      logger.error('Failed to initialize metadata cache', {
        error: (error as Error).message
      });
      this.enabled = false;
      this.client = null;
    }
  }

  /**
   * Get metadata from cache
   */
  async get(key: string): Promise<string | null> {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(this.prefixKey(key));
      
      if (value) {
        cacheHits.labels('metadata').inc();
        logger.debug('Cache hit', { key });
      } else {
        cacheMisses.labels('metadata').inc();
        logger.debug('Cache miss', { key });
      }
      
      return value;

    } catch (error) {
      logger.error('Cache get error', {
        key,
        error: (error as Error).message
      });
      cacheMisses.labels('metadata').inc();
      return null;
    }
  }

  /**
   * Set metadata in cache
   */
  async set(key: string, value: string, ttl: number = this.TTL): Promise<boolean> {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      await this.client.setEx(this.prefixKey(key), ttl, value);
      logger.debug('Cache set', { key, ttl });
      return true;

    } catch (error) {
      logger.error('Cache set error', {
        key,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      await this.client.del(this.prefixKey(key));
      logger.debug('Cache delete', { key });
      return true;

    } catch (error) {
      logger.error('Cache delete error', {
        key,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Get or set pattern (get from cache or compute and cache)
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.TTL
  ): Promise<T> {
    // Try cache first
    const cached = await this.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch (error) {
        logger.warn('Failed to parse cached value', { key });
      }
    }

    // Fetch fresh data
    const value = await fetcher();
    
    // Cache it
    await this.set(key, JSON.stringify(value), ttl);
    
    return value;
  }

  /**
   * Cache IPFS metadata
   */
  async cacheIPFSMetadata(ticketId: string, metadataUri: string, ttl: number = 86400): Promise<void> {
    await this.set(`ipfs:${ticketId}`, metadataUri, ttl); // 24 hours
  }

  /**
   * Get cached IPFS metadata
   */
  async getCachedIPFSMetadata(ticketId: string): Promise<string | null> {
    return this.get(`ipfs:${ticketId}`);
  }

  /**
   * Cache NFT mint transaction
   */
  async cacheMintTransaction(ticketId: string, signature: string, ttl: number = 3600): Promise<void> {
    await this.set(`tx:${ticketId}`, signature, ttl);
  }

  /**
   * Get cached mint transaction
   */
  async getCachedMintTransaction(ticketId: string): Promise<string | null> {
    return this.get(`tx:${ticketId}`);
  }

  /**
   * Invalidate ticket cache
   */
  async invalidateTicket(ticketId: string): Promise<void> {
    await Promise.all([
      this.delete(`ipfs:${ticketId}`),
      this.delete(`tx:${ticketId}`)
    ]);
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll(): Promise<boolean> {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      await this.client.flushDb();
      logger.warn('Cache cleared');
      return true;

    } catch (error) {
      logger.error('Cache clear error', {
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    enabled: boolean;
    connected: boolean;
    keyCount: number;
  }> {
    if (!this.enabled || !this.client) {
      return {
        enabled: this.enabled,
        connected: false,
        keyCount: 0
      };
    }

    try {
      const info = await this.client.info('keyspace');
      const keyCount = this.parseKeyCount(info);

      return {
        enabled: true,
        connected: this.client.isReady,
        keyCount
      };

    } catch (error) {
      return {
        enabled: true,
        connected: false,
        keyCount: 0
      };
    }
  }

  /**
   * Prefix keys with namespace
   */
  private prefixKey(key: string): string {
    return `minting:${key}`;
  }

  /**
   * Parse key count from Redis INFO output
   */
  private parseKeyCount(info: string): number {
    const match = info.match(/keys=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      logger.info('Metadata cache closed');
    }
  }
}

// Export singleton instance
export const metadataCache = new MetadataCache();
