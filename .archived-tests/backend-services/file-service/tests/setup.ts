import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests

// Mock external services by default
jest.mock('../src/services/virus-scan.service');
jest.mock('../src/services/cache.service');

// Global test timeout
jest.setTimeout(10000);

// Suppress console logs during tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
};

// Clean up after all tests
afterAll(async () => {
  // Close database connections, Redis, etc.
  await new Promise(resolve => setTimeout(resolve, 500));
});
