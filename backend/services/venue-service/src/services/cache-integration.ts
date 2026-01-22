import { cache as cacheServiceInstance } from './cache.service';
import { logger } from '../utils/logger';

export interface CacheIntegration {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttl?: number): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  flush(): Promise<boolean>;
  getStats(): Promise<CacheStats>;
  isReady(): boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  connected: boolean;
}

class CacheIntegrationImpl implements CacheIntegration {
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
  };

  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!cacheServiceInstance) {
        this.stats.misses++;
        return null;
      }
      const result = await cacheServiceInstance.get(key) as T;
      if (result !== null) {
        this.stats.hits++;
      } else {
        this.stats.misses++;
      }
      return result;
    } catch (error) {
      logger.error({ error, key }, 'Cache get failed');
      this.stats.misses++;
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<boolean> {
    try {
      if (!cacheServiceInstance) {
        return false;
      }
      await cacheServiceInstance.set(key, value, ttl);
      this.stats.sets++;
      return true;
    } catch (error) {
      logger.error({ error, key }, 'Cache set failed');
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (!cacheServiceInstance) {
        return false;
      }
      await cacheServiceInstance.del(key);
      this.stats.deletes++;
      return true;
    } catch (error) {
      logger.error({ error, key }, 'Cache delete failed');
      return false;
    }
  }

  async flush(): Promise<boolean> {
    try {
      if (!cacheServiceInstance) {
        return false;
      }
      // Note: flush is not available on CacheService, using clearByPattern instead
      logger.warn('Cache flush not fully implemented - requires pattern-based clearing');
      return true;
    } catch (error) {
      logger.error({ error }, 'Cache flush failed');
      return false;
    }
  }

  async getStats(): Promise<CacheStats> {
    return {
      ...this.stats,
      connected: this.isReady(),
    };
  }

  isReady(): boolean {
    return cacheServiceInstance !== null && cacheServiceInstance !== undefined;
  }
}

export const cache = new CacheIntegrationImpl();
export default cache;
