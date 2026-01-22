/**
 * Jest Test Setup
 *
 * Global configuration, mocks, and utilities for HMAC module tests.
 */

// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.USE_NEW_HMAC = 'true';
process.env.INTERNAL_HMAC_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.INTERNAL_API_KEY = 'test-api-key';
process.env.SERVICE_NAME = 'test-service';

// Mock Redis client
const mockRedisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  quit: jest.fn(),
  disconnect: jest.fn(),
};

// Mock the Redis connection manager
jest.mock('../src/redis/connection-manager', () => ({
  getRedisClient: jest.fn().mockResolvedValue(mockRedisClient),
  closeRedisConnection: jest.fn().mockResolvedValue(undefined),
}));

// Export mock for use in tests
export { mockRedisClient };

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Reset all mocks
  jest.clearAllMocks();
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  // Reset Redis mock default behaviors
  mockRedisClient.set.mockResolvedValue('OK');
  mockRedisClient.get.mockResolvedValue(null);
  mockRedisClient.del.mockResolvedValue(1);
  mockRedisClient.exists.mockResolvedValue(0);
  mockRedisClient.ttl.mockResolvedValue(-2);
});

/**
 * Test utilities
 */
export const testUtils = {
  /**
   * Generate a valid test timestamp (current time)
   */
  validTimestamp: () => Date.now(),

  /**
   * Generate an expired timestamp (2 minutes ago)
   */
  expiredTimestamp: () => Date.now() - 120000,

  /**
   * Generate a future timestamp (2 minutes ahead)
   */
  futureTimestamp: () => Date.now() + 120000,

  /**
   * Generate a valid nonce (UUID format)
   */
  validNonce: () => 'f47ac10b-58cc-4372-a567-0e02b2c3d479',

  /**
   * Generate test request headers with HMAC
   */
  createHmacHeaders: (overrides: Record<string, string> = {}) => ({
    'x-internal-service': 'test-service',
    'x-internal-timestamp': Date.now().toString(),
    'x-internal-nonce': 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'x-internal-signature': 'test-signature',
    'x-tenant-id': '550e8400-e29b-41d4-a716-446655440000',
    ...overrides,
  }),

  /**
   * Wait for a specified time (useful for timing tests)
   */
  wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};
