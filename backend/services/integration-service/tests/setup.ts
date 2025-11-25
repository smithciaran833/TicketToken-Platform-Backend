/**
 * Jest Test Setup
 * 
 * Global configuration and setup for all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.KMS_KEY_ID = 'test-kms-key-id';

// Mock environment variables that might be needed
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/integration_service_test';
process.env.REDIS_URL = 'redis://localhost:6379/0';

// Extend Jest timeout for async operations
jest.setTimeout(10000);

// Global test utilities
global.console = {
  ...console,
  // Suppress console logs during tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep error and warn for debugging
  error: console.error,
  warn: console.warn,
};

// Clean up after each test
afterEach(() => {
  jest.clearAllTimers();
});

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});
