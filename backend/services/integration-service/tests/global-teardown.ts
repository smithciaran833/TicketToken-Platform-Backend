/**
 * Jest Global Teardown for Integration Service
 * 
 * Runs once after all tests
 */

export default async function globalTeardown(): Promise<void> {
  console.log('\n🧹 Cleaning up Integration Service Test Suite...\n');
  
  // Close any remaining database connections
  try {
    const knex = await import('knex');
    const db = knex.default({
      client: 'pg',
      connection: {
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        database: process.env.DATABASE_NAME || 'integration_test',
        user: process.env.DATABASE_USER || 'test',
        password: process.env.DATABASE_PASSWORD || 'test'
      }
    });
    
    // Clean up test data (optional - be careful with this in shared environments)
    if (process.env.CLEANUP_TEST_DATA === 'true') {
      console.log('   Cleaning test data...');
      await db.raw('TRUNCATE TABLE integrations CASCADE');
      await db.raw('TRUNCATE TABLE sync_jobs CASCADE');
      await db.raw('TRUNCATE TABLE webhooks CASCADE');
      await db.raw('TRUNCATE TABLE field_mappings CASCADE');
    }
    
    await db.destroy();
    console.log('✅ Database connections closed');
  } catch (error) {
    // Ignore errors if database wasn't used
  }
  
  // Close any remaining Redis connections
  try {
    const Redis = (await import('ioredis')).default;
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 1,
      connectTimeout: 1000
    });
    
    // Clean up test keys (optional)
    if (process.env.CLEANUP_TEST_DATA === 'true') {
      console.log('   Cleaning Redis test data...');
      const keys = await redis.keys('integration:*:test:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
    
    await redis.quit();
    console.log('✅ Redis connections closed');
  } catch (error) {
    // Ignore errors if Redis wasn't used
  }
  
  console.log('\n✨ Integration Service Test Suite Complete!\n');
}
