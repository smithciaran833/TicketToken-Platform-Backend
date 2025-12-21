/**
 * Redis Sorted Set Operations
 * 
 * Sorted sets for leaderboards, rate limiting with sliding windows,
 * and time-series data. Members are ordered by score.
 */

import Redis from 'ioredis';
import { getRedisClient } from '../connection-manager';
import { RedisOperationError, SortedSetMember } from '../types';
import { serialize, deserialize } from '../utils/serialization';

/**
 * Sorted Set Operations Class
 */
export class SortedSetOperations {
  private client: Redis | null = null;
  
  private async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Add member with score to sorted set
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.zadd(key, score, member);
    } catch (error) {
      throw new RedisOperationError('ZADD failed', 'ZADD', key, error as Error);
    }
  }
  
  /**
   * Add multiple members with scores
   */
  async zaddMulti(key: string, members: SortedSetMember[]): Promise<number> {
    try {
      const client = await this.getClient();
      const args: (number | string)[] = [];
      members.forEach(m => {
        args.push(m.score, m.member);
      });
      return await client.zadd(key, ...args);
    } catch (error) {
      throw new RedisOperationError('ZADD failed', 'ZADD', key, error as Error);
    }
  }
  
  /**
   * Increment score of member
   */
  async zincrby(key: string, increment: number, member: string): Promise<number> {
    try {
      const client = await this.getClient();
      const result = await client.zincrby(key, increment, member);
      return parseFloat(result);
    } catch (error) {
      throw new RedisOperationError('ZINCRBY failed', 'ZINCRBY', key, error as Error);
    }
  }
  
  /**
   * Get score of member
   */
  async zscore(key: string, member: string): Promise<number | null> {
    try {
      const client = await this.getClient();
      const result = await client.zscore(key, member);
      return result !== null ? parseFloat(result) : null;
    } catch (error) {
      throw new RedisOperationError('ZSCORE failed', 'ZSCORE', key, error as Error);
    }
  }
  
  /**
   * Get range of members by rank (ascending)
   */
  async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[] | SortedSetMember[]> {
    try {
      const client = await this.getClient();
      if (withScores) {
        const result = await client.zrange(key, start, stop, 'WITHSCORES');
        return this.parseWithScores(result);
      }
      return await client.zrange(key, start, stop);
    } catch (error) {
      throw new RedisOperationError('ZRANGE failed', 'ZRANGE', key, error as Error);
    }
  }
  
  /**
   * Get range of members by rank (descending)
   */
  async zrevrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[] | SortedSetMember[]> {
    try {
      const client = await this.getClient();
      if (withScores) {
        const result = await client.zrevrange(key, start, stop, 'WITHSCORES');
        return this.parseWithScores(result);
      }
      return await client.zrevrange(key, start, stop);
    } catch (error) {
      throw new RedisOperationError('ZREVRANGE failed', 'ZREVRANGE', key, error as Error);
    }
  }
  
  /**
   * Get range of members by score (ascending)
   */
  async zrangebyscore(
    key: string,
    min: number | string,
    max: number | string,
    options?: { withScores?: boolean; offset?: number; count?: number }
  ): Promise<string[] | SortedSetMember[]> {
    try {
      const client = await this.getClient();
      const args: any[] = [key, min, max];
      
      if (options?.withScores) {
        args.push('WITHSCORES');
      }
      
      if (options?.offset !== undefined && options?.count !== undefined) {
        args.push('LIMIT', options.offset, options.count);
      }
      
      const result = await client.zrangebyscore(...(args as [string, string | number, string | number, ...any[]]));
      
      if (options?.withScores) {
        return this.parseWithScores(result);
      }
      return result;
    } catch (error) {
      throw new RedisOperationError('ZRANGEBYSCORE failed', 'ZRANGEBYSCORE', key, error as Error);
    }
  }
  
  /**
   * Get range of members by score (descending)
   */
  async zrevrangebyscore(
    key: string,
    max: number | string,
    min: number | string,
    options?: { withScores?: boolean; offset?: number; count?: number }
  ): Promise<string[] | SortedSetMember[]> {
    try {
      const client = await this.getClient();
      const args: any[] = [key, max, min];
      
      if (options?.withScores) {
        args.push('WITHSCORES');
      }
      
      if (options?.offset !== undefined && options?.count !== undefined) {
        args.push('LIMIT', options.offset, options.count);
      }
      
      const result = await client.zrevrangebyscore(...(args as [string, string | number, string | number, ...any[]]));
      
      if (options?.withScores) {
        return this.parseWithScores(result);
      }
      return result;
    } catch (error) {
      throw new RedisOperationError('ZREVRANGEBYSCORE failed', 'ZREVRANGEBYSCORE', key, error as Error);
    }
  }
  
  /**
   * Get rank of member (ascending, 0-based)
   */
  async zrank(key: string, member: string): Promise<number | null> {
    try {
      const client = await this.getClient();
      return await client.zrank(key, member);
    } catch (error) {
      throw new RedisOperationError('ZRANK failed', 'ZRANK', key, error as Error);
    }
  }
  
  /**
   * Get rank of member (descending, 0-based)
   */
  async zrevrank(key: string, member: string): Promise<number | null> {
    try {
      const client = await this.getClient();
      return await client.zrevrank(key, member);
    } catch (error) {
      throw new RedisOperationError('ZREVRANK failed', 'ZREVRANK', key, error as Error);
    }
  }
  
  /**
   * Remove members from sorted set
   */
  async zrem(key: string, ...members: string[]): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.zrem(key, ...members);
    } catch (error) {
      throw new RedisOperationError('ZREM failed', 'ZREM', key, error as Error);
    }
  }
  
  /**
   * Remove members by score range
   */
  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.zremrangebyscore(key, min, max);
    } catch (error) {
      throw new RedisOperationError('ZREMRANGEBYSCORE failed', 'ZREMRANGEBYSCORE', key, error as Error);
    }
  }
  
  /**
   * Remove members by rank range
   */
  async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.zremrangebyrank(key, start, stop);
    } catch (error) {
      throw new RedisOperationError('ZREMRANGEBYRANK failed', 'ZREMRANGEBYRANK', key, error as Error);
    }
  }
  
  /**
   * Get number of members in sorted set
   */
  async zcard(key: string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.zcard(key);
    } catch (error) {
      throw new RedisOperationError('ZCARD failed', 'ZCARD', key, error as Error);
    }
  }
  
  /**
   * Count members with score in range
   */
  async zcount(key: string, min: number | string, max: number | string): Promise<number> {
    try {
      const client = await this.getClient();
      return await client.zcount(key, min, max);
    } catch (error) {
      throw new RedisOperationError('ZCOUNT failed', 'ZCOUNT', key, error as Error);
    }
  }
  
  /**
   * Parse WITHSCORES result into SortedSetMember array
   */
  private parseWithScores(result: string[]): SortedSetMember[] {
    const members: SortedSetMember[] = [];
    for (let i = 0; i < result.length; i += 2) {
      members.push({
        member: result[i],
        score: parseFloat(result[i + 1]),
      });
    }
    return members;
  }
}

// Singleton instance
let sortedSetOps: SortedSetOperations | null = null;

/**
 * Get sorted set operations instance
 */
export function getSortedSetOps(): SortedSetOperations {
  if (!sortedSetOps) {
    sortedSetOps = new SortedSetOperations();
  }
  return sortedSetOps;
}

// Convenience functions
export const zadd = (key: string, score: number, member: string) => getSortedSetOps().zadd(key, score, member);
export const zaddMulti = (key: string, members: SortedSetMember[]) => getSortedSetOps().zaddMulti(key, members);
export const zincrby = (key: string, increment: number, member: string) => getSortedSetOps().zincrby(key, increment, member);
export const zscore = (key: string, member: string) => getSortedSetOps().zscore(key, member);
export const zrange = (key: string, start: number, stop: number, withScores?: boolean) => getSortedSetOps().zrange(key, start, stop, withScores);
export const zrevrange = (key: string, start: number, stop: number, withScores?: boolean) => getSortedSetOps().zrevrange(key, start, stop, withScores);
export const zrangebyscore = (key: string, min: number | string, max: number | string, options?: any) => getSortedSetOps().zrangebyscore(key, min, max, options);
export const zrevrangebyscore = (key: string, max: number | string, min: number | string, options?: any) => getSortedSetOps().zrevrangebyscore(key, max, min, options);
export const zrank = (key: string, member: string) => getSortedSetOps().zrank(key, member);
export const zrevrank = (key: string, member: string) => getSortedSetOps().zrevrank(key, member);
export const zrem = (key: string, ...members: string[]) => getSortedSetOps().zrem(key, ...members);
export const zremrangebyscore = (key: string, min: number | string, max: number | string) => getSortedSetOps().zremrangebyscore(key, min, max);
export const zremrangebyrank = (key: string, start: number, stop: number) => getSortedSetOps().zremrangebyrank(key, start, stop);
export const zcard = (key: string) => getSortedSetOps().zcard(key);
export const zcount = (key: string, min: number | string, max: number | string) => getSortedSetOps().zcount(key, min, max);
