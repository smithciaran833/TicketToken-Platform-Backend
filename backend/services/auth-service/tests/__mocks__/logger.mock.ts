/**
 * Reusable Logger mock for Phase 2 tests
 */
export const createLoggerMock = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => createLoggerMock()),
});

export type LoggerMock = ReturnType<typeof createLoggerMock>;
