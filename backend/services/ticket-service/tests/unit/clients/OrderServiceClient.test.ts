// Mock shared library
jest.mock('@tickettoken/shared', () => ({
  createAxiosInstance: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Mock CircuitBreaker
const mockCircuitBreakerCall = jest.fn();
const mockCircuitBreakerGetStatus = jest.fn();
const mockCircuitBreakerReset = jest.fn();

jest.mock('../../../src/utils/CircuitBreaker', () => {
  return jest.fn().mockImplementation(() => ({
    call: mockCircuitBreakerCall,
    getStatus: mockCircuitBreakerGetStatus,
    reset: mockCircuitBreakerReset,
  }));
});

// Mock logger
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

import { createAxiosInstance } from '@tickettoken/shared';
import {
  OrderServiceClient,
  orderServiceClient,
  OrderServiceError,
  OrderServiceUnavailableError,
  OrderValidationError,
  OrderConflictError,
  OrderNotFoundError,
} from '../../../src/clients/OrderServiceClient';

describe('OrderServiceClient', () => {
  let client: OrderServiceClient;
  let mockHttpClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHttpClient = {
      post: jest.fn(),
      get: jest.fn(),
    };

    (createAxiosInstance as jest.Mock).mockReturnValue(mockHttpClient);

    client = new OrderServiceClient();
  });

  describe('constructor', () => {
    it('should create axios instance with correct URL', () => {
      expect(createAxiosInstance).toHaveBeenCalledWith(
        expect.any(String),
        10000
      );
    });
  });

  describe('createOrder', () => {
    const mockRequest = {
      userId: 'user-123',
      eventId: 'event-456',
      items: [
        { ticketTypeId: 'type-1', quantity: 2, unitPriceCents: 5000 },
      ],
      currency: 'USD',
    };

    it('should create order successfully', async () => {
      const mockResponse = {
        data: {
          orderId: 'order-123',
          orderNumber: 'ORD-001',
          status: 'pending',
          totalCents: 10000,
          currency: 'USD',
          items: [],
          createdAt: '2024-01-01T00:00:00Z',
        },
      };

      mockCircuitBreakerCall.mockImplementation(async (fn) => fn());
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await client.createOrder(mockRequest);

      expect(result.orderId).toBe('order-123');
      expect(result.orderNumber).toBe('ORD-001');
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/orders',
        expect.objectContaining({
          userId: 'user-123',
          eventId: 'event-456',
          idempotencyKey: 'mock-uuid-1234',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': 'mock-uuid-1234',
          }),
        })
      );
    });

    it('should use provided idempotency key', async () => {
      const requestWithKey = {
        ...mockRequest,
        idempotencyKey: 'custom-key-123',
      };

      mockCircuitBreakerCall.mockImplementation(async (fn) => fn());
      mockHttpClient.post.mockResolvedValue({
        data: { orderId: 'order-123', orderNumber: 'ORD-001', status: 'pending', totalCents: 10000, currency: 'USD', items: [], createdAt: '' },
      });

      await client.createOrder(requestWithKey);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/orders',
        expect.objectContaining({
          idempotencyKey: 'custom-key-123',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': 'custom-key-123',
          }),
        })
      );
    });

    it('should throw OrderServiceUnavailableError when circuit is open', async () => {
      const circuitOpenError = new Error('Circuit open');
      (circuitOpenError as any).code = 'CIRCUIT_OPEN';

      mockCircuitBreakerCall.mockRejectedValue(circuitOpenError);

      await expect(client.createOrder(mockRequest)).rejects.toThrow(OrderServiceUnavailableError);
    });

    it('should throw OrderValidationError on 400 response', async () => {
      const axiosError = new Error('Bad Request');
      (axiosError as any).isAxiosError = true;
      (axiosError as any).response = {
        status: 400,
        data: { error: 'Invalid order data' },
      };

      mockCircuitBreakerCall.mockRejectedValue(axiosError);

      await expect(client.createOrder(mockRequest)).rejects.toThrow(OrderValidationError);
    });

    it('should throw OrderConflictError on 409 response', async () => {
      const axiosError = new Error('Conflict');
      (axiosError as any).isAxiosError = true;
      (axiosError as any).response = {
        status: 409,
        data: { error: 'Order already exists' },
      };

      mockCircuitBreakerCall.mockRejectedValue(axiosError);

      await expect(client.createOrder(mockRequest)).rejects.toThrow(OrderConflictError);
    });

    it('should throw OrderServiceUnavailableError on 503 response', async () => {
      const axiosError = new Error('Service Unavailable');
      (axiosError as any).isAxiosError = true;
      (axiosError as any).response = {
        status: 503,
        data: {},
      };

      mockCircuitBreakerCall.mockRejectedValue(axiosError);

      await expect(client.createOrder(mockRequest)).rejects.toThrow(OrderServiceUnavailableError);
    });

    it('should throw OrderServiceError on unknown errors', async () => {
      mockCircuitBreakerCall.mockRejectedValue(new Error('Unknown error'));

      await expect(client.createOrder(mockRequest)).rejects.toThrow(OrderServiceError);
    });
  });

  describe('getOrder', () => {
    it('should get order successfully', async () => {
      const mockResponse = {
        data: {
          id: 'order-123',
          userId: 'user-123',
          eventId: 'event-456',
          orderNumber: 'ORD-001',
          status: 'completed',
          totalCents: 10000,
          currency: 'USD',
          items: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      };

      mockCircuitBreakerCall.mockImplementation(async (fn) => fn());
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await client.getOrder('order-123', 'user-123');

      expect(result.id).toBe('order-123');
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/orders/order-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Id': 'user-123',
          }),
        })
      );
    });

    it('should throw OrderNotFoundError on 404 response', async () => {
      const axiosError = new Error('Not Found');
      (axiosError as any).isAxiosError = true;
      (axiosError as any).response = { status: 404 };

      mockCircuitBreakerCall.mockRejectedValue(axiosError);

      await expect(client.getOrder('order-123', 'user-123')).rejects.toThrow(OrderNotFoundError);
    });

    it('should throw OrderServiceUnavailableError when circuit is open', async () => {
      const circuitOpenError = new Error('Circuit open');
      (circuitOpenError as any).code = 'CIRCUIT_OPEN';

      mockCircuitBreakerCall.mockRejectedValue(circuitOpenError);

      await expect(client.getOrder('order-123', 'user-123')).rejects.toThrow(OrderServiceUnavailableError);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order successfully', async () => {
      mockCircuitBreakerCall.mockImplementation(async (fn) => fn());
      mockHttpClient.post.mockResolvedValue({});

      await client.cancelOrder({
        orderId: 'order-123',
        userId: 'user-123',
        reason: 'Customer request',
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/api/v1/orders/order-123/cancel',
        { reason: 'Customer request' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-User-Id': 'user-123',
          }),
        })
      );
    });

    it('should not throw on cancel failure (logs error)', async () => {
      mockCircuitBreakerCall.mockRejectedValue(new Error('Cancel failed'));

      // Should not throw
      await expect(
        client.cancelOrder({
          orderId: 'order-123',
          userId: 'user-123',
          reason: 'Test',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('getCircuitBreakerStatus', () => {
    it('should return circuit breaker status', () => {
      mockCircuitBreakerGetStatus.mockReturnValue({
        state: 'closed',
        failures: 0,
      });

      const status = client.getCircuitBreakerStatus();

      expect(mockCircuitBreakerGetStatus).toHaveBeenCalled();
      expect(status.state).toBe('closed');
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset circuit breaker', () => {
      client.resetCircuitBreaker();

      expect(mockCircuitBreakerReset).toHaveBeenCalled();
    });
  });

  describe('Error classes', () => {
    it('OrderServiceError should have correct name', () => {
      const error = new OrderServiceError('Test error');
      expect(error.name).toBe('OrderServiceError');
      expect(error.message).toBe('Test error');
    });

    it('OrderServiceError should store original error', () => {
      const originalError = new Error('Original');
      const error = new OrderServiceError('Wrapped', originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('OrderServiceUnavailableError should have correct name', () => {
      const error = new OrderServiceUnavailableError('Unavailable');
      expect(error.name).toBe('OrderServiceUnavailableError');
    });

    it('OrderValidationError should have correct name', () => {
      const error = new OrderValidationError('Invalid');
      expect(error.name).toBe('OrderValidationError');
    });

    it('OrderConflictError should have correct name', () => {
      const error = new OrderConflictError('Conflict');
      expect(error.name).toBe('OrderConflictError');
    });

    it('OrderNotFoundError should have correct name', () => {
      const error = new OrderNotFoundError('Not found');
      expect(error.name).toBe('OrderNotFoundError');
    });
  });

  describe('singleton instance', () => {
    it('should export orderServiceClient singleton', () => {
      expect(orderServiceClient).toBeInstanceOf(OrderServiceClient);
    });
  });
});
