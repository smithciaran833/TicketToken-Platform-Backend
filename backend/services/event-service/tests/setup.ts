/**
 * Jest setup file for event-service tests
 * This file runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Set default test env vars
process.env.SERVICE_NAME = 'event-service';
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests

// Global test timeout
jest.setTimeout(30000);

// Mock ioredis if needed for service tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    scan: jest.fn().mockResolvedValue(['0', []]),
    ping: jest.fn().mockResolvedValue('PONG'),
    info: jest.fn().mockResolvedValue('redis_version:7.0.0'),
    flushall: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    on: jest.fn(),
    status: 'ready',
  }));
});

// Suppress console output during tests (optional - can be commented out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
  jest.clearAllMocks();
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
