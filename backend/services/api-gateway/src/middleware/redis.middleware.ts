import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('redis-middleware');

export async function setupRedisMiddleware(server: FastifyInstance) {
  try {
    const redisConfig: any = {
      host: config.redis.host || 'redis',
      port: config.redis.port || 6379,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    };

    // Only add password if it exists and is not empty
    if (config.redis.password && config.redis.password.trim() !== '') {
      redisConfig.password = config.redis.password;
    }

    const redis = new Redis(redisConfig);
    await redis.connect();
    await redis.ping();
    
    logger.info('Redis connection established successfully');
    server.decorate('redis', redis);

    server.addHook('onClose', async () => {
      await redis.quit();
      logger.info('Redis connection closed');
    });
  } catch (error) {
    logger.error({ error }, 'Redis connection failed');
    throw error; // Don't fall back to mock - fix the connection
  }
}
