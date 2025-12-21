/**
 * Redis Hash Operations
 * 
 * Hash operations for storing structured data more efficiently than JSON strings.
 * Hashes are ideal for storing objects with multiple fields.
 */

import Redis from 'ioredis';
import { getRedisClient } from '../connection-manager';
import { RedisOperationError } from '../types';
import { serializeHashField, deserializeHashField, serializeToHash, deserializeFromHash } from '../utils/serialization';

/**
 * Hash Operations Class
 */
export class HashOperations {
  private client: Redis | null = null;
  
  private async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Set a single hash field
   */
  async hset(key: string, field: string, value: any): Promise<number> {
    try {
      const client = await this.getClient();
      const serialized = serializeHashField(value);
      return await client.hset(key, field, serialized);
    } catch (error) {
      throw new RedisOperationError('HSET failed', 'HSET', key, error as Error);
    }
  }
  
  /**
   * Set multiple hash fields from an object
   */
  async hmset(key: string, obj: Record<string, any>): Promise<'OK'> {
    try {
      const client = await this.getClient();
      const hash = serializeToHash(obj);
      return await client.hmset(key, hash);
    } catch (error) {
      throw new RedisOperationError('HMSET failed', 'HMSET', key, error as Error);
    }
  }
  
  /**
   * Get a single hash field
   */
  async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const value = await client.hget(key, field);
      if (value === null) return null;
      return deserializeHashField<T>(value);
    } catch (error) {
      throw new RedisOperationError('HGET failed', 'HGET', key, error as Error);
    }
  }
  
  /**
   * Get multiple hash fields
   */
  async hmget<T = any>(key: string, ...fields: string[]): Promise<(T | null)[]> {
    try {
      const client = await this.getClient();
      const values = await client.hmget(key, ...fields);
      return values.map(v => v === null ? null : deserializeHashField<T>(v));
    } catch (error) {
      throw new RedisOperationError('HMGET failed', 'HMGET', key, error as Error);
    }
  }
  
  /**
   * Get all hash fields and values
   */
  async hgetall<T = any>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const hash = await client.hgetall(key);
      if (!hash || Object.keys(hash).length === 0) return null;
      return deserializeFromHash<T>(hash);
    } catch (error) {
      throw new RedisOperationError('HGETALL failed', 'HGETALL', key, error as Error);
    }
  }
  
  /**
   * Increment hash field by integer
   */
  async hincrby(key: string, field: string, increment: number): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.hincrby(key, field, increment);
    } catch (error) {
      throw new RedisOperationError('HINCRBY failed', 'HINCRBY', key, error as Error);
    }
  }
  
  /**
   * Increment hash field by float
   */
  async hincrbyfloat(key: string, field: string, increment: number): Promise<number> {
    try {
      const client = await this.getClient();
      const result = await client.hincrbyfloat(key, field, increment);
      return parseFloat(result);
    } catch (error) {
      throw new RedisOperationError('HINCRBYFLOAT failed', 'HINCRBYFLOAT', key, error as Error);
    }
  }
  
  /**
   * Delete hash fields
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.hdel(key, ...fields);
    } catch (error) {
      throw new RedisOperationError('HDEL failed', 'HDEL', key, error as Error);
    }
  }
  
  /**
   * Check if hash field exists
   */
  async hexists(key: string, field: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await client.hexists(key, field);
      return result === 1;
    } catch (error) {
      throw new RedisOperationError('HEXISTS failed', 'HEXISTS', key, error as Error);
    }
  }
  
  /**
   * Get all hash field names
   */
  async hkeys(key: string): Promise<string[]> {
    try {
      const client = await this.getClient();
      return await client.hkeys(key);
    } catch (error) {
      throw new RedisOperationError('HKEYS failed', 'HKEYS', key, error as Error);
    }
  }
  
  /**
   * Get all hash values
   */
  async hvals<T = any>(key: string): Promise<T[]> {
    try {
      const client = await this.getClient();
      const values = await client.hvals(key);
      return values.map(v => deserializeHashField<T>(v));
    } catch (error) {
      throw new RedisOperationError('HVALS failed', 'HVALS', key, error as Error);
    }
  }
  
  /**
   * Get number of fields in hash
   */
  async hlen(key: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.hlen(key);
    } catch (error) {
      throw new RedisOperationError('HLEN failed', 'HLEN', key, error as Error);
    }
  }
  
  /**
   * Set field only if it doesn't exist
   */
  async hsetnx(key: string, field: string, value: any): Promise<boolean> {
    try {
      const client = await this.getClient();
      const serialized = serializeHashField(value);
      const result = await client.hsetnx(key, field, serialized);
      return result === 1;
    } catch (error) {
      throw new RedisOperationError('HSETNX failed', 'HSETNX', key, error as Error);
    }
  }
  
  /**
   * Get string length of hash field value
   */
  async hstrlen(key: string, field: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.hstrlen(key, field);
    } catch (error) {
      throw new RedisOperationError('HSTRLEN failed', 'HSTRLEN', key, error as Error);
    }
  }
}

// Singleton instance
let hashOps: HashOperations | null = null;

/**
 * Get hash operations instance
 */
export function getHashOps(): HashOperations {
  if (!hashOps) {
    hashOps = new HashOperations();
  }
  return hashOps;
}

// Convenience functions
export const hset = (key: string, field: string, value: any) => getHashOps().hset(key, field, value);
export const hmset = (key: string, obj: Record<string, any>) => getHashOps().hmset(key, obj);
export const hget = <T = any>(key: string, field: string) => getHashOps().hget<T>(key, field);
export const hmget = <T = any>(key: string, ...fields: string[]) => getHashOps().hmget<T>(key, ...fields);
export const hgetall = <T = any>(key: string) => getHashOps().hgetall<T>(key);
export const hincrby = (key: string, field: string, increment: number) => getHashOps().hincrby(key, field, increment);
export const hincrbyfloat = (key: string, field: string, increment: number) => getHashOps().hincrbyfloat(key, field, increment);
export const hdel = (key: string, ...fields: string[]) => getHashOps().hdel(key, ...fields);
export const hexists = (key: string, field: string) => getHashOps().hexists(key, field);
export const hkeys = (key: string) => getHashOps().hkeys(key);
export const hvals = <T = any>(key: string) => getHashOps().hvals<T>(key);
export const hlen = (key: string) => getHashOps().hlen(key);
export const hsetnx = (key: string, field: string, value: any) => getHashOps().hsetnx(key, field, value);
export const hstrlen = (key: string, field: string) => getHashOps().hstrlen(key, field);
