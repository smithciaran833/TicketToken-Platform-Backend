/**
 * Jest setup file for venue-service tests
 * This file runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console output during tests (optional - can be commented out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
});
