/**
 * Redis Configuration - Migrated to @tickettoken/shared
 * 
 * CRITICAL: Uses async initialization pattern for proper connection management
 */

import type Redis from 'ioredis';
import {
  getRedisClient as getSharedRedisClient,
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
  redis = await getSharedRedisClient();
  redisPub = await getRedisPubClient();
  redisSub = await getRedisSubClient();
  initialized = true;
  
  // Log connection status
  redis.on('connect', () => {
    console.log('Analytics Redis client connected (via @tickettoken/shared)');
  });
  
  redis.on('ready', () => {
    console.log('Analytics Redis client ready (via @tickettoken/shared)');
  });
  
  redis.on('error', (error) => {
    console.error('Analytics Redis client error:', error);
  });
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized. Call initRedis() first.');
  return redis;
}

// Alias for getRedis - used by some controllers
export const getRedisClient = getRedis;

export function getPub(): Redis {
  if (!redisPub) throw new Error('Redis pub not initialized. Call initRedis() first.');
  return redisPub;
}

export function getSub(): Redis {
  if (!redisSub) throw new Error('Redis sub not initialized. Call initRedis() first.');
  return redisSub;
}

/**
 * Check Redis health status
 * Used by health check endpoints
 */
export async function checkRedisHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    if (!redis) {
      return { healthy: false, latencyMs: 0, error: 'Redis not initialized' };
    }
    
    await redis.ping();
    const latencyMs = Date.now() - start;
    
    return { healthy: true, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return { 
      healthy: false, 
      latencyMs, 
      error: (error as Error).message 
    };
  }
}

// Graceful shutdown
export async function closeRedisConnections(): Promise<void> {
  const connectionManager = getConnectionManager();
  await connectionManager.disconnect();
  initialized = false;
  console.log('Analytics service Redis connections closed');
}
