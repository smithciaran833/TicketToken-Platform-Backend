// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.SERVICE_NAME = 'queue-service';
process.env.PORT = '3011';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock Bull queues
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  getJob: jest.fn(),
  getJobs: jest.fn().mockResolvedValue([]),
  pause: jest.fn().mockResolvedValue(void 0),
  resume: jest.fn().mockResolvedValue(void 0),
  clean: jest.fn().mockResolvedValue([]),
  obliterate: jest.fn().mockResolvedValue(void 0),
  getJobCounts: jest.fn().mockResolvedValue({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0
  }),
  process: jest.fn(),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
  close: jest.fn()
};

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => mockQueue);
});

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    quit: jest.fn()
  }));
});

// Mock logger
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Export mocks for use in tests
export { mockQueue };
