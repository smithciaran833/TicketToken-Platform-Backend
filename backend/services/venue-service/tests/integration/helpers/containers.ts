import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { MongoDBContainer, StartedMongoDBContainer } from '@testcontainers/mongodb';

/**
 * Container instances - shared across all tests in a run
 */
let postgresContainer: StartedPostgreSqlContainer | null = null;
let redisContainer: StartedRedisContainer | null = null;
let mongoContainer: StartedMongoDBContainer | null = null;

/**
 * Container configuration matching production defaults
 */
const POSTGRES_CONFIG = {
  database: 'venue_test',
  username: 'test_user',
  password: 'test_password',
};

/**
 * Start PostgreSQL container
 */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  if (postgresContainer) {
    return postgresContainer;
  }

  console.log('[Containers] Starting PostgreSQL...');
  
  postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase(POSTGRES_CONFIG.database)
    .withUsername(POSTGRES_CONFIG.username)
    .withPassword(POSTGRES_CONFIG.password)
    .withExposedPorts(5432)
    .start();

  console.log(`[Containers] PostgreSQL started on port ${postgresContainer.getMappedPort(5432)}`);
  
  return postgresContainer;
}

/**
 * Start Redis container
 */
export async function startRedis(): Promise<StartedRedisContainer> {
  if (redisContainer) {
    return redisContainer;
  }

  console.log('[Containers] Starting Redis...');
  
  redisContainer = await new RedisContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  console.log(`[Containers] Redis started on port ${redisContainer.getMappedPort(6379)}`);
  
  return redisContainer;
}

/**
 * Start MongoDB container
 */
export async function startMongoDB(): Promise<StartedMongoDBContainer> {
  if (mongoContainer) {
    return mongoContainer;
  }

  console.log('[Containers] Starting MongoDB...');
  
  mongoContainer = await new MongoDBContainer('mongo:7')
    .withExposedPorts(27017)
    .start();

  console.log(`[Containers] MongoDB started on port ${mongoContainer.getMappedPort(27017)}`);
  
  return mongoContainer;
}

/**
 * Start all containers in parallel
 */
export async function startAllContainers(): Promise<void> {
  console.log('[Containers] Starting all containers...');
  const startTime = Date.now();

  await Promise.all([
    startPostgres(),
    startRedis(),
    startMongoDB(),
  ]);

  const elapsed = Date.now() - startTime;
  console.log(`[Containers] All containers started in ${elapsed}ms`);
}

/**
 * Get connection URLs for all containers
 * Sets environment variables to match what the app expects
 */
export function getContainerUrls(): {
  postgres: { host: string; port: number; database: string; user: string; password: string };
  redis: { host: string; port: number };
  mongodb: { uri: string };
} {
  if (!postgresContainer || !redisContainer || !mongoContainer) {
    throw new Error('Containers not started. Call startAllContainers() first.');
  }

  return {
    postgres: {
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      database: POSTGRES_CONFIG.database,
      user: POSTGRES_CONFIG.username,
      password: POSTGRES_CONFIG.password,
    },
    redis: {
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
    },
    mongodb: {
      uri: mongoContainer.getConnectionString() + '/venue_test?directConnection=true',
    },
  };
}

/**
 * Set environment variables for the app to use container connections
 */
export function setContainerEnvVars(): void {
  const urls = getContainerUrls();

  // PostgreSQL
  process.env.DB_HOST = urls.postgres.host;
  process.env.DB_PORT = urls.postgres.port.toString();
  process.env.DB_NAME = urls.postgres.database;
  process.env.DB_USER = urls.postgres.user;
  process.env.DB_PASSWORD = urls.postgres.password;

  // Redis
  process.env.REDIS_HOST = urls.redis.host;
  process.env.REDIS_PORT = urls.redis.port.toString();
  process.env.REDIS_PASSWORD = '';

  // MongoDB
  process.env.MONGODB_URI = urls.mongodb.uri;

  // Test environment settings
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';

  console.log('[Containers] Environment variables set');
}

/**
 * Stop all containers
 */
export async function stopAllContainers(): Promise<void> {
  console.log('[Containers] Stopping all containers...');

  const stopPromises: Promise<void>[] = [];

  if (postgresContainer) {
    stopPromises.push(
      postgresContainer.stop().then(() => {
        console.log('[Containers] PostgreSQL stopped');
        postgresContainer = null;
      })
    );
  }

  if (redisContainer) {
    stopPromises.push(
      redisContainer.stop().then(() => {
        console.log('[Containers] Redis stopped');
        redisContainer = null;
      })
    );
  }

  if (mongoContainer) {
    stopPromises.push(
      mongoContainer.stop().then(() => {
        console.log('[Containers] MongoDB stopped');
        mongoContainer = null;
      })
    );
  }

  await Promise.all(stopPromises);
  console.log('[Containers] All containers stopped');
}

/**
 * Get individual container instances (for direct access if needed)
 */
export function getPostgresContainer(): StartedPostgreSqlContainer | null {
  return postgresContainer;
}

export function getRedisContainer(): StartedRedisContainer | null {
  return redisContainer;
}

export function getMongoContainer(): StartedMongoDBContainer | null {
  return mongoContainer;
}
