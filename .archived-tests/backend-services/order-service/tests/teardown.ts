/**
 * HIGH: Global test teardown
 * FT-3, KD-4: Ensures proper cleanup after all tests complete
 * 
 * This file handles:
 * - Database connection cleanup
 * - Redis connection cleanup
 * - Any other resources that need to be released
 */

import { closeDatabase } from '../src/config/database';
import { RedisService } from '../src/services/redis.service';
import { logger } from '../src/utils/logger';

export default async function globalTeardown(): Promise<void> {
  logger.info('Starting global test teardown');

  try {
    // KD-4: Close database connections
    await closeDatabase();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Failed to close database connections', { error });
  }

  try {
    // Close Redis connections
    const redis = RedisService.getClient();
    if (redis) {
      await redis.quit();
      logger.info('Redis connections closed');
    }
  } catch (error) {
    logger.error('Failed to close Redis connections', { error });
  }

  // Allow time for connections to fully close
  await new Promise((resolve) => setTimeout(resolve, 500));

  logger.info('Global test teardown complete');
}
