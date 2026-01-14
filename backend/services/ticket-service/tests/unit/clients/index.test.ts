// Mock dependencies before importing
jest.mock('@tickettoken/shared', () => ({
  createAxiosInstance: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('../../../src/utils/CircuitBreaker', () => {
  return jest.fn().mockImplementation(() => ({
    call: jest.fn(),
    getStatus: jest.fn(),
    reset: jest.fn(),
  }));
});

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

describe('Clients Index', () => {
  it('should export OrderServiceClient', async () => {
    const { OrderServiceClient } = await import('../../../src/clients');
    expect(OrderServiceClient).toBeDefined();
  });

  it('should export orderServiceClient singleton', async () => {
    const { orderServiceClient } = await import('../../../src/clients');
    expect(orderServiceClient).toBeDefined();
  });

  it('should export OrderServiceError', async () => {
    const { OrderServiceError } = await import('../../../src/clients');
    expect(OrderServiceError).toBeDefined();
  });

  it('should export OrderServiceUnavailableError', async () => {
    const { OrderServiceUnavailableError } = await import('../../../src/clients');
    expect(OrderServiceUnavailableError).toBeDefined();
  });

  it('should export OrderValidationError', async () => {
    const { OrderValidationError } = await import('../../../src/clients');
    expect(OrderValidationError).toBeDefined();
  });

  it('should export OrderConflictError', async () => {
    const { OrderConflictError } = await import('../../../src/clients');
    expect(OrderConflictError).toBeDefined();
  });

  it('should export OrderNotFoundError', async () => {
    const { OrderNotFoundError } = await import('../../../src/clients');
    expect(OrderNotFoundError).toBeDefined();
  });
});
