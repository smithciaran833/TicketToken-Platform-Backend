/**
 * Jest Setup File
 * Runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests (optional)
global.console = {
  ...console,
  // Keep error and warn for debugging
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
};

// Global test timeout
jest.setTimeout(30000);
