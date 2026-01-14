/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reusable Fastify request/reply mocks for venue-service Phase 2 tests
 */

// Jest globals are available in test environment
declare const jest: any;

export interface MockUser {
  id: string;
  email: string;
  permissions: string[];
  tenant_id?: string;
  tenant_name?: string;
  tenant_type?: string;
}

export interface CreateRequestOptions {
  routerPath?: string;
  id?: string;
  method?: string;
  url?: string;
  params?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
  user?: MockUser | null;
}

/**
 * Create a mock Fastify request
 */
export const createMockRequest = (options: CreateRequestOptions = {}) => {
  const request: any = {
    id: options.id || 'test-request-id',
    method: options.method || 'GET',
    url: options.url || '/test',
    routerPath: (options as any).routerPath || options.url || '/test',
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
    user: options.user !== undefined ? options.user : null,
    server: {
      jwt: {
        verify: jest.fn(),
      },
      container: {
        cradle: {
          venueService: {
            checkVenueAccess: jest.fn(),
          },
          db: jest.fn(),
          redis: {
            get: jest.fn(),
            setex: jest.fn(),
          },
        },
      },
    },
    log: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    // For tenant middleware
    tenantContext: undefined,
    tenantId: undefined,
  };

  return request;
};

/**
 * Create a mock Fastify reply
 */
export const createMockReply = (requestId: string = 'test-request-id') => {
  const reply: any = {
    code: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    headers: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    sent: false,
    // Required by ErrorResponseBuilder
    request: {
      id: requestId,
    },
  };

  return reply;
};

/**
 * Create a default authenticated user
 */
export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'user-123',
  email: 'test@example.com',
  permissions: ['venue:read', 'venue:write'],
  tenant_id: '550e8400-e29b-41d4-a716-446655440000',
  ...overrides,
});

/**
 * Create mock request with authenticated user
 */
export const createAuthenticatedRequest = (options: CreateRequestOptions = {}) => {
  return createMockRequest({
    ...options,
    user: options.user !== undefined ? options.user : createMockUser(),
  });
};

export type MockRequest = ReturnType<typeof createMockRequest>;
export type MockReply = ReturnType<typeof createMockReply>;
