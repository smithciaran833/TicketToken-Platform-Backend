/**
 * Mock for pino logger module
 * Used in Jest tests to prevent actual logging
 */

const createMockLogger = () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    level: 'error',
    child: jest.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return mockLogger;
};

const mockLogger = createMockLogger();

const pinoFn = jest.fn(() => mockLogger);

pinoFn.destination = jest.fn(() => ({}));
pinoFn.stdSerializers = {
  req: jest.fn((req) => ({ method: req?.method, url: req?.url })),
  res: jest.fn((res) => ({ statusCode: res?.statusCode })),
  err: jest.fn((err) => ({ message: err?.message, stack: err?.stack })),
};
pinoFn.default = pinoFn;

// Support both named and default exports
module.exports = {
  __esModule: true,
  default: pinoFn,
  pino: pinoFn,
};
