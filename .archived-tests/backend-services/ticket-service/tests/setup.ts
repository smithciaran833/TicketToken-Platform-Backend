/**
 * Jest Test Setup File
 * 
 * MEDIUM Fix: No setupFilesAfterEnv - setupFilesAfterEnv absent
 * 
 * This file is executed after the test environment is set up
 * and before each test file is run.
 */

import { jest } from '@jest/globals';

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock secrets for testing (DO NOT use in production)
process.env.JWT_SECRET = 'test-jwt-secret-min-64-chars-for-testing-purposes-only-not-for-prod';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-service-secret-min-64-chars-for-testing-purposes-only';
process.env.QR_ENCRYPTION_KEY = 'test-qr-encryption-key-32chars';

// Mock database URL
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/tickettoken_test';

// Mock Redis URL
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';

// Mock RabbitMQ URL
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

// Service URLs for integration tests
process.env.EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL || 'http://localhost:3003';
process.env.PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3006';
process.env.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

// =============================================================================
// GLOBAL TEST TIMEOUT
// =============================================================================

jest.setTimeout(30000); // 30 second timeout for slow integration tests

// =============================================================================
// GLOBAL MOCKS
// =============================================================================

// Mock logger to reduce noise (but keep errors)
jest.mock('../src/utils/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: console.error, // Keep errors visible
      trace: jest.fn(),
    }),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: console.error,
    trace: jest.fn(),
  }
}));

// =============================================================================
// GLOBAL HELPERS
// =============================================================================

/**
 * Wait for a specified number of milliseconds
 */
export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate a random UUID for testing
 */
export const generateTestUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Create a mock tenant context for testing
 */
export const createMockTenantContext = (tenantId?: string) => ({
  tenantId: tenantId || generateTestUUID(),
  userId: generateTestUUID(),
  role: 'user',
});

/**
 * Create mock authentication headers
 */
export const createMockAuthHeaders = (tenantId?: string, userId?: string) => ({
  'Authorization': 'Bearer mock-test-token',
  'X-Tenant-Id': tenantId || generateTestUUID(),
  'X-User-Id': userId || generateTestUUID(),
});

// =============================================================================
// CLEANUP
// =============================================================================

// Global afterEach cleanup
afterEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
});

// Global afterAll cleanup
afterAll(async () => {
  // Give time for pending operations to complete
  await sleep(100);
});

// =============================================================================
// CONSOLE WARNINGS FOR COMMON ISSUES
// =============================================================================

// Suppress specific console warnings in tests
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  // Suppress known noisy warnings
  const message = args[0]?.toString() || '';
  if (message.includes('ExperimentalWarning')) return;
  if (message.includes('DeprecationWarning')) return;
  originalWarn.apply(console, args);
};
