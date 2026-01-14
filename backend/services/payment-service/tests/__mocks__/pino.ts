/**
 * Pino Logger Mock
 * 
 * Provides a mock implementation of pino for testing.
 */

const createMockLogger = () => {
  const mockLogger: any = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => createMockLogger()),
    level: 'info',
  };
  return mockLogger;
};

const pino: any = jest.fn(() => createMockLogger());

pino.transport = jest.fn(() => ({}));
pino.destination = jest.fn(() => ({}));
pino.stdSerializers = {
  err: (err: any) => ({
    type: err?.constructor?.name || 'Error',
    message: err?.message,
    stack: err?.stack,
  }),
  req: jest.fn((req) => ({
    method: req?.method,
    url: req?.url,
    headers: req?.headers,
  })),
  res: jest.fn((res) => ({
    statusCode: res?.statusCode,
  })),
};

export default pino;
export { pino };
