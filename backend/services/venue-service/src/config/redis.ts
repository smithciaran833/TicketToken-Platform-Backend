import type Redis from 'ioredis';
import type { AwilixContainer } from 'awilix';
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

/**
 * Fastify type augmentation
 */
declare module 'fastify' {
  interface FastifyInstance {
    container: AwilixContainer;
  }
  interface FastifyRequest {
    startTime?: number;
  }
}
