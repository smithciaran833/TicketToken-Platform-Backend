/**
 * Jest Test Setup for Integration Service
 * 
 * Runs before each test file
 */

import { jest } from '@jest/globals';

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Set required config for tests
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-characters-required';
process.env.JWT_ALGORITHM = 'HS256';
process.env.JWT_ISSUER = 'tickettoken-test';
process.env.JWT_AUDIENCE = 'integration-service-test';
process.env.INTERNAL_SERVICE_KEY = 'test-internal-service-key-for-jest';

// Database config (will be set by global setup)
process.env.DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';
process.env.DATABASE_PORT = process.env.DATABASE_PORT || '5432';
process.env.DATABASE_NAME = process.env.DATABASE_NAME || 'integration_test';
process.env.DATABASE_USER = process.env.DATABASE_USER || 'test';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'test';
process.env.DATABASE_SSL = 'false';

// Redis config
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// =============================================================================
// GLOBAL MOCKS
// =============================================================================

// Mock logger to reduce noise
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }))
  },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

// =============================================================================
// GLOBAL TEST HELPERS
// =============================================================================

// Extend Jest expect
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false
      };
    }
  }
});

// =============================================================================
// GLOBAL HOOKS
// =============================================================================

// Increase timeout for integration tests
jest.setTimeout(30000);

// Clean up after each test
afterEach(async () => {
  jest.clearAllMocks();
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// =============================================================================
// TYPE DECLARATIONS
// =============================================================================

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

export {};
