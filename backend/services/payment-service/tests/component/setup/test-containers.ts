/**
 * Test Containers Setup
 * 
 * Spins up real PostgreSQL and Redis containers for component tests.
 */

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Client, Pool } from 'pg';
import Redis from 'ioredis';

let postgresContainer: StartedPostgreSqlContainer | null = null;
let redisContainer: StartedRedisContainer | null = null;
let pgPool: Pool | null = null;
let redisClient: Redis | null = null;

const CONFIG = {
  postgres: {
    image: 'postgres:16-alpine',
    database: 'payment_service_test',
    username: 'test_user',
    password: 'test_password',
  },
  redis: {
    image: 'redis:7-alpine',
  },
};

/**
 * Start PostgreSQL container
 */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  if (postgresContainer) return postgresContainer;

  console.log('🐘 Starting PostgreSQL container...');
  
  postgresContainer = await new PostgreSqlContainer(CONFIG.postgres.image)
    .withDatabase(CONFIG.postgres.database)
    .withUsername(CONFIG.postgres.username)
    .withPassword(CONFIG.postgres.password)
    .withReuse()
    .start();

  console.log(`✅ PostgreSQL running on port ${postgresContainer.getPort()}`);
  return postgresContainer;
}

/**
 * Start Redis container
 */
export async function startRedis(): Promise<StartedRedisContainer> {
  if (redisContainer) return redisContainer;

  console.log('🔴 Starting Redis container...');
  
  redisContainer = await new RedisContainer(CONFIG.redis.image)
    .withReuse()
    .start();

  console.log(`✅ Redis running on port ${redisContainer.getPort()}`);
  return redisContainer;
}

/**
 * Start both containers
 */
export async function startContainers(): Promise<{
  postgres: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
}> {
  const [postgres, redis] = await Promise.all([startPostgres(), startRedis()]);
  return { postgres, redis };
}

/**
 * Get PostgreSQL connection config
 */
export function getPostgresConfig() {
  if (!postgresContainer) {
    throw new Error('PostgreSQL container not started');
  }
  return {
    host: postgresContainer.getHost(),
    port: postgresContainer.getPort(),
    database: CONFIG.postgres.database,
    user: CONFIG.postgres.username,
    password: CONFIG.postgres.password,
  };
}

/**
 * Get PostgreSQL connection string
 */
export function getPostgresConnectionString(): string {
  if (!postgresContainer) {
    throw new Error('PostgreSQL container not started');
  }
  return postgresContainer.getConnectionUri();
}

/**
 * Get Redis config
 */
export function getRedisConfig() {
  if (!redisContainer) {
    throw new Error('Redis container not started');
  }
  return {
    host: redisContainer.getHost(),
    port: redisContainer.getPort(),
  };
}

/**
 * Get PostgreSQL pool (creates one if needed)
 */
export async function getPgPool(): Promise<Pool> {
  if (pgPool) return pgPool;
  
  if (!postgresContainer) await startPostgres();
  
  pgPool = new Pool(getPostgresConfig());
  return pgPool;
}

/**
 * Get Redis client (creates one if needed)
 */
export async function getRedisClient(): Promise<Redis> {
  if (redisClient) return redisClient;
  
  if (!redisContainer) await startRedis();
  
  const config = getRedisConfig();
  redisClient = new Redis({
    host: config.host,
    port: config.port,
  });
  return redisClient;
}

/**
 * Stop all containers and close connections
 */
export async function stopContainers(): Promise<void> {
  console.log('🛑 Stopping containers...');

  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }

  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }

  if (postgresContainer) {
    await postgresContainer.stop();
    postgresContainer = null;
  }

  if (redisContainer) {
    await redisContainer.stop();
    redisContainer = null;
  }

  console.log('✅ Containers stopped');
}

/**
 * Jest global setup helper
 */
export async function globalSetup(): Promise<void> {
  await startContainers();
}

/**
 * Jest global teardown helper
 */
export async function globalTeardown(): Promise<void> {
  await stopContainers();
}
