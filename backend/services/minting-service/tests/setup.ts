/**
 * Jest Setup File for Minting Service Tests
 *
 * This file runs before all tests and sets up the testing environment.
 */
// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-32-chars-min';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/minting_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.MIN_SOL_BALANCE = '0.01';
process.env.MINT_CONCURRENCY = '5';
// Increase timeout for async tests
jest.setTimeout(30000);
// Global beforeAll - runs once before all tests
beforeAll(async () => {
  // Silence console during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  }
});
// Global afterAll - runs once after all tests
afterAll(async () => {
  // Restore console
  jest.restoreAllMocks();
});
// Global beforeEach - runs before each test
beforeEach(() => {
  // Clear all mocks between tests
  jest.clearAllMocks();
});
// Export empty object for TypeScript
export {};
