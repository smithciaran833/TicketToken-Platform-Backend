import { jest } from '@jest/globals';

// Mock @tickettoken/shared module
jest.mock('@tickettoken/shared', () => ({
  withLock: jest.fn((key: string, fn: () => any) => fn()),
  LockKeys: {
    LISTING: 'listing',
    PURCHASE: 'purchase'
  },
  publishSearchSync: jest.fn()
}));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'marketplace_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.JWT_SECRET = 'test-secret';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';

// Set test timeout
jest.setTimeout(30000);

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
      debug: jest.fn(),
    })),
  },
}));
