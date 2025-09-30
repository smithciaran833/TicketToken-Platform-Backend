// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SERVICE_NAME = 'compliance-service';
process.env.PORT = '3010';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock database service
jest.mock('../src/services/database.service', () => ({
  db: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn(),
    end: jest.fn()
  }
}));

// Mock redis service
jest.mock('../src/services/redis.service', () => ({
  redis: {
    getClient: jest.fn().mockReturnValue({
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    })
  }
}));

// Mock cache service
jest.mock('../src/services/cache-integration', () => ({
  serviceCache: {
    getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 }),
    flush: jest.fn().mockResolvedValue(true),
    get: jest.fn(),
    set: jest.fn()
  }
}));

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Export mocked db for use in tests
export const mockDb = jest.requireMock('../src/services/database.service').db;
