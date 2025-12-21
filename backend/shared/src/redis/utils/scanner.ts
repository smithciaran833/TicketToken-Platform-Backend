/**
 * Redis Scanner Utility
 * 
 * CRITICAL: Safe replacement for Redis KEYS command using SCAN.
 * The KEYS command blocks Redis and should NEVER be used in production.
 * This utility uses SCAN which iterates through keys without blocking.
 */

import Redis from 'ioredis';
import { ScanOptions, ScanCallback, RedisScanError } from '../types';
import { SCAN_BATCH_SIZE, MAX_SCAN_RESULTS } from '../config';
import { getRedisClient } from '../connection-manager';

/**
 * Scanner class for safe key iteration
 */
export class RedisScanner {
  private client: Redis | null = null;
  
  /**
   * Get Redis client
   */
  private async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Scan keys matching a pattern with callback for each batch
   * 
   * This is the safe alternative to KEYS command. It iterates through
   * keys without blocking Redis.
   * 
   * @param pattern - Key pattern to match (e.g., 'session:*')
   * @param callback - Callback function called for each batch of keys
   * @param options - Scan options
   * 
   * @example
   * ```ts
   * await scanner.scan('session:*', async (keys) => {
   *   console.log('Found keys:', keys);
   * });
   * ```
   */
  public async scan(
    pattern: string,
    callback: ScanCallback,
    options: ScanOptions = {}
  ): Promise<void> {
    try {
      const client = await this.getClient();
      let cursor = options.cursor || '0';
      const count = options.count || SCAN_BATCH_SIZE;
      
      do {
        // Execute SCAN command
        const result = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          count
        );
        
        // Result is [newCursor, keys]
        cursor = result[0];
        const keys = result[1];
        
        // Call callback with this batch of keys
        if (keys.length > 0) {
          await callback(keys);
        }
        
        // Continue until cursor returns to '0'
      } while (cursor !== '0');
    } catch (error) {
      throw new RedisScanError(
        `Failed to scan keys with pattern: ${pattern}`,
        pattern,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  
  /**
   * Get all keys matching a pattern
   * 
   * WARNING: This loads all matching keys into memory. Use with caution
   * and prefer scan() with a callback for large datasets.
   * 
   * @param pattern - Key pattern to match
   * @param options - Scan options
   * @returns Array of matching keys
   * 
   * @example
   * ```ts
   * const keys = await scanner.scanKeys('cache:*');
   * ```
   */
  public async scanKeys(
    pattern: string,
    options: ScanOptions = {}
  ): Promise<string[]> {
    const keys: string[] = [];
    let totalKeys = 0;
    
    await this.scan(
      pattern,
      (batchKeys) => {
        // Safety check: prevent unbounded memory growth
        totalKeys += batchKeys.length;
        if (totalKeys > MAX_SCAN_RESULTS) {
          throw new RedisScanError(
            `Scan result exceeded maximum limit of ${MAX_SCAN_RESULTS} keys`,
            pattern
          );
        }
        
        keys.push(...batchKeys);
      },
      options
    );
    
    return keys;
  }
  
  /**
   * Delete all keys matching a pattern
   * 
   * This safely deletes keys in batches without blocking Redis.
   * 
   * @param pattern - Key pattern to match
   * @param options - Scan options
   * @returns Number of keys deleted
   * 
   * @example
   * ```ts
   * const deleted = await scanner.scanAndDelete('cache:old:*');
   * console.log(`Deleted ${deleted} keys`);
   * ```
   */
  public async scanAndDelete(
    pattern: string,
    options: ScanOptions = {}
  ): Promise<number> {
    const client = await this.getClient();
    let totalDeleted = 0;
    
    await this.scan(
      pattern,
      async (keys) => {
        if (keys.length > 0) {
          // Delete in batches using DEL command
          const deleted = await client.del(...keys);
          totalDeleted += deleted;
        }
      },
      options
    );
    
    return totalDeleted;
  }
  
  /**
   * Count keys matching a pattern
   * 
   * @param pattern - Key pattern to match
   * @param options - Scan options
   * @returns Number of matching keys
   * 
   * @example
   * ```ts
   * const count = await scanner.scanCount('session:*');
   * ```
   */
  public async scanCount(
    pattern: string,
    options: ScanOptions = {}
  ): Promise<number> {
    let count = 0;
    
    await this.scan(
      pattern,
      (keys) => {
        count += keys.length;
      },
      options
    );
    
    return count;
  }
  
  /**
   * Get key info for all keys matching pattern
   * 
   * @param pattern - Key pattern to match
   * @param options - Scan options
   * @returns Array of key information
   * 
   * @example
   * ```ts
   * const keyInfo = await scanner.scanKeyInfo('session:*');
   * keyInfo.forEach(info => {
   *   console.log(`${info.key}: type=${info.type}, ttl=${info.ttl}`);
   * });
   * ```
   */
  public async scanKeyInfo(
    pattern: string,
    options: ScanOptions = {}
  ): Promise<Array<{ key: string; type: string; ttl: number }>> {
    const client = await this.getClient();
    const keyInfo: Array<{ key: string; type: string; ttl: number }> = [];
    
    await this.scan(
      pattern,
      async (keys) => {
        // Get type and TTL for each key in parallel
        const promises = keys.map(async (key) => {
          const [type, ttl] = await Promise.all([
            client.type(key),
            client.ttl(key),
          ]);
          
          return { key, type, ttl };
        });
        
        const batch = await Promise.all(promises);
        keyInfo.push(...batch);
      },
      options
    );
    
    return keyInfo;
  }
  
  /**
   * Scan keys with a filter function
   * 
   * @param pattern - Key pattern to match
   * @param filter - Function to filter keys
   * @param options - Scan options
   * @returns Array of filtered keys
   * 
   * @example
   * ```ts
   * // Get only keys with TTL < 60 seconds
   * const expiringKeys = await scanner.scanWithFilter(
   *   'cache:*',
   *   async (key, client) => {
   *     const ttl = await client.ttl(key);
   *     return ttl > 0 && ttl < 60;
   *   }
   * );
   * ```
   */
  public async scanWithFilter(
    pattern: string,
    filter: (key: string, client: Redis) => Promise<boolean>,
    options: ScanOptions = {}
  ): Promise<string[]> {
    const client = await this.getClient();
    const filteredKeys: string[] = [];
    
    await this.scan(
      pattern,
      async (keys) => {
        // Filter keys in parallel
        const results = await Promise.all(
          keys.map(async (key) => ({
            key,
            include: await filter(key, client),
          }))
        );
        
        // Add keys that passed the filter
        const passed = results.filter((r) => r.include).map((r) => r.key);
        filteredKeys.push(...passed);
      },
      options
    );
    
    return filteredKeys;
  }
  
  /**
   * Scan and execute an operation on each key
   * 
   * @param pattern - Key pattern to match
   * @param operation - Operation to perform on each key
   * @param options - Scan options
   * @returns Number of keys processed
   * 
   * @example
   * ```ts
   * // Update TTL for all matching keys
   * await scanner.scanAndUpdate('cache:*', async (key, client) => {
   *   await client.expire(key, 3600);
   * });
   * ```
   */
  public async scanAndUpdate(
    pattern: string,
    operation: (key: string, client: Redis) => Promise<void>,
    options: ScanOptions = {}
  ): Promise<number> {
    const client = await this.getClient();
    let processed = 0;
    
    await this.scan(
      pattern,
      async (keys) => {
        // Process keys in parallel
        await Promise.all(
          keys.map((key) => operation(key, client))
        );
        processed += keys.length;
      },
      options
    );
    
    return processed;
  }
}

/**
 * Create a new scanner instance
 */
export function createScanner(): RedisScanner {
  return new RedisScanner();
}

/**
 * Default scanner instance
 */
let defaultScanner: RedisScanner | null = null;

/**
 * Get the default scanner instance
 */
export function getScanner(): RedisScanner {
  if (!defaultScanner) {
    defaultScanner = new RedisScanner();
  }
  return defaultScanner;
}

/**
 * Convenience functions using default scanner
 */

/**
 * Scan keys matching pattern with callback
 */
export async function scan(
  pattern: string,
  callback: ScanCallback,
  options?: ScanOptions
): Promise<void> {
  return getScanner().scan(pattern, callback, options);
}

/**
 * Get all keys matching pattern
 * 
 * WARNING: Loads all keys into memory. Use scan() for large datasets.
 */
export async function scanKeys(
  pattern: string,
  options?: ScanOptions
): Promise<string[]> {
  return getScanner().scanKeys(pattern, options);
}

/**
 * Delete all keys matching pattern
 */
export async function scanAndDelete(
  pattern: string,
  options?: ScanOptions
): Promise<number> {
  return getScanner().scanAndDelete(pattern, options);
}

/**
 * Count keys matching pattern
 */
export async function scanCount(
  pattern: string,
  options?: ScanOptions
): Promise<number> {
  return getScanner().scanCount(pattern, options);
}
