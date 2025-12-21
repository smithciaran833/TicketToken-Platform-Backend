/**
 * Redis List Operations
 * 
 * Lists for queues, activity feeds, and recent items.
 * Lists are ordered collections where you can push/pop from both ends.
 */

import Redis from 'ioredis';
import { getRedisClient } from '../connection-manager';
import { RedisOperationError } from '../types';
import { serialize, deserialize } from '../utils/serialization';

/**
 * List Operations Class
 */
export class ListOperations {
  private client: Redis | null = null;
  
  private async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Push values to left (head) of list
   */
  async lpush(key: string, ...values: any[]): Promise<number> {
    try {
      const client = await this.getClient();
      const serialized = values.map(v => serialize(v));
      return await client.lpush(key, ...serialized);
    } catch (error) {
      throw new RedisOperationError('LPUSH failed', 'LPUSH', key, error as Error);
    }
  }
  
  /**
   * Push values to right (tail) of list
   */
  async rpush(key: string, ...values: any[]): Promise<number> {
    try {
      const client = await this.getClient();
      const serialized = values.map(v => serialize(v));
      return await client.rpush(key, ...serialized);
    } catch (error) {
      throw new RedisOperationError('RPUSH failed', 'RPUSH', key, error as Error);
    }
  }
  
  /**
   * Pop value from left (head) of list
   */
  async lpop<T = any>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const value = await client.lpop(key);
      return value ? deserialize<T>(value) : null;
    } catch (error) {
      throw new RedisOperationError('LPOP failed', 'LPOP', key, error as Error);
    }
  }
  
  /**
   * Pop value from right (tail) of list
   */
  async rpop<T = any>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const value = await client.rpop(key);
      return value ? deserialize<T>(value) : null;
    } catch (error) {
      throw new RedisOperationError('RPOP failed', 'RPOP', key, error as Error);
    }
  }
  
  /**
   * Get range of elements from list
   */
  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const client = await this.getClient();
      const values = await client.lrange(key, start, stop);
      return values.map(v => deserialize<T>(v) as T);
    } catch (error) {
      throw new RedisOperationError('LRANGE failed', 'LRANGE', key, error as Error);
    }
  }
  
  /**
   * Get length of list
   */
  async llen(key: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.llen(key);
    } catch (error) {
      throw new RedisOperationError('LLEN failed', 'LLEN', key, error as Error);
    }
  }
  
  /**
   * Trim list to specified range
   */
  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    try {
      const client = await this.getClient();
      return await client.ltrim(key, start, stop);
    } catch (error) {
      throw new RedisOperationError('LTRIM failed', 'LTRIM', key, error as Error);
    }
  }
  
  /**
   * Get element at index
   */
  async lindex<T = any>(key: string, index: number): Promise<T | null> {
    try {
      const client = await this.getClient();
      const value = await client.lindex(key, index);
      return value ? deserialize<T>(value) : null;
    } catch (error) {
      throw new RedisOperationError('LINDEX failed', 'LINDEX', key, error as Error);
    }
  }
  
  /**
   * Set element at index
   */
  async lset(key: string, index: number, value: any): Promise<'OK'> {
    try {
      const client = await this.getClient();
      const serialized = serialize(value);
      return await client.lset(key, index, serialized);
    } catch (error) {
      throw new RedisOperationError('LSET failed', 'LSET', key, error as Error);
    }
  }
  
  /**
   * Remove elements from list
   */
  async lrem(key: string, count: number, value: any): Promise<number> {
    try {
      const client = await this.getClient();
      const serialized = serialize(value);
      return await client.lrem(key, count, serialized);
    } catch (error) {
      throw new RedisOperationError('LREM failed', 'LREM', key, error as Error);
    }
  }
  
  /**
   * Blocking pop from left with timeout
   * Returns null if timeout expires
   */
  async blpop<T = any>(key: string, timeout: number): Promise<{ key: string; value: T } | null> {
    try {
      const client = await this.getClient();
      const result = await client.blpop(key, timeout);
      if (!result) return null;
      return {
        key: result[0],
        value: deserialize<T>(result[1]) as T,
      };
    } catch (error) {
      throw new RedisOperationError('BLPOP failed', 'BLPOP', key, error as Error);
    }
  }
  
  /**
   * Blocking pop from right with timeout
   * Returns null if timeout expires
   */
  async brpop<T = any>(key: string, timeout: number): Promise<{ key: string; value: T } | null> {
    try {
      const client = await this.getClient();
      const result = await client.brpop(key, timeout);
      if (!result) return null;
      return {
        key: result[0],
        value: deserialize<T>(result[1]) as T,
      };
    } catch (error) {
      throw new RedisOperationError('BRPOP failed', 'BRPOP', key, error as Error);
    }
  }
  
  /**
   * Push value to left only if list exists
   */
  async lpushx(key: string, value: any): Promise<number> {
    try {
      const client = await this.getClient();
      const serialized = serialize(value);
      return await client.lpushx(key, serialized);
    } catch (error) {
      throw new RedisOperationError('LPUSHX failed', 'LPUSHX', key, error as Error);
    }
  }
  
  /**
   * Push value to right only if list exists
   */
  async rpushx(key: string, value: any): Promise<number> {
    try {
      const client = await this.getClient();
      const serialized = serialize(value);
      return await client.rpushx(key, serialized);
    } catch (error) {
      throw new RedisOperationError('RPUSHX failed', 'RPUSHX', key, error as Error);
    }
  }
  
  /**
   * Pop from right of source and push to left of destination
   * Atomic operation for queue processing
   */
  async rpoplpush<T = any>(source: string, destination: string): Promise<T | null> {
    try {
      const client = await this.getClient();
      const value = await client.rpoplpush(source, destination);
      return value ? deserialize<T>(value) : null;
    } catch (error) {
      throw new RedisOperationError('RPOPLPUSH failed', 'RPOPLPUSH', source, error as Error);
    }
  }
  
  /**
   * Blocking version of rpoplpush
   */
  async brpoplpush<T = any>(source: string, destination: string, timeout: number): Promise<T | null> {
    try {
      const client = await this.getClient();
      const value = await client.brpoplpush(source, destination, timeout);
      return value ? deserialize<T>(value) : null;
    } catch (error) {
      throw new RedisOperationError('BRPOPLPUSH failed', 'BRPOPLPUSH', source, error as Error);
    }
  }
}

// Singleton instance
let listOps: ListOperations | null = null;

/**
 * Get list operations instance
 */
export function getListOps(): ListOperations {
  if (!listOps) {
    listOps = new ListOperations();
  }
  return listOps;
}

// Convenience functions
export const lpush = (key: string, ...values: any[]) => getListOps().lpush(key, ...values);
export const rpush = (key: string, ...values: any[]) => getListOps().rpush(key, ...values);
export const lpop = <T = any>(key: string) => getListOps().lpop<T>(key);
export const rpop = <T = any>(key: string) => getListOps().rpop<T>(key);
export const lrange = <T = any>(key: string, start: number, stop: number) => getListOps().lrange<T>(key, start, stop);
export const llen = (key: string) => getListOps().llen(key);
export const ltrim = (key: string, start: number, stop: number) => getListOps().ltrim(key, start, stop);
export const lindex = <T = any>(key: string, index: number) => getListOps().lindex<T>(key, index);
export const lset = (key: string, index: number, value: any) => getListOps().lset(key, index, value);
export const lrem = (key: string, count: number, value: any) => getListOps().lrem(key, count, value);
export const blpop = <T = any>(key: string, timeout: number) => getListOps().blpop<T>(key, timeout);
export const brpop = <T = any>(key: string, timeout: number) => getListOps().brpop<T>(key, timeout);
export const lpushx = (key: string, value: any) => getListOps().lpushx(key, value);
export const rpushx = (key: string, value: any) => getListOps().rpushx(key, value);
export const rpoplpush = <T = any>(source: string, destination: string) => getListOps().rpoplpush<T>(source, destination);
export const brpoplpush = <T = any>(source: string, destination: string, timeout: number) => getListOps().brpoplpush<T>(source, destination, timeout);
