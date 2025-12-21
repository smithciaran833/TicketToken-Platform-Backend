/**
 * Redis Configuration - Migrated to @tickettoken/shared
 * 
 * CRITICAL: Uses async initialization pattern for proper connection management
 */

import type Redis from 'ioredis';
import {
  getRedisClient,
  getRedisPubClient,
  getRedisSubClient,
  getConnectionManager,
} from '@tickettoken/shared';

let redis: Redis;
let redisPub: Redis;
let redisSub: Redis;
let initialized = false;

export async function initRedis(): Promise<void> {
  if (initialized) return;
  redis = await getRedisClient();
  redisPub = await getRedisPubClient();
  redisSub = await getRedisSubClient();
  initialized = true;
  
  // Log connection status
  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully (via @tickettoken/shared)');
  });

  redis.on('ready', () => {
    console.log('Redis is ready (via @tickettoken/shared)');
  });
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized. Call initRedis() first.');
  return redis;
}

export function getPub(): Redis {
  if (!redisPub) throw new Error('Redis pub not initialized. Call initRedis() first.');
  return redisPub;
}

export function getSub(): Redis {
  if (!redisSub) throw new Error('Redis sub not initialized. Call initRedis() first.');
  return redisSub;
}

// Graceful shutdown
export async function closeRedisConnection(): Promise<void> {
  const connectionManager = getConnectionManager();
  await connectionManager.disconnect();
  initialized = false;
  console.log('Payment service Redis connection closed');
}
