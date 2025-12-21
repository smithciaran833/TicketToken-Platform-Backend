/**
 * Redis Client Wrapper
 * 
 * Thin wrapper around ioredis client with enhanced error handling,
 * logging, and convenience methods.
 */

import Redis from 'ioredis';
import { RedisOperationError } from './types';
import { getRedisClient } from './connection-manager';

/**
 * Redis Client Wrapper Class
 * 
 * Provides a consistent interface for Redis operations with
 * automatic error handling and logging.
 */
export class RedisClientWrapper {
  private client: Redis | null = null;
  
  /**
   * Get the underlying Redis client
   */
  public async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Execute a Redis command with error handling
   */
  public async execute<T>(
    operation: string,
    executor: (client: Redis) => Promise<T>,
    key?: string
  ): Promise<T> {
    try {
      const client = await this.getClient();
      return await executor(client);
    } catch (error) {
      throw new RedisOperationError(
        `Redis ${operation} operation failed`,
        operation,
        key,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  
  /**
   * Execute command with retry logic
   */
  public async executeWithRetry<T>(
    operation: string,
    executor: (client: Redis) => Promise<T>,
    key?: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.execute(operation, executor, key);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries - 1) {
          // Exponential backoff
          const delay = Math.min(50 * Math.pow(2, attempt), 1000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new RedisOperationError(
      `Redis ${operation} failed after ${maxRetries} attempts`,
      operation,
      key,
      lastError
    );
  }
  
  /**
   * Ping Redis server
   */
  public async ping(): Promise<string> {
    return this.execute('PING', async (client) => client.ping());
  }
  
  /**
   * Get Redis client status
   */
  public async getStatus(): Promise<string> {
    const client = await this.getClient();
    return client.status;
  }
  
  /**
   * Check if client is ready
   */
  public async isReady(): Promise<boolean> {
    const client = await this.getClient();
    return client.status === 'ready';
  }
}

/**
 * Get a new Redis client wrapper instance
 */
export function createRedisWrapper(): RedisClientWrapper {
  return new RedisClientWrapper();
}

/**
 * Default singleton instance
 */
let defaultWrapper: RedisClientWrapper | null = null;

/**
 * Get the default Redis wrapper instance
 */
export function getRedisWrapper(): RedisClientWrapper {
  if (!defaultWrapper) {
    defaultWrapper = new RedisClientWrapper();
  }
  return defaultWrapper;
}
