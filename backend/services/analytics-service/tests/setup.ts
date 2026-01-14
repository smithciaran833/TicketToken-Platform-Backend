/**
 * Jest Test Setup
 * AUDIT FIX: TEST-1,2 - Test environment configuration
 */

import { closeRedisConnections } from '../src/config/redis';
import { closePool } from '../src/config/database';

// =============================================================================
// Environment Setup
// =============================================================================

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock secrets for testing (never use in production!)
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.INTERNAL_AUTH_SECRET = 'test-internal-secret-for-unit-tests-only';
process.env.PRIVACY_SALT = 'test-privacy-salt-for-unit-tests-only';

// Database configuration for tests
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'analytics_test';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'postgres';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'postgres';

// Redis configuration for tests
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// =============================================================================
// Global Test Utilities
// =============================================================================

// Extend Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// =============================================================================
// Global Hooks
// =============================================================================

beforeAll(async () => {
  // Any global setup before all tests
});

afterAll(async () => {
  // Close all connections after tests
  try {
    await closeRedisConnections();
  } catch (e) {
    // Ignore cleanup errors
  }
  
  try {
    await closePool();
  } catch (e) {
    // Ignore cleanup errors
  }
});

beforeEach(() => {
  // Reset any test state before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});

// =============================================================================
// Type Extensions
// =============================================================================

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}
