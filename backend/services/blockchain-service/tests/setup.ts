// Test setup
process.env.NODE_ENV = 'test';
process.env.BLOCKCHAIN_NETWORK = 'testnet';
process.env.RPC_URL = 'https://polygon-mumbai.infura.io/v3/test';
process.env.PRIVATE_KEY = '0xtest_private_key';
process.env.CONTRACT_ADDRESS = '0xtest_contract_address';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.BLOCKCHAIN_SERVICE_PORT = '3015';

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
