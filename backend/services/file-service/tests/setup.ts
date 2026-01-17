// Global test setup
// This file runs once before all tests

// MUST BE FIRST - Mock logger before any imports that use it
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
    }),
  },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
  createRequestLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
  sanitizeForLogging: jest.fn((obj) => obj),
  logAndThrow: jest.fn((error) => { throw error; }),
  auditLog: jest.fn(),
  getLogMetrics: jest.fn(() => ({ debug: 0, info: 0, warn: 0, error: 0, fatal: 0 })),
  loggerWithMetrics: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
  },
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
  },
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MAX_FILE_SIZE_MB = '100';
process.env.MAX_IMAGE_SIZE_MB = '10';
process.env.MAX_VIDEO_SIZE_MB = '500';
process.env.MAX_DOCUMENT_SIZE_MB = '50';
process.env.CHUNK_SIZE_MB = '5';
process.env.ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp';
process.env.ALLOWED_DOCUMENT_TYPES = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
process.env.ALLOWED_VIDEO_TYPES = 'video/mp4,video/quicktime,video/x-msvideo,video/webm';
process.env.LOCAL_STORAGE_PATH = './uploads';
process.env.TEMP_STORAGE_PATH = './temp';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Uncomment to suppress logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
