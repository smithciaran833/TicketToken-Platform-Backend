// @ts-nocheck
/**
 * API Gateway Test Setup
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// =============================================================================
// Environment Setup
// =============================================================================

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.SERVICE_AUTH_SECRET = 'test-service-auth-secret';

// Service URLs
process.env.AUTH_SERVICE_URL = 'http://localhost:3001';
process.env.VENUE_SERVICE_URL = 'http://localhost:3002';
process.env.EVENT_SERVICE_URL = 'http://localhost:3003';
process.env.TICKET_SERVICE_URL = 'http://localhost:3004';
process.env.PAYMENT_SERVICE_URL = 'http://localhost:3005';

// =============================================================================
// Global Mocks
// =============================================================================

// Mock pino logger
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => mockLogger),
  };
  const pino = jest.fn(() => mockLogger);
  (pino as any).transport = jest.fn(() => ({}));
  (pino as any).destination = jest.fn(() => ({}));
  (pino as any).stdSerializers = {
    err: (err: any) => ({ message: err?.message, stack: err?.stack }),
    req: jest.fn(),
    res: jest.fn(),
  };
  (pino as any).stdTimeFunctions = {
    isoTime: jest.fn(),
    epochTime: jest.fn(),
    nullTime: jest.fn(),
  };
  return pino;
});

// Mock pino-pretty
jest.mock('pino-pretty', () => jest.fn(() => ({})));

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
    incr: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(1),
    pipeline: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    }),
    multi: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    }),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    on: jest.fn(),
    status: 'ready',
  }));
});

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    post: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    put: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    patch: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    delete: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    request: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  })),
  get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  post: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  put: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  patch: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  delete: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  request: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  isAxiosError: jest.fn((error) => error && error.isAxiosError === true),
}));

// Mock opossum (circuit breaker)
jest.mock('opossum', () => {
  return jest.fn().mockImplementation((fn: Function) => {
    const breaker: any = {
      fire: jest.fn((...args: any[]) => fn(...args)),
      fallback: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      open: jest.fn(),
      close: jest.fn(),
      shutdown: jest.fn(),
      stats: {
        fires: 0,
        failures: 0,
        successes: 0,
        rejects: 0,
        timeouts: 0,
      },
    };
    return breaker;
  });
});

// Mock prom-client
jest.mock('prom-client', () => ({
  Counter: jest.fn().mockImplementation(() => ({
    inc: jest.fn(),
    reset: jest.fn(),
  })),
  Histogram: jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    reset: jest.fn(),
  })),
  Gauge: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    inc: jest.fn(),
    dec: jest.fn(),
    reset: jest.fn(),
  })),
  register: {
    metrics: jest.fn().mockResolvedValue(''),
    clear: jest.fn(),
    resetMetrics: jest.fn(),
  },
  collectDefaultMetrics: jest.fn(),
}));

// =============================================================================
// Global Test Utilities
// =============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

jest.setTimeout(30000);

// =============================================================================
// Test Helpers
// =============================================================================

export function createMockRequest(overrides: Partial<any> = {}): any {
  return {
    id: 'req-123',
    method: 'GET',
    url: '/test',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req-123',
      'x-tenant-id': 'tenant-123',
      authorization: 'Bearer test-token',
    },
    query: {},
    params: {},
    body: {},
    user: {
      userId: 'user-123',
      tenantId: 'tenant-123',
      roles: ['user'],
    },
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    ...overrides,
  };
}

export function createMockReply(): any {
  const reply: any = {
    statusCode: 200,
    sent: false,
    status: jest.fn().mockImplementation((code: number) => {
      reply.statusCode = code;
      return reply;
    }),
    code: jest.fn().mockImplementation((code: number) => {
      reply.statusCode = code;
      return reply;
    }),
    send: jest.fn().mockImplementation((data: any) => {
      reply.sent = true;
      reply.payload = data;
      return reply;
    }),
    header: jest.fn().mockReturnThis(),
    headers: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
  };
  return reply;
}

export function createMockFastify(): any {
  return {
    register: jest.fn().mockResolvedValue(undefined),
    addHook: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    listen: jest.fn().mockResolvedValue('http://localhost:3000'),
    close: jest.fn().mockResolvedValue(undefined),
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
}

export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

// =============================================================================
// Fixtures
// =============================================================================

export const fixtures = {
  user: {
    userId: 'user_123',
    tenantId: 'tenant_123',
    email: 'test@example.com',
    roles: ['user'],
  },
  authToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
};
