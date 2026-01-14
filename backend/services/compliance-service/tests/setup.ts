/**
 * Test Setup for Compliance Service
 * AUDIT FIX: TST-H2 - Test framework setup
 */
import { beforeEach, afterEach, jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Quiet logs during tests

// Mock environment variables for tests
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32-chars';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-32-characters';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/compliance_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Increase test timeout for integration tests
jest.setTimeout(30000);

// =============================================================================
// MOCK HELPERS
// =============================================================================

/**
 * Create a mock JWT token for testing
 */
export function createMockToken(payload: {
  sub: string;
  roles?: string[];
  tenantId?: string;
  exp?: number;
}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    sub: payload.sub,
    roles: payload.roles || ['user'],
    tenant_id: payload.tenantId || 'test-tenant',
    exp: payload.exp || Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000)
  })).toString('base64url');
  
  // Note: This is NOT a valid signature - only for testing without verification
  const signature = 'test-signature';
  
  return `${header}.${body}.${signature}`;
}

/**
 * Create a mock user object
 */
export function createMockUser(overrides?: Partial<{
  id: string;
  email: string;
  roles: string[];
  tenantId: string;
}>) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    roles: ['user'],
    tenantId: 'test-tenant',
    ...overrides
  };
}

/**
 * Create mock request object
 */
export function createMockRequest(overrides?: Record<string, any>) {
  return {
    requestId: 'test-request-id',
    method: 'GET',
    url: '/test',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'test-request-id'
    },
    body: {},
    query: {},
    params: {},
    user: createMockUser(),
    tenantId: 'test-tenant',
    ...overrides
  };
}

/**
 * Create mock reply object
 */
export function createMockReply() {
  const reply: any = {
    statusCode: 200,
    headers: {},
    code: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    getHeader: jest.fn((name: string) => reply.headers[name])
  };
  
  reply.code.mockImplementation((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  
  return reply;
}

// =============================================================================
// CLEANUP
// =============================================================================

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Additional cleanup after each test
});

// =============================================================================
// GLOBAL TEST UTILITIES
// =============================================================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

/**
 * Generate random test data
 */
export function randomId(): string {
  return `test-${Math.random().toString(36).substring(2, 15)}`;
}

export function randomEmail(): string {
  return `test-${randomId()}@example.com`;
}

/**
 * Sleep helper for tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Assert RFC 7807 error response format
 */
export function assertRFC7807Error(response: any, expectedStatus: number) {
  expect(response).toHaveProperty('type');
  expect(response).toHaveProperty('title');
  expect(response).toHaveProperty('status', expectedStatus);
  expect(response).toHaveProperty('detail');
  expect(response.type).toMatch(/^urn:error:/);
}

/**
 * Assert successful response
 */
export function assertSuccess(response: any) {
  expect(response).toHaveProperty('success', true);
}
