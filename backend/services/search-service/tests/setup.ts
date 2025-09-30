// Test setup
process.env.NODE_ENV = 'test';
process.env.ELASTICSEARCH_NODE = 'http://localhost:9200';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret';
process.env.SEARCH_SERVICE_PORT = '3012';

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
