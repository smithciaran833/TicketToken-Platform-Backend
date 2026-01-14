/**
 * Test Helpers and Utilities
 * 
 * AUDIT FIX: TST-11 - No test utilities
 * 
 * Provides common test utilities, mocks, and helpers for all test types.
 */

import jwt from 'jsonwebtoken';
import { 
  TEST_TENANT_ID, 
  TEST_USER_ID,
  VALID_WALLET_ADDRESS,
  VALID_SIGNATURE 
} from '../fixtures';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

export const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';

export const TEST_CONFIG = {
  database: {
    host: 'localhost',
    port: 5432,
    database: 'blockchain_indexer_test',
    user: 'test_user',
    password: 'test_password'
  },
  mongodb: {
    uri: 'mongodb://localhost:27017/blockchain_indexer_test'
  },
  redis: {
    host: 'localhost',
    port: 6379
  },
  solana: {
    rpcUrl: 'http://localhost:8899'
  }
};

// =============================================================================
// JWT/AUTH HELPERS
// =============================================================================

export interface TokenPayload {
  userId?: string;
  serviceId?: string;
  tenantId?: string;
  roles?: string[];
  scopes?: string[];
  exp?: number;
}

/**
 * Generate a test JWT token
 */
export function generateTestToken(payload: TokenPayload = {}): string {
  const defaultPayload = {
    sub: payload.serviceId || payload.userId || TEST_USER_ID,
    userId: payload.userId,
    serviceId: payload.serviceId,
    tenant_id: payload.tenantId || TEST_TENANT_ID,
    roles: payload.roles || [],
    scopes: payload.scopes || [],
    iss: 'tickettoken-auth-service',
    aud: ['blockchain-indexer'],
    iat: Math.floor(Date.now() / 1000),
    exp: payload.exp || Math.floor(Date.now() / 1000) + 3600 // 1 hour
  };

  return jwt.sign(defaultPayload, TEST_JWT_SECRET);
}

/**
 * Generate an expired JWT token
 */
export function generateExpiredToken(payload: TokenPayload = {}): string {
  return generateTestToken({
    ...payload,
    exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
  });
}

/**
 * Generate a service-to-service token
 */
export function generateS2SToken(serviceName: string = 'minting-service'): string {
  return generateTestToken({
    serviceId: serviceName,
    tenantId: 'system',
    roles: ['service']
  });
}

/**
 * Generate admin token
 */
export function generateAdminToken(tenantId: string = TEST_TENANT_ID): string {
  return generateTestToken({
    userId: TEST_USER_ID,
    tenantId,
    roles: ['admin']
  });
}

/**
 * Create authorization headers
 */
export function createAuthHeaders(token?: string): Record<string, string> {
  const authToken = token || generateTestToken();
  return {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };
}

// =============================================================================
// DATABASE HELPERS
// =============================================================================

let testDbPool: any = null;

/**
 * Setup test database connection
 */
export async function setupTestDatabase(): Promise<void> {
  // Implementation depends on actual database module
  // This is a placeholder
  console.log('Setting up test database...');
}

/**
 * Teardown test database connection
 */
export async function teardownTestDatabase(): Promise<void> {
  if (testDbPool) {
    await testDbPool.end();
    testDbPool = null;
  }
}

/**
 * Seed test data
 */
export async function seedTestData(): Promise<void> {
  // Seed transactions, wallets, etc.
  console.log('Seeding test data...');
}

/**
 * Clear all test data
 */
export async function clearTestData(): Promise<void> {
  // Clear all tables
  console.log('Clearing test data...');
}

/**
 * Execute query with test tenant context
 */
export async function queryWithTenant(
  query: string, 
  params: any[] = [],
  tenantId: string = TEST_TENANT_ID
): Promise<any> {
  // Set tenant context and execute query
  // Placeholder implementation
}

// =============================================================================
// MOCK HELPERS
// =============================================================================

/**
 * Create mock Solana RPC
 */
export const mockSolanaRpc = {
  _getSlotResponse: 0,
  _getTransactionResponse: null as any,
  _getBlockResponse: null as any,
  
  reset(): void {
    this._getSlotResponse = 0;
    this._getTransactionResponse = null;
    this._getBlockResponse = null;
  },
  
  onGetSlot(): { returns: (value: number) => void } {
    return {
      returns: (value: number) => { this._getSlotResponse = value; }
    };
  },
  
  onGetTransaction(signature: string): { returns: (value: any) => void } {
    return {
      returns: (value: any) => { this._getTransactionResponse = value; }
    };
  },
  
  onGetBlock(slot: number): { returns: (value: any) => void } {
    return {
      returns: (value: any) => { this._getBlockResponse = value; }
    };
  },
  
  createMock(): any {
    return {
      getSlot: jest.fn().mockResolvedValue(this._getSlotResponse),
      getTransaction: jest.fn().mockResolvedValue(this._getTransactionResponse),
      getBlock: jest.fn().mockResolvedValue(this._getBlockResponse),
      getSignaturesForAddress: jest.fn().mockResolvedValue([]),
      getAccountInfo: jest.fn().mockResolvedValue(null)
    };
  }
};

/**
 * Create mock marketplace API
 */
export const mockMarketplaceApi = {
  _listingsResponse: [] as any[],
  _salesResponse: [] as any[],
  
  reset(): void {
    this._listingsResponse = [];
    this._salesResponse = [];
  },
  
  onGetListings(): { returns: (value: any[]) => void } {
    return {
      returns: (value: any[]) => { this._listingsResponse = value; }
    };
  },
  
  onGetSales(): { returns: (value: any[]) => void } {
    return {
      returns: (value: any[]) => { this._salesResponse = value; }
    };
  }
};

/**
 * Create mock Redis client
 */
export const mockRedis = {
  _store: new Map<string, string>(),
  
  reset(): void {
    this._store.clear();
  },
  
  createMock(): any {
    return {
      get: jest.fn((key: string) => Promise.resolve(this._store.get(key) || null)),
      set: jest.fn((key: string, value: string) => {
        this._store.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => {
        this._store.delete(key);
        return Promise.resolve(1);
      }),
      setex: jest.fn((key: string, ttl: number, value: string) => {
        this._store.set(key, value);
        return Promise.resolve('OK');
      }),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(-2),
      keys: jest.fn((pattern: string) => Promise.resolve(Array.from(this._store.keys()))),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK')
    };
  }
};

/**
 * Create mock MongoDB client
 */
export const mockMongoDB = {
  _collections: new Map<string, any[]>(),
  
  reset(): void {
    this._collections.clear();
  },
  
  seedCollection(name: string, documents: any[]): void {
    this._collections.set(name, documents);
  },
  
  createMock(): any {
    return {
      db: () => ({
        collection: (name: string) => ({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue(this._collections.get(name) || [])
          }),
          findOne: jest.fn((query: any) => {
            const docs = this._collections.get(name) || [];
            return Promise.resolve(docs[0] || null);
          }),
          insertOne: jest.fn((doc: any) => {
            const docs = this._collections.get(name) || [];
            docs.push(doc);
            this._collections.set(name, docs);
            return Promise.resolve({ insertedId: 'mock-id' });
          }),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
        })
      }),
      close: jest.fn().mockResolvedValue(undefined)
    };
  }
};

// =============================================================================
// REQUEST HELPERS
// =============================================================================

/**
 * Create test request object
 */
export function createTestRequest(overrides: Partial<any> = {}): any {
  return {
    method: 'GET',
    url: '/api/v1/test',
    headers: {
      'authorization': `Bearer ${generateTestToken()}`,
      'content-type': 'application/json',
      ...overrides.headers
    },
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    ...overrides
  };
}

/**
 * Create test response object
 */
export function createTestResponse(): any {
  const res: any = {
    statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: null as any
  };
  
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  
  res.code = res.status;
  
  res.json = jest.fn((body: any) => {
    res._body = body;
    return res;
  });
  
  res.send = jest.fn((body: any) => {
    res._body = body;
    return res;
  });
  
  res.header = jest.fn((name: string, value: string) => {
    res._headers[name] = value;
    return res;
  });
  
  res.setHeader = res.header;
  
  return res;
}

// =============================================================================
// ASYNC HELPERS
// =============================================================================

/**
 * Wait for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for condition to be true
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
    await sleep(interval);
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Retry function until success or max attempts
 */
export async function retryUntil<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error = new Error('No attempts made');
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      await sleep(delayMs);
    }
  }
  
  throw lastError;
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Assert response is RFC 7807 error format
 */
export function assertRfc7807Error(response: any, expectedStatus: number): void {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('type');
  expect(response.body).toHaveProperty('title');
  expect(response.body).toHaveProperty('status', expectedStatus);
  expect(response.body).toHaveProperty('instance');
}

/**
 * Assert response has pagination
 */
export function assertPagination(body: any): void {
  expect(body).toHaveProperty('pagination');
  expect(body.pagination).toHaveProperty('total');
  expect(body.pagination).toHaveProperty('limit');
  expect(body.pagination).toHaveProperty('offset');
}

/**
 * Assert response has rate limit headers
 */
export function assertRateLimitHeaders(headers: Record<string, string>): void {
  expect(headers).toHaveProperty('x-ratelimit-limit');
  expect(headers).toHaveProperty('x-ratelimit-remaining');
  expect(headers).toHaveProperty('x-ratelimit-reset');
}

// =============================================================================
// DATA GENERATORS
// =============================================================================

/**
 * Generate random UUID
 */
export function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate random base58 string
 */
export function randomBase58(length: number = 44): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate random wallet address
 */
export function randomWalletAddress(): string {
  return randomBase58(44);
}

/**
 * Generate random transaction signature
 */
export function randomSignature(): string {
  return randomBase58(88);
}

// =============================================================================
// CLEANUP HELPERS
// =============================================================================

const cleanupFunctions: (() => Promise<void>)[] = [];

/**
 * Register cleanup function
 */
export function registerCleanup(fn: () => Promise<void>): void {
  cleanupFunctions.push(fn);
}

/**
 * Run all cleanup functions
 */
export async function runCleanup(): Promise<void> {
  for (const fn of cleanupFunctions.reverse()) {
    try {
      await fn();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
  cleanupFunctions.length = 0;
}

// Make jest available globally for mocks
declare global {
  const jest: typeof import('@jest/globals').jest;
}
