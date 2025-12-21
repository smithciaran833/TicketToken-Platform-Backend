import type Redis from 'ioredis';
import type { FastifyRequest } from 'fastify';
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

// Cache helper functions for backwards compatibility
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await getRedis().get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  },
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await getRedis().setex(key, ttl, serialized);
      } else {
        await getRedis().set(key, serialized);
      }
    } catch (error) {
      // Silently fail - cache is optional
    }
  },
  async del(key: string): Promise<void> {
    try {
      await getRedis().del(key);
    } catch (error) {
      // Silently fail
    }
  },
  async exists(key: string): Promise<boolean> {
    try {
      return (await getRedis().exists(key)) === 1;
    } catch (error) {
      return false;
    }
  }
};

/**
 * Fastify type augmentation
 */
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}
