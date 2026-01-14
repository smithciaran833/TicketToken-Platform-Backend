/**
 * Jest Test Setup for Transfer Service
 * 
 * AUDIT FIX TST-H3: No integration test setup → Created
 * 
 * This file runs before each test file
 */

import { jest } from '@jest/globals';

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';  // Reduce log noise in tests

// Mock secrets
process.env.JWT_SECRET = 'test-jwt-secret-min-32-characters-long';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-min-32-chars';
process.env.SECRETS_PROVIDER = 'env';

// Database test configuration
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'transfer_service_test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';

// Redis test configuration
process.env.REDIS_URL = 'redis://localhost:6379';

// Solana test configuration
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.SOLANA_NETWORK = 'devnet';

// =============================================================================
// GLOBAL MOCKS
// =============================================================================

// Mock console.log to reduce noise (keep warn and error)
const originalLog = console.log;
const originalDebug = console.debug;

beforeAll(() => {
  console.log = jest.fn();
  console.debug = jest.fn();
});

afterAll(() => {
  console.log = originalLog;
  console.debug = originalDebug;
});

// =============================================================================
// GLOBAL TIMEOUT
// =============================================================================

// Increase timeout for integration tests
jest.setTimeout(30000);

// =============================================================================
// CLEANUP
// =============================================================================

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});

// =============================================================================
// CUSTOM MATCHERS
// =============================================================================

expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    return {
      pass,
      message: () => pass
        ? `expected ${received} not to be a valid UUID`
        : `expected ${received} to be a valid UUID`
    };
  },
  
  toBeValidISODate(received: string) {
    const date = new Date(received);
    const pass = !isNaN(date.getTime()) && received === date.toISOString();
    
    return {
      pass,
      message: () => pass
        ? `expected ${received} not to be a valid ISO date`
        : `expected ${received} to be a valid ISO date`
    };
  },
  
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    
    return {
      pass,
      message: () => pass
        ? `expected ${received} not to be within range ${floor} - ${ceiling}`
        : `expected ${received} to be within range ${floor} - ${ceiling}`
    };
  }
});

// =============================================================================
// TYPE DECLARATIONS FOR CUSTOM MATCHERS
// =============================================================================

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidISODate(): R;
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}
