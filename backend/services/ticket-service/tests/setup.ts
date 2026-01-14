/**
 * Jest Global Setup
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.SERVICE_SECRET = 'test-service-secret';
process.env.QR_ENCRYPTION_KEY = 'test-qr-encryption-key-32chars!!';

// Increase timeout for async operations
jest.setTimeout(10000);

// Global mocks that apply to all tests
beforeAll(() => {
  // Suppress console during tests unless explicitly needed
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Clear all mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
