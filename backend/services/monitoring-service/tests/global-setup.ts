/**
 * Jest Global Setup for Monitoring Service
 *
 * Runs once before all tests
 */

export default async function globalSetup(): Promise<void> {
  console.log('\n🚀 Starting Monitoring Service Test Suite...\n');

  // Set test environment
  process.env.NODE_ENV = 'test';

  // Set required environment variables
  process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-characters-required';
  process.env.JWT_ALGORITHM = 'HS256';
  process.env.JWT_ISSUER = 'tickettoken-test';
  process.env.JWT_AUDIENCE = 'monitoring-service-test';

  // Database config
  process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
  process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
  process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'monitoring_test';
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

  console.log('\n');
}
