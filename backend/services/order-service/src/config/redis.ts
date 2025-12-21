import type Redis from 'ioredis';
import { getRedisClient, getRedisPubClient, getRedisSubClient, getConnectionManager } from '@tickettoken/shared';

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
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized');
  return redis;
}

export function getPub(): Redis {
  if (!redisPub) throw new Error('Redis pub not initialized');
  return redisPub;
}

export function getSub(): Redis {
  if (!redisSub) throw new Error('Redis sub not initialized');
  return redisSub;
}

export async function closeRedisConnections(): Promise<void> {
  const connectionManager = getConnectionManager();
  await connectionManager.disconnect();
  initialized = false;
}

// Helper functions for backwards compatibility with RedisService
export async function get(key: string): Promise<string | null> {
  return getRedis().get(key);
}

export async function set(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds) {
    await getRedis().setex(key, ttlSeconds, value);
  } else {
    await getRedis().set(key, value);
  }
}

export async function del(key: string): Promise<number> {
  return getRedis().del(key);
}
