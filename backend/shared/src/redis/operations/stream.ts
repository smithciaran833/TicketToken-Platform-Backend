/**
 * Redis Stream Operations
 * 
 * Streams for event streaming, audit logs, and message queues.
 * Provides append-only log data structure with consumer groups.
 */

import Redis from 'ioredis';
import { getRedisClient } from '../connection-manager';
import { RedisOperationError, StreamMessage } from '../types';
import { serialize, deserialize } from '../utils/serialization';

/**
 * Stream Operations Class
 */
export class StreamOperations {
  private client: Redis | null = null;
  
  private async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Add entry to stream
   */
  async xadd(key: string, id: string, fields: Record<string, any>): Promise<string> {
    try {
      const client = await this.getClient();
      const args: string[] = [];
      Object.entries(fields).forEach(([field, value]) => {
        args.push(field, serialize(value));
      });
      return await client.xadd(key, id, ...args);
    } catch (error) {
      throw new RedisOperationError('XADD failed', 'XADD', key, error as Error);
    }
  }
  
  /**
   * Read entries from stream
   */
  async xread(streams: Record<string, string>, count?: number, block?: number): Promise<any[]> {
    try {
      const client = await this.getClient();
      const streamKeys = Object.keys(streams);
      const streamIds = Object.values(streams);
      
      if (count && block !== undefined) {
        return await client.xread('COUNT', count, 'BLOCK', block, 'STREAMS', ...streamKeys, ...streamIds) || [];
      } else if (count) {
        return await client.xread('COUNT', count, 'STREAMS', ...streamKeys, ...streamIds) || [];
      } else if (block !== undefined) {
        return await client.xread('BLOCK', block, 'STREAMS', ...streamKeys, ...streamIds) || [];
      } else {
        return await client.xread('STREAMS', ...streamKeys, ...streamIds) || [];
      }
    } catch (error) {
      throw new RedisOperationError('XREAD failed', 'XREAD', '', error as Error);
    }
  }
  
  /**
   * Get range of entries
   */
  async xrange(key: string, start: string = '-', end: string = '+', count?: number): Promise<StreamMessage[]> {
    try {
      const client = await this.getClient();
      let result;
      if (count) {
        result = await client.xrange(key, start, end, 'COUNT', count);
      } else {
        result = await client.xrange(key, start, end);
      }
      return this.parseStreamMessages(result);
    } catch (error) {
      throw new RedisOperationError('XRANGE failed', 'XRANGE', key, error as Error);
    }
  }
  
  /**
   * Get stream length
   */
  async xlen(key: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.xlen(key);
    } catch (error) {
      throw new RedisOperationError('XLEN failed', 'XLEN', key, error as Error);
    }
  }
  
  /**
   * Trim stream to approximate maxlen
   */
  async xtrim(key: string, strategy: 'MAXLEN' | 'MINID', threshold: number | string, approximate: boolean = true): Promise<number> {
    try {
      const client = await this.getClient();
      if (approximate) {
        return await client.xtrim(key, strategy as any, '~', threshold as any);
      } else {
        return await client.xtrim(key, strategy as any, threshold as any);
      }
    } catch (error) {
      throw new RedisOperationError('XTRIM failed', 'XTRIM', key, error as Error);
    }
  }
  
  /**
   * Delete entries from stream
   */
  async xdel(key: string, ...ids: string[]): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.xdel(key, ...ids);
    } catch (error) {
      throw new RedisOperationError('XDEL failed', 'XDEL', key, error as Error);
    }
  }
  
  /**
   * Parse stream messages from Redis response
   */
  private parseStreamMessages(result: any[]): StreamMessage[] {
    return result.map(([id, fields]: [string, string[]]) => {
      const fieldsObj: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldsObj[fields[i]] = fields[i + 1];
      }
      return { id, fields: fieldsObj };
    });
  }
}

// Singleton
let streamOps: StreamOperations | null = null;

export function getStreamOps(): StreamOperations {
  if (!streamOps) {
    streamOps = new StreamOperations();
  }
  return streamOps;
}

// Convenience functions
export const xadd = (key: string, id: string, fields: Record<string, any>) => getStreamOps().xadd(key, id, fields);
export const xread = (streams: Record<string, string>, count?: number, block?: number) => getStreamOps().xread(streams, count, block);
export const xrange = (key: string, start?: string, end?: string, count?: number) => getStreamOps().xrange(key, start, end, count);
export const xlen = (key: string) => getStreamOps().xlen(key);
export const xtrim = (key: string, strategy: 'MAXLEN' | 'MINID', threshold: number | string, approximate?: boolean) => getStreamOps().xtrim(key, strategy, threshold, approximate);
export const xdel = (key: string, ...ids: string[]) => getStreamOps().xdel(key, ...ids);
