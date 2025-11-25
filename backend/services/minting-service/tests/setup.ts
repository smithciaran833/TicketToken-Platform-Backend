import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.SOLANA_NETWORK = 'devnet';
process.env.WALLET_PATH = './test-wallet.json';
process.env.INTERNAL_SERVICE_SECRET = 'test-secret-key-minimum-32-characters-long';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-minimum-32-characters-long';
process.env.IPFS_PROVIDER = 'pinata';
process.env.PINATA_API_KEY = 'test-api-key';
process.env.PINATA_SECRET_API_KEY = 'test-secret-key';
process.env.MIN_SOL_BALANCE = '0.1';
process.env.BALANCE_CHECK_INTERVAL = '60000';

// Increase timeout for tests that interact with blockchain
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
