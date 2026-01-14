// @ts-nocheck
/**
 * Scanning Service Test Setup
 *
 * Configures the test environment, mocks external dependencies,
 * and provides shared utilities for all tests.
 */

// =============================================================================
// Environment Setup
// =============================================================================

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-characters-long';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/scanning_test';
process.env.REDIS_URL = 'redis://localhost:6379';

// =============================================================================
// Global Mocks
// =============================================================================

// Mock winston logger
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    level: 'error',
    transports: [],
    defaultMeta: { service: 'scanning-service' }
  };
  
  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      errors: jest.fn(),
      json: jest.fn(),
      colorize: jest.fn(),
      simple: jest.fn()
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn()
    }
  };
});

// Mock AWS SDK
jest.mock('@aws-sdk/client-secrets-manager');

// =============================================================================
// Global Test Utilities
// =============================================================================

afterEach(() => {
  jest.clearAllMocks();
});

jest.setTimeout(30000);
