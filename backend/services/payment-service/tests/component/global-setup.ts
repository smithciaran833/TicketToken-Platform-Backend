// Set environment variables FIRST, before any imports that might load config
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'payment_service_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing_purposes_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_webhook_secret_for_testing';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.SERVICE_AUTH_SECRET = 'test-service-auth-secret-at-least-32-chars';
process.env.HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-characters';

import { startContainers } from './setup/test-containers';
import { runMigrations } from './setup/database';

export default async function globalSetup() {
  console.log('\n🚀 Starting test environment...\n');
  
  const { postgres, redis } = await startContainers();
  
  // Update env vars with actual container ports
  process.env.DB_HOST = postgres.getHost();
  process.env.DB_PORT = postgres.getPort().toString();
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = redis.getPort().toString();
  
  // Store for tests to use
  (global as any).__POSTGRES_CONTAINER__ = postgres;
  (global as any).__REDIS_CONTAINER__ = redis;
  
  await runMigrations();
  
  console.log('\n✅ Test environment ready\n');
}
