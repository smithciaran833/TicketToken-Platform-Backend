// @ts-nocheck
/**
 * Payment Service Test Setup
 * 
 * Configures the test environment, mocks external dependencies,
 * and provides shared utilities for all tests.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// =============================================================================
// Environment Setup
// =============================================================================

// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/payment_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key_12345';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.SERVICE_AUTH_SECRET = 'test-service-auth-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32chars!!!!';

// =============================================================================
// Global Mocks
// =============================================================================

// Mock pino logger to suppress logs during tests
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => mockLogger),
    level: 'info',
    levels: { labels: {}, values: {} },
    isLevelEnabled: jest.fn().mockReturnValue(true),
    bindings: jest.fn().mockReturnValue({}),
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
    isoTime: jest.fn(() => ',"time":"2026-01-01T00:00:00.000Z"'),
    epochTime: jest.fn(() => ',"time":1704067200000'),
    unixTime: jest.fn(() => ',"time":1704067200'),
    nullTime: jest.fn(() => ''),
  };
  // CRITICAL: Fastify's logger.js requires pino.symbols
  (pino as any).symbols = {
    serializersSym: Symbol('pino.serializers'),
    redactFmtSym: Symbol('pino.redactFmt'),
    streamSym: Symbol('pino.stream'),
    stringifySym: Symbol('pino.stringify'),
    stringifiersSym: Symbol('pino.stringifiers'),
    needsMetadataGsym: Symbol('pino.needsMetadata'),
    chindingsSym: Symbol('pino.chindings'),
    formatOptsSym: Symbol('pino.formatOpts'),
    messageKeySym: Symbol('pino.messageKey'),
    nestedKeySym: Symbol('pino.nestedKey'),
    wildcardFirstSym: Symbol('pino.wildcardFirst'),
    levelCompSym: Symbol('pino.levelComp'),
    useLevelLabelsSym: Symbol('pino.useLevelLabels'),
    changeLevelNameSym: Symbol('pino.changeLevelName'),
    useOnlyCustomLevelsSym: Symbol('pino.useOnlyCustomLevels'),
    mixinSym: Symbol('pino.mixin'),
    lsCacheSym: Symbol('pino.lsCache'),
    levelValSym: Symbol('pino.levelVal'),
    setLevelSym: Symbol('pino.setLevel'),
    getLevelSym: Symbol('pino.getLevel'),
    isLevelEnabledSym: Symbol('pino.isLevelEnabled'),
    endSym: Symbol('pino.end'),
    writeSym: Symbol('pino.write'),
    formattersSym: Symbol('pino.formatters'),
    hooksSym: Symbol('pino.hooks'),
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
    decr: jest.fn().mockResolvedValue(0),
    lpush: jest.fn().mockResolvedValue(1),
    rpush: jest.fn().mockResolvedValue(1),
    lpop: jest.fn().mockResolvedValue(null),
    rpop: jest.fn().mockResolvedValue(null),
    lrange: jest.fn().mockResolvedValue([]),
    llen: jest.fn().mockResolvedValue(0),
    hget: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
    hmset: jest.fn().mockResolvedValue('OK'),
    keys: jest.fn().mockResolvedValue([]),
    scan: jest.fn().mockResolvedValue(['0', []]),
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

// Mock knex
jest.mock('knex', () => {
  const mockKnex = jest.fn(() => {
    const queryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereNotNull: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      then: jest.fn((cb) => cb([])),
      catch: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      rightJoin: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      raw: jest.fn().mockReturnThis(),
      count: jest.fn().mockResolvedValue([{ count: 0 }]),
      sum: jest.fn().mockResolvedValue([{ sum: 0 }]),
      avg: jest.fn().mockResolvedValue([{ avg: 0 }]),
      max: jest.fn().mockResolvedValue([{ max: null }]),
      min: jest.fn().mockResolvedValue([{ min: null }]),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      transacting: jest.fn().mockReturnThis(),
      forUpdate: jest.fn().mockReturnThis(),
      forShare: jest.fn().mockReturnThis(),
      skipLocked: jest.fn().mockReturnThis(),
    };

    const knexInstance: any = jest.fn((tableName: string) => queryBuilder);
    knexInstance.raw = jest.fn().mockResolvedValue({ rows: [] });
    knexInstance.transaction = jest.fn((callback) => callback(knexInstance));
    knexInstance.destroy = jest.fn().mockResolvedValue(undefined);
    knexInstance.schema = {
      hasTable: jest.fn().mockResolvedValue(true),
      createTable: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
      alterTable: jest.fn().mockResolvedValue(undefined),
    };

    return knexInstance;
  });

  return mockKnex;
});

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        status: 'requires_payment_method',
        amount: 1000,
        currency: 'usd',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
        amount: 1000,
        currency: 'usd',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'requires_payment_method',
      }),
      confirm: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
      cancel: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'canceled',
      }),
      capture: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      }),
    },
    refunds: {
      create: jest.fn().mockResolvedValue({
        id: 're_test_123',
        status: 'succeeded',
        amount: 500,
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 're_test_123',
        status: 'succeeded',
      }),
    },
    transfers: {
      create: jest.fn().mockResolvedValue({
        id: 'tr_test_123',
        amount: 800,
        destination: 'acct_test_123',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'tr_test_123',
        amount: 800,
      }),
    },
    accounts: {
      create: jest.fn().mockResolvedValue({
        id: 'acct_test_123',
        type: 'express',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'acct_test_123',
        charges_enabled: true,
        payouts_enabled: true,
      }),
      createLoginLink: jest.fn().mockResolvedValue({
        url: 'https://connect.stripe.com/login',
      }),
    },
    accountLinks: {
      create: jest.fn().mockResolvedValue({
        url: 'https://connect.stripe.com/setup',
      }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test_123',
        email: 'test@example.com',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'cus_test_123',
        email: 'test@example.com',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'cus_test_123',
      }),
    },
    paymentMethods: {
      attach: jest.fn().mockResolvedValue({
        id: 'pm_test_123',
      }),
      detach: jest.fn().mockResolvedValue({
        id: 'pm_test_123',
      }),
    },
    webhooks: {
      constructEvent: jest.fn().mockImplementation((payload, sig, secret) => {
        return JSON.parse(payload);
      }),
    },
    balance: {
      retrieve: jest.fn().mockResolvedValue({
        available: [{ amount: 10000, currency: 'usd' }],
        pending: [{ amount: 5000, currency: 'usd' }],
      }),
    },
    balanceTransactions: {
      list: jest.fn().mockResolvedValue({
        data: [],
        has_more: false,
      }),
    },
    charges: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'ch_test_123',
        amount: 1000,
        status: 'succeeded',
      }),
    },
  }));
});

// =============================================================================
// Global Test Utilities
// =============================================================================

// Mock timers for async tests
beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// Global timeout
jest.setTimeout(30000);

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock Fastify request object
 */
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

/**
 * Create a mock Fastify reply object
 */
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
    redirect: jest.fn().mockReturnThis(),
  };
  return reply;
}

/**
 * Create a mock Fastify instance
 */
export function createMockFastify(): any {
  const hooks: Record<string, Function[]> = {};
  
  return {
    register: jest.fn().mockResolvedValue(undefined),
    addHook: jest.fn((name: string, fn: Function) => {
      if (!hooks[name]) hooks[name] = [];
      hooks[name].push(fn);
    }),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    route: jest.fn(),
    listen: jest.fn().mockResolvedValue('http://localhost:3000'),
    close: jest.fn().mockResolvedValue(undefined),
    ready: jest.fn().mockResolvedValue(undefined),
    inject: jest.fn(),
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    decorate: jest.fn(),
    decorateRequest: jest.fn(),
    decorateReply: jest.fn(),
    setErrorHandler: jest.fn(),
    setNotFoundHandler: jest.fn(),
    _hooks: hooks,
  };
}

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Advance timers and flush promises
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms);
  await flushPromises();
}

// =============================================================================
// Fixtures
// =============================================================================

export const fixtures = {
  payment: {
    id: 'pay_test_123',
    paymentIntentId: 'pi_test_123',
    orderId: 'order_test_123',
    tenantId: 'tenant_123',
    userId: 'user_123',
    amount: 10000, // $100.00 in cents
    currency: 'usd',
    status: 'succeeded',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  refund: {
    id: 'ref_test_123',
    paymentId: 'pay_test_123',
    stripeRefundId: 're_test_123',
    amount: 5000, // $50.00 in cents
    reason: 'customer_request',
    status: 'succeeded',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  transaction: {
    id: 'txn_test_123',
    paymentId: 'pay_test_123',
    type: 'charge',
    amount: 10000,
    status: 'completed',
    stripeChargeId: 'ch_test_123',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  user: {
    userId: 'user_123',
    tenantId: 'tenant_123',
    email: 'test@example.com',
    roles: ['user'],
  },
  venue: {
    id: 'venue_123',
    tenantId: 'tenant_123',
    stripeAccountId: 'acct_test_123',
    name: 'Test Venue',
  },
};
