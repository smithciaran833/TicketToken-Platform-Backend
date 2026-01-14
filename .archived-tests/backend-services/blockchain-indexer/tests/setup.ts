/**
 * Jest Test Setup
 * 
 * AUDIT FIX: TEST-1 - Add test framework
 * 
 * This file runs before each test file
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Quiet logs during tests

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
beforeAll(() => {
  // Any global setup before all tests
  console.log('🧪 Starting blockchain-indexer tests...');
});

afterAll(() => {
  // Any global cleanup after all tests
  console.log('✅ blockchain-indexer tests complete');
});

// Mock external services by default
jest.mock('../src/config/mongodb', () => ({
  connectMongoDB: jest.fn().mockResolvedValue(undefined),
  disconnectMongoDB: jest.fn().mockResolvedValue(undefined),
  mongoose: {
    connection: {
      readyState: 1
    }
  }
}));

// Export test utilities
export const testUtils = {
  /**
   * Generate a random UUID for testing
   */
  randomUUID: () => 'test-' + Math.random().toString(36).substring(7),

  /**
   * Generate a mock tenant ID
   */
  mockTenantId: () => '550e8400-e29b-41d4-a716-446655440000',

  /**
   * Generate a mock Solana signature
   */
  mockSignature: () => 'mock-signature-' + 'x'.repeat(60),

  /**
   * Generate a mock wallet address
   */
  mockWalletAddress: () => 'Test' + 'x'.repeat(40),

  /**
   * Wait for async operations
   */
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};
