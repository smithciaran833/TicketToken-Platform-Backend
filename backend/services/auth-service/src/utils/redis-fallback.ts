/**
 * Redis Fallback Utilities
 * 
 * GD-RD7: Provides fallback behavior when Redis is unavailable
 */

import { getRedis } from '../config/redis';
import { logger } from './logger';

// In-memory cache as fallback (limited capacity)
const memoryCache = new Map<string, { value: string; expiresAt: number }>();
const MAX_MEMORY_CACHE_SIZE = 1000;

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get value with fallback to memory cache
 */
export async function getWithFallback(key: string): Promise<string | null> {
  try {
    const redis = getRedis();
    return await redis.get(key);
  } catch (error) {
    logger.warn('Redis get failed, checking memory fallback', { key, error });
    
    // Check memory cache
    const cached = memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    
    // Clean up expired entry
    if (cached) {
      memoryCache.delete(key);
    }
    
    return null;
  }
}

/**
 * Set value with fallback to memory cache
 */
export async function setWithFallback(
  key: string, 
  value: string, 
  ttlSeconds?: number
): Promise<boolean> {
  try {
    const redis = getRedis();
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, value);
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch (error) {
    logger.warn('Redis set failed, using memory fallback', { key, error });
    
    // Fallback to memory cache
    if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
      // Evict oldest entries
      const keysToDelete = Array.from(memoryCache.keys()).slice(0, 100);
      keysToDelete.forEach(k => memoryCache.delete(k));
    }
    
    memoryCache.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : Date.now() + 300000, // 5 min default
    });
    
    return false; // Indicate Redis failed but fallback succeeded
  }
}

/**
 * Delete value from both Redis and memory cache
 */
export async function deleteWithFallback(key: string): Promise<boolean> {
  memoryCache.delete(key);
  
  try {
    const redis = getRedis();
    await redis.del(key);
    return true;
  } catch (error) {
    logger.warn('Redis delete failed', { key, error });
    return false;
  }
}

/**
 * Execute Redis operation with fallback behavior
 * Returns default value if Redis fails
 */
export async function withRedisFallback<T>(
  operation: () => Promise<T>,
  fallbackValue: T,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.warn('Redis operation failed, using fallback', { 
      operation: operationName,
      error,
    });
    return fallbackValue;
  }
}

/**
 * Clean up expired entries from memory cache
 * Call periodically (e.g., every minute)
 */
export function cleanupMemoryCache(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
      cleaned++;
    }
  }
  
  return cleaned;
}

/**
 * Get memory cache stats (for monitoring)
 */
export function getMemoryCacheStats(): { size: number; maxSize: number } {
  return {
    size: memoryCache.size,
    maxSize: MAX_MEMORY_CACHE_SIZE,
  };
}
