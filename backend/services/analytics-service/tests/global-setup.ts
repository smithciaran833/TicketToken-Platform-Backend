/**
 * Jest Global Setup - Analytics Service
 *
 * Runs once before all test suites
 */

export default async function globalSetup(): Promise<void> {
  console.log('\n🚀 Starting Analytics Service Test Suite...\n');

  // Set test environment
  process.env.NODE_ENV = 'test';

  // JWT / Auth
  process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-minimum-32-chars';
  process.env.JWT_ALGORITHM = 'HS256';
  process.env.JWT_ISSUER = 'tickettoken-test';
  process.env.JWT_AUDIENCE = 'analytics-service-test';
  process.env.INTERNAL_AUTH_SECRET = 'test-internal-secret-for-unit-tests-only';
  process.env.PRIVACY_SALT = 'test-privacy-salt-for-unit-tests-only';

  // Database
  process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
  process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
  process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'analytics_test';
  process.env.DATABASE_USER = process.env.DATABASE_USER || 'postgres';
  process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'postgres';
  process.env.DATABASE_SSL = 'false';

  // Redis
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

  // MongoDB
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/analytics_test';

  // InfluxDB
  process.env.INFLUXDB_URL = process.env.INFLUXDB_URL || 'http://localhost:8086';
  process.env.INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN || 'test-token';
  process.env.INFLUXDB_ORG = process.env.INFLUXDB_ORG || 'test-org';
  process.env.INFLUXDB_BUCKET = process.env.INFLUXDB_BUCKET || 'analytics_test';

  // RabbitMQ
  process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

  // Log configuration
  console.log('📦 Test Configuration:');
  console.log(`   PostgreSQL: ${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}`);
  console.log(`   Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  console.log(`   MongoDB: ${process.env.MONGODB_URI}`);
  console.log(`   InfluxDB: ${process.env.INFLUXDB_URL}`);
  console.log(`   RabbitMQ: ${process.env.RABBITMQ_URL}`);
  console.log('');

  // Verify test dependencies (optional warnings)
  const requiredEnvVars = ['DATABASE_HOST', 'REDIS_HOST'];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0 && process.env.CI !== 'true') {
    console.warn(`⚠️  Missing optional env vars for integration tests: ${missingVars.join(', ')}`);
    console.warn('   Integration tests may be skipped.\n');
  }

  console.log('✅ Global setup complete\n');
}
