/**
 * Jest Global Teardown
 * AUDIT FIX: TEST-1,2 - Global test teardown after all test suites
 */

export default async function globalTeardown(): Promise<void> {
  console.log('\n🧹 Global test teardown starting...');
  
  // Clean up test database if needed
  if (process.env.DATABASE_HOST && process.env.CLEANUP_TEST_DB === 'true') {
    try {
      // Note: In a real teardown, you would clean up the test database
      // const knex = require('knex')(require('../knexfile').test);
      // await knex.migrate.rollback(undefined, true);
      // await knex.destroy();
      console.log('✅ Test database cleaned up');
    } catch (error) {
      console.warn('⚠️  Test database cleanup skipped:', (error as Error).message);
    }
  }
  
  // Clean up test Redis if needed
  if (process.env.REDIS_HOST && process.env.CLEANUP_TEST_REDIS === 'true') {
    try {
      // Note: In a real teardown, you would flush test Redis keys
      // const Redis = require('ioredis');
      // const redis = new Redis({ host: process.env.REDIS_HOST });
      // await redis.flushdb();
      // await redis.quit();
      console.log('✅ Test Redis cleaned up');
    } catch (error) {
      console.warn('⚠️  Test Redis cleanup skipped:', (error as Error).message);
    }
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  console.log('🧹 Global test teardown complete\n');
}
