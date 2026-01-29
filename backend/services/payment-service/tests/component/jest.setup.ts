// Environment variables should already be set by global-setup.ts
// But set them again in case tests run in isolation
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'payment_service_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing_purposes_only';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_webhook_secret_for_testing';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.SERVICE_AUTH_SECRET = 'test-service-auth-secret-at-least-32-chars';
process.env.HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-characters';

import { cleanupBetweenTests } from './setup/database';
import { resetAllMocks } from './setup/mocks';

// Clean up before each test
beforeEach(async () => {
  await cleanupBetweenTests();
  resetAllMocks();
});
