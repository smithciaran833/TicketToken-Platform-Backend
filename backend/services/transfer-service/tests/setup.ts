import { Pool } from 'pg';

/**
 * TEST SETUP
 * 
 * Global test configuration and setup
 * Phase 4: Comprehensive Testing
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.DB_PASSWORD = 'test-password';

// Mock pool for tests
export const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
  on: jest.fn()
} as unknown as Pool;

// Mock logger to prevent console spam in tests
jest.mock('../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  jest.clearAllMocks();
});
