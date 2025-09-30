import { CacheModel } from '../models';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export class CacheService {
  private static instance: CacheService;
  private log = logger.child({ component: 'CacheService' });
  
  // Cache integrity configuration
  private readonly CACHE_SECRET = process.env.CACHE_SECRET || 'default-cache-secret-change-in-production';
  private readonly SIGNATURE_ALGORITHM = 'sha256';
  private readonly PROTECTED_PREFIXES = ['stats:', 'metrics:', 'aggregate:', 'event:'];

  static getInstance(): CacheService {
    if (!this.instance) {
      this.instance = new CacheService();
    }
    return this.instance;
  }

  private generateSignature(key: string, value: any): string {
    const data = JSON.stringify({ key, value });
    return crypto
      .createHmac(this.SIGNATURE_ALGORITHM, this.CACHE_SECRET)
      .update(data)
      .digest('hex');
  }

  private validateSignature(key: string, value: any, signature: string): boolean {
    const expectedSignature = this.generateSignature(key, value);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private isProtectedKey(key: string): boolean {
    return this.PROTECTED_PREFIXES.some(prefix => key.startsWith(prefix));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isProtectedKey(key)) {
        // Get signed data for protected keys
        const signedData = await CacheModel.get<{ value: T; signature: string }>(key);
        if (!signedData) return null;

        // Validate signature
        if (!this.validateSignature(key, signedData.value, signedData.signature)) {
          this.log.warn('Cache signature validation failed', { key });
          await this.delete(key); // Remove corrupted data
          return null;
        }

        return signedData.value;
      }
      
      // Non-protected keys don't need signature validation
      return await CacheModel.get<T>(key);
    } catch (error) {
      this.log.error('Cache get error', { error, key });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      // Validate write permissions for protected keys
      if (this.isProtectedKey(key)) {
        // Check if caller has permission to write to protected cache
        // This would normally check request context or service identity
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache write attempt to protected key: ${key}`);
        }

        // Sign and store protected data
        const signature = this.generateSignature(key, value);
        const signedData = { value, signature };
        await CacheModel.set(key, signedData, ttl);
      } else {
        // Non-protected keys can be written directly
        await CacheModel.set(key, value, ttl);
      }
    } catch (error) {
      this.log.error('Cache set error', { error, key });
      throw error; // Re-throw to prevent silent failures
    }
  }

  private validateWritePermission(key: string): boolean {
    // Check if the current service/user has permission to write to this cache key
    // This should be enhanced based on your authentication context
    
    // For now, we'll implement basic service-level validation
    const serviceId = process.env.SERVICE_ID || 'analytics-service';
    
    // Statistics and metrics should only be written by analytics service
    if (key.startsWith('stats:') || key.startsWith('metrics:')) {
      return serviceId === 'analytics-service';
    }
    
    // Event data should only be written by event service or analytics service
    if (key.startsWith('event:')) {
      return ['event-service', 'analytics-service'].includes(serviceId);
    }
    
    // Aggregate data should only be written by analytics service
    if (key.startsWith('aggregate:')) {
      return serviceId === 'analytics-service';
    }
    
    return true; // Allow writes to non-protected keys
  }

  async delete(key: string): Promise<void> {
    try {
      // Validate permission to delete protected keys
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache delete attempt for protected key: ${key}`);
        }
      }
      
      await CacheModel.delete(key);
    } catch (error) {
      this.log.error('Cache delete error', { error, key });
      throw error;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      // Check if pattern includes protected keys
      const affectsProtected = this.PROTECTED_PREFIXES.some(prefix => 
        pattern.includes(prefix) || pattern === '*'
      );
      
      if (affectsProtected) {
        const hasPermission = this.validateWritePermission(pattern);
        if (!hasPermission) {
          throw new Error(`Unauthorized pattern delete for protected keys: ${pattern}`);
        }
      }
      
      return await CacheModel.deletePattern(pattern);
    } catch (error) {
      this.log.error('Cache delete pattern error', { error, pattern });
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return await CacheModel.exists(key);
    } catch (error) {
      this.log.error('Cache exists error', { error, key });
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      // Validate permission for protected keys
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache expire attempt for protected key: ${key}`);
        }
      }
      
      await CacheModel.expire(key, ttl);
    } catch (error) {
      this.log.error('Cache expire error', { error, key });
      throw error;
    }
  }

  async increment(key: string, by: number = 1): Promise<number> {
    try {
      // Increments on protected keys need validation
      if (this.isProtectedKey(key)) {
        const hasPermission = this.validateWritePermission(key);
        if (!hasPermission) {
          throw new Error(`Unauthorized cache increment for protected key: ${key}`);
        }
        
        // For protected numeric values, maintain integrity
        const current = await this.get<number>(key) || 0;
        const newValue = current + by;
        await this.set(key, newValue);
        return newValue;
      }
      
      return await CacheModel.increment(key, by);
    } catch (error) {
      this.log.error('Cache increment error', { error, key });
      return 0;
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Generate value
      const value = await factory();

      // Store in cache with appropriate validation
      await this.set(key, value, ttl);

      return value;
    } catch (error) {
      this.log.error('Cache getOrSet error', { error, key });
      // Return factory result even if cache fails
      return await factory();
    }
  }

  async invalidateVenueCache(venueId: string): Promise<void> {
    try {
      // Validate permission to invalidate venue cache
      const hasPermission = this.validateWritePermission(`venue:${venueId}`);
      if (!hasPermission) {
        throw new Error(`Unauthorized venue cache invalidation for: ${venueId}`);
      }
      
      await CacheModel.invalidateVenueCache(venueId);
      this.log.info('Venue cache invalidated', { venueId });
    } catch (error) {
      this.log.error('Failed to invalidate venue cache', { error, venueId });
      throw error;
    }
  }

  async warmupCache(venueId: string): Promise<void> {
    try {
      // This would pre-populate commonly accessed data
      this.log.info('Cache warmup started', { venueId });

      // In production, this would:
      // - Load venue settings
      // - Pre-calculate common metrics
      // - Load dashboard configurations
      // - Cache widget data

      this.log.info('Cache warmup completed', { venueId });
    } catch (error) {
      this.log.error('Cache warmup failed', { error, venueId });
    }
  }

  async getCacheStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
    keys: number;
    memory: number;
  }> {
    // In production, this would track cache statistics
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      keys: 0,
      memory: 0
    };
  }

  async flushAll(): Promise<void> {
    try {
      // Only allow flush from admin or during tests
      const isTest = process.env.NODE_ENV === 'test';
      const isAdmin = process.env.SERVICE_ID === 'admin-service';
      
      if (!isTest && !isAdmin) {
        throw new Error('Unauthorized cache flush attempt');
      }
      
      // Warning: This clears all cache data
      await CacheModel.deletePattern('*');
      this.log.warn('All cache data flushed');
    } catch (error) {
      this.log.error('Failed to flush cache', { error });
      throw error;
    }
  }
}

export const cacheService = CacheService.getInstance();
