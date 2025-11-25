// Test setup file
beforeAll(() => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Suppress console output during tests
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
});

afterEach(() => {
  // Clear all mocks after each test
  jest.clearAllMocks();
});

afterAll(() => {
  // Clean up
  jest.restoreAllMocks();
});

// Global test utilities
export const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
