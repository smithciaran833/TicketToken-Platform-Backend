// Test setup
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SCANNING_SERVICE_PORT = '3020';
process.env.MAX_SCAN_SIZE_MB = '100';
process.env.WEBHOOK_SECRET = 'test_webhook_secret';

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
