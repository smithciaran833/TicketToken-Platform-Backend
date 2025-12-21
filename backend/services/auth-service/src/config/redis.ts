/**
 * Redis Configuration - Migrated to @tickettoken/shared
 * 
 * Uses lazy initialization pattern for backwards compatibility
 */

import type Redis from 'ioredis';
import { getRedisClient, getRedisPubClient, getRedisSubClient, getConnectionManager } from '@tickettoken/shared';

let redis: Redis;
let redisPub: Redis;
let redisSub: Redis;
let initialized = false;

/**
 * Initialize Redis clients
 * Must be called during application startup
 */
export async function initRedis(): Promise<void> {
  if (initialized) return;
  
  redis = await getRedisClient();
  redisPub = await getRedisPubClient();
  redisSub = await getRedisSubClient();
  initialized = true;
  
  console.log('Auth service Redis initialized via @tickettoken/shared');
}

/**
 * Get the main Redis client
 * @throws Error if Redis not initialized
 */
export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redis;
}

/**
 * Get the Pub Redis client
 * @throws Error if Redis not initialized
 */
export function getPub(): Redis {
  if (!redisPub) {
    throw new Error('Redis pub not initialized. Call initRedis() first.');
  }
  return redisPub;
}

/**
 * Get the Sub Redis client
 * @throws Error if Redis not initialized
 */
export function getSub(): Redis {
  if (!redisSub) {
    throw new Error('Redis sub not initialized. Call initRedis() first.');
  }
  return redisSub;
}

/**
 * Close all Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  const connectionManager = getConnectionManager();
  await connectionManager.disconnect();
  initialized = false;
  console.log('Auth service Redis connections closed');
}

// Backwards compatibility - deprecated, use getRedis() instead
export { getRedis as redis };
