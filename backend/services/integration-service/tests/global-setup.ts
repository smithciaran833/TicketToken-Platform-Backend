/**
 * Jest Global Setup for Integration Service
 * 
 * Runs once before all tests
 */

export default async function globalSetup(): Promise<void> {
  console.log('\n🚀 Starting Integration Service Test Suite...\n');
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Set required environment variables
  process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-characters-required';
  process.env.JWT_ALGORITHM = 'HS256';
  process.env.JWT_ISSUER = 'tickettoken-test';
  process.env.JWT_AUDIENCE = 'integration-service-test';
  process.env.INTERNAL_SERVICE_KEY = 'test-internal-service-key-for-jest';
  
  // Database config
  process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
  process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
  process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'integration_test';
  process.env.DATABASE_USER = process.env.DATABASE_USER || 'test';
  process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'test';
  process.env.DATABASE_SSL = 'false';
  
  // Redis config
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
  
  // Log configuration
  console.log('📦 Test Configuration:');
  console.log(`   Database: ${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}`);
  console.log(`   Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  console.log('');
  
  // Verify database connection (optional - skip if no DB)
  try {
    const knex = await import('knex');
    const db = knex.default({
      client: 'pg',
      connection: {
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        database: process.env.DATABASE_NAME,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD
      }
    });
    
    await db.raw('SELECT 1');
    console.log('✅ Database connection verified');
    await db.destroy();
  } catch (error) {
    console.warn('⚠️  Database not available for tests (some tests may be skipped)');
  }
  
  // Verify Redis connection (optional - skip if no Redis)
  try {
    const Redis = (await import('ioredis')).default;
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 1,
      connectTimeout: 3000
    });
    
    await redis.ping();
    console.log('✅ Redis connection verified');
    await redis.quit();
  } catch (error) {
    console.warn('⚠️  Redis not available for tests (some tests may be skipped)');
  }
  
  console.log('\n');
}
