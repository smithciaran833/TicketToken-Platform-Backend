import { jest } from '@jest/globals';

// Mock logger to prevent console output during tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock database connections
jest.mock('../src/config/database', () => ({
  getDb: jest.fn(),
  getAnalyticsDb: jest.fn(),
  db: {},
  analyticsDb: {},
}));

// Global test timeout
jest.setTimeout(30000);

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});
