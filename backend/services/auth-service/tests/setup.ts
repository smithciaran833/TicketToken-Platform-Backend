// Jest setup file for auth-service tests
import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/tickettoken_auth_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests (optional)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  // Keep log for debugging if needed
  log: console.log,
};

// Global test utilities
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  jest.restoreAllMocks();
});

// Export for use in tests if needed
export {};
