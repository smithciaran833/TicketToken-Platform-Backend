// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.SERVICE_NAME = 'integration-service';
process.env.PORT = '3009';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Create database mock
const mockDb: any = jest.fn((tableName: string) => mockDb);
mockDb.where = jest.fn(() => mockDb);
mockDb.select = jest.fn(() => mockDb);
mockDb.from = jest.fn(() => mockDb);
mockDb.first = jest.fn();
mockDb.update = jest.fn(() => mockDb);
mockDb.insert = jest.fn(() => mockDb);
mockDb.delete = jest.fn(() => mockDb);
mockDb.returning = jest.fn(() => mockDb);
mockDb.orderBy = jest.fn(() => mockDb);
mockDb.limit = jest.fn(() => mockDb);
mockDb.offset = jest.fn(() => mockDb);
mockDb.count = jest.fn(() => mockDb);
mockDb.groupBy = jest.fn(() => mockDb);

// Mock external dependencies
jest.mock('../src/config/database', () => ({
  initializeDatabase: jest.fn().mockResolvedValue(undefined),
  db: mockDb
}));

jest.mock('../src/config/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(undefined),
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    setex: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    hdel: jest.fn(),
    hgetall: jest.fn()
  }
}));

jest.mock('../src/config/queue', () => ({
  initializeQueues: jest.fn().mockResolvedValue(undefined),
  queues: {
    critical: {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      process: jest.fn()
    },
    high: {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      process: jest.fn()
    },
    normal: {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      process: jest.fn()
    },
    low: {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      process: jest.fn()
    }
  }
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock provider modules
jest.mock('../src/providers/stripe/stripe.provider', () => ({
  StripeProvider: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({ connected: true }),
    disconnect: jest.fn().mockResolvedValue(true),
    testConnection: jest.fn().mockResolvedValue(true),
    syncData: jest.fn().mockResolvedValue({ synced: 100 })
  }))
}));

jest.mock('../src/providers/square/square.provider', () => ({
  SquareProvider: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({ connected: true }),
    disconnect: jest.fn().mockResolvedValue(true),
    testConnection: jest.fn().mockResolvedValue(true),
    syncData: jest.fn().mockResolvedValue({ synced: 50 })
  }))
}));

jest.mock('../src/providers/mailchimp/mailchimp.provider', () => ({
  MailchimpProvider: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({ connected: true }),
    disconnect: jest.fn().mockResolvedValue(true),
    testConnection: jest.fn().mockResolvedValue(true),
    syncData: jest.fn().mockResolvedValue({ synced: 200 })
  }))
}));

jest.mock('../src/providers/quickbooks/quickbooks.provider', () => ({
  QuickBooksProvider: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({ connected: true }),
    disconnect: jest.fn().mockResolvedValue(true),
    testConnection: jest.fn().mockResolvedValue(true),
    syncData: jest.fn().mockResolvedValue({ synced: 75 })
  }))
}));

// Export mockDb for use in tests
(global as any).mockDb = mockDb;

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
