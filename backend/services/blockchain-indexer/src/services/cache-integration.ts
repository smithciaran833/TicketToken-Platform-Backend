/**
 * Cache Integration Service
 * 
 * Uses the local cache implementation from utils/cache.ts
 * AUDIT FIX: DEP-1 - TypeScript strict mode compatibility
 */

import { initializeCache, getCache, CacheManager } from '../utils/cache';
import logger from '../utils/logger';

// Initialize cache with config from environment
let cacheInstance: CacheManager | null = null;

export function initializeCacheService(): CacheManager {
  if (cacheInstance) {
    return cacheInstance;
  }

  try {
    cacheInstance = initializeCache({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'blockchain-indexer:',
      defaultTTL: 300, // 5 minutes
    });

    logger.info('Cache service initialized');
    return cacheInstance;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize cache service');
    throw error;
  }
}

export function getCacheService(): CacheManager {
  if (!cacheInstance) {
    return initializeCacheService();
  }
  return cacheInstance;
}

export default {
  initialize: initializeCacheService,
  get: getCacheService,
};
