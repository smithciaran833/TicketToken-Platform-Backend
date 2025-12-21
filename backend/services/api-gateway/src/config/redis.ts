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
  console.log('API Gateway Redis initialized via @tickettoken/shared');
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
  console.log('API Gateway Redis connections closed');
}

// Backwards compatibility - deprecated, use getRedis() instead
export { getRedis as redis };

/**
 * Redis key prefixes for consistent naming
 * @deprecated Use KeyBuilder from @tickettoken/shared instead
 */
export const REDIS_KEYS = {
  SESSION: 'session:',
  REFRESH_TOKEN: 'refresh_token:',
  RATE_LIMIT: 'rl:',
  API_KEY: 'api:key:',
  CACHE_VENUE: 'cache:venue:',
  CIRCUIT_BREAKER: 'cb:',
  SERVICE_DISCOVERY: 'sd:',
  SERVICE_HEALTH: 'health:',
};

/**
 * Standard TTL values in seconds
 */
export const REDIS_TTL = {
  CACHE_SHORT: 60,
  CACHE_MEDIUM: 300,
  CACHE_LONG: 3600,
  REFRESH_TOKEN: 604800,
};

/**
 * Fastify type augmentation for Redis and custom properties
 * Note: request.user is typed by @fastify/jwt - cast to AuthUser from ../types when needed
 */
declare module 'fastify' {
  interface FastifyInstance {
    redis: import('ioredis').default;
    authenticate: (request: FastifyRequest) => Promise<void>;
    services: any;
  }
  interface FastifyRequest {
    startTime?: number;
    timeoutBudget?: {
      total: number;
      remaining: number;
      deadlineMs: number;
    };
    rateLimitMax?: number;
    venueContext?: {
      venueId: string;
      userId: string;
      role: string;
      permissions: string[];
    };
  }
  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}
