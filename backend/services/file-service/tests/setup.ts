// Test setup
process.env.NODE_ENV = 'test';
process.env.S3_BUCKET = 'test-bucket';
process.env.S3_REGION = 'us-east-1';
process.env.FILE_MAX_MB = '25';
process.env.FILE_ALLOWED_TYPES = 'image/jpeg,image/png,application/pdf,text/csv';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret';
process.env.FILE_SERVICE_PORT = '3013';

// Silence console during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
