// Test setup
process.env.NODE_ENV = 'test';
process.env.RPC_URL = 'https://polygon-mumbai.infura.io/v3/test';
process.env.CONTRACT_ADDRESS = '0xTestContract';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.START_BLOCK = '0';
process.env.INDEXER_PORT = '3021';

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
