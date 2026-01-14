/**
 * Global Test Setup for Marketplace Service
 * 
 * Issues Fixed:
 * - TST-1: Empty unit test folder → Test infrastructure
 * - TST-2: Empty integration test folder → Test setup
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret';
process.env.DATABASE_URL = 'postgresql://localhost:5432/marketplace_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock external services by default
jest.mock('../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(() => 0),
    ttl: jest.fn(() => -2),
    multi: jest.fn(() => ({
      set: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn(() => Promise.resolve([]))
    })),
    keys: jest.fn(() => []),
    eval: jest.fn()
  })),
  initRedis: jest.fn(),
  closeRedisConnections: jest.fn()
}));

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

// Global beforeAll
beforeAll(async () => {
  // Silence console during tests unless explicitly needed
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

// Global afterAll
afterAll(async () => {
  // Cleanup any resources
  jest.restoreAllMocks();
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

// Export test utilities
export const createMockRequest = (overrides: any = {}) => ({
  headers: {},
  query: {},
  params: {},
  body: {},
  method: 'GET',
  url: '/test',
  id: 'test-request-id',
  ip: '127.0.0.1',
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn()
  },
  ...overrides
});

export const createMockReply = (overrides: any = {}) => ({
  status: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  header: jest.fn().mockReturnThis(),
  code: jest.fn().mockReturnThis(),
  statusCode: 200,
  getHeader: jest.fn(),
  ...overrides
});

export const createMockDone = () => jest.fn();

// UUID generator for tests
export const generateTestUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
