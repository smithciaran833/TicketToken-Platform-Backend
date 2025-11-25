import { CacheService, CacheOptions } from './cache-service';

export type CachePattern = 'cache-aside' | 'write-through' | 'write-behind' | 'refresh-ahead';

export interface StrategyOptions<T> extends CacheOptions {
  ttl?: number;
  key: string;
  fetcher?: () => Promise<T>;
  updater?: (value: T) => Promise<void>;
  refreshThreshold?: number; // Percentage of TTL remaining to trigger refresh
}

export class CacheStrategies {
  constructor(private cache: CacheService) {}

  /**
   * Cache-Aside (Lazy Loading)
   * - Check cache first
   * - On miss, fetch from source and cache
   * - Most common pattern
   */
  async cacheAside<T>(options: StrategyOptions<T>): Promise<T | null> {
    const { key, fetcher, ...cacheOptions } = options;
    return this.cache.get(key, fetcher, cacheOptions);
  }

  /**
   * Write-Through
   * - Write to cache and database simultaneously
   * - Ensures cache is never stale
   * - Higher latency on writes
   */
  async writeThrough<T>(value: T, options: StrategyOptions<T>): Promise<void> {
    const { key, updater, ...cacheOptions } = options;

    // Write to database first
    if (updater) {
      await updater(value);
    }

    // Then update cache
    await this.cache.set(key, value, cacheOptions);
  }

  /**
   * Write-Behind (Write-Back)
   * - Write to cache immediately
   * - Write to database asynchronously
   * - Better write performance but risk of data loss
   */
  async writeBehind<T>(value: T, options: StrategyOptions<T>): Promise<void> {
    const { key, updater, ...cacheOptions } = options;

    // Update cache immediately
    await this.cache.set(key, value, cacheOptions);

    // Queue database update (async)
    if (updater) {
      setImmediate(async () => {
        try {
          await updater(value);
        } catch (error) {
          console.error(`Write-behind failed for key ${key}:`, error);
          // In production, this should go to a dead letter queue
        }
      });
    }
  }

  /**
   * Refresh-Ahead
   * - Automatically refresh cache before expiry
   * - Reduces cache misses for hot data
   * - Good for frequently accessed data
   */
  async refreshAhead<T>(options: StrategyOptions<T>): Promise<T | null> {
    const { key, fetcher, refreshThreshold = 0.3, ttl = 300, ...cacheOptions } = options;

    const value = await this.cache.get<T>(key, undefined, cacheOptions);

    if (value !== null && fetcher) {
      // Check if we should refresh
      // This is simplified - in production you'd check actual TTL remaining
      const shouldRefresh = Math.random() < refreshThreshold;

      if (shouldRefresh) {
        // Refresh in background
        setImmediate(async () => {
          try {
            const freshValue = await fetcher();
            await this.cache.set(key, freshValue, { ...cacheOptions, ttl });
          } catch (error) {
            console.error(`Refresh-ahead failed for key ${key}:`, error);
          }
        });
      }
    } else if (value === null && fetcher) {
      // Cache miss - fetch and cache
      const freshValue = await fetcher();
      await this.cache.set(key, freshValue, { ...cacheOptions, ttl });
      return freshValue;
    }

    return value;
  }

  /**
   * Distributed Lock
   * - Prevent cache stampede
   * - Ensure only one process refreshes cache
   */
  async withLock<T>(key: string, operation: () => Promise<T>, timeout: number = 5000): Promise<T> {
    const lockKey = `lock:${key}`;
    const lockValue = Math.random().toString(36);

    // Try to acquire lock
    const acquired = await this.cache['redis'].set(lockKey, lockValue, 'PX', timeout, 'NX');

    if (!acquired) {
      // Lock not acquired, wait and retry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if original operation completed
      const value = await this.cache.get<T>(key, undefined);
      if (value !== null) {
        return value;
      }

      // Retry with recursion (with max attempts in production)
      return this.withLock(key, operation, timeout);
    }

    try {
      // Execute operation with lock
      const result = await operation();

      // Release lock only if we own it
      const currentLock = await this.cache['redis'].get(lockKey);
      if (currentLock === lockValue) {
        await this.cache['redis'].del(lockKey);
      }

      return result;
    } catch (error) {
      // Release lock on error
      const currentLock = await this.cache['redis'].get(lockKey);
      if (currentLock === lockValue) {
        await this.cache['redis'].del(lockKey);
      }
      throw error;
    }
  }

  /**
   * Batch Cache Operations
   * - Fetch multiple keys efficiently
   * - Reduce round trips to cache
   */
  async batchGet<T>(
    keys: string[],
    fetcher?: (missingKeys: string[]) => Promise<Map<string, T>>,
    options: CacheOptions = {}
  ): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    const missingKeys: string[] = [];

    // Try to get all from cache first
    const promises = keys.map(async (key) => {
      const value = await this.cache.get<T>(key, undefined, options);
      if (value !== null) {
        results.set(key, value);
      } else {
        missingKeys.push(key);
      }
    });

    await Promise.all(promises);

    // Fetch missing keys
    if (missingKeys.length > 0 && fetcher) {
      const fetchedValues = await fetcher(missingKeys);

      // Cache fetched values
      const cachePromises = Array.from(fetchedValues.entries()).map(async ([key, value]) => {
        await this.cache.set(key, value, options);
        results.set(key, value);
      });

      await Promise.all(cachePromises);
    }

    // Set null for keys that weren't found
    keys.forEach((key) => {
      if (!results.has(key)) {
        results.set(key, null);
      }
    });

    return results;
  }
}
