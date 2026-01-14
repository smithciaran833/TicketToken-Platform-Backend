import axios from 'axios';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
  isAxiosError: jest.fn(),
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    services: {
      minting: 'http://minting-service:3007',
    },
    serviceTimeout: 30000,
    internalServiceSecret: 'test-secret',
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { MintingServiceClient, mintingServiceClient } from '../../../src/clients/MintingServiceClient';

describe('MintingServiceClient', () => {
  let client: MintingServiceClient;
  let mockAxiosInstance: any;
  let capturedResponseInterceptor: { onSuccess: Function; onError: Function };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh mock for each test
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { 
          use: jest.fn((onSuccess, onError) => {
            // Capture the interceptor callbacks
            capturedResponseInterceptor = { onSuccess, onError };
          })
        },
      },
    };

    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    client = new MintingServiceClient();
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://minting-service:3007',
          timeout: 30000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Service-Name': 'ticket-service',
            'X-Internal-Auth': 'test-secret',
          }),
        })
      );
    });

    it('should setup request interceptor', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should setup response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalledTimes(1);
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should initialize circuit breaker in closed state', () => {
      const status = client.getCircuitBreakerStatus();
      expect(status.state).toBe('closed');
      expect(status.failureCount).toBe(0);
      expect(status.lastFailureTime).toBeUndefined();
    });
  });

  describe('mintTicket', () => {
    const mockRequest = {
      ticketId: 'ticket-123',
      userId: 'user-456',
      eventId: 'event-789',
      ticketTypeId: 'type-1',
      metadata: {
        eventName: 'Test Event',
        eventDate: '2024-06-15',
        venue: 'Test Venue',
        seatInfo: 'A1',
        ticketType: 'GA',
        price: 50,
      },
      tenantId: 'tenant-123',
    };

    it('should successfully mint a ticket', async () => {
      const mockResponse = {
        data: {
          success: true,
          mintAddress: 'mint-address-123',
          transactionSignature: 'tx-sig-123',
          status: 'confirmed',
          estimatedConfirmationTime: 5000,
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.mintTicket(mockRequest);

      expect(result.success).toBe(true);
      expect(result.mintAddress).toBe('mint-address-123');
      expect(result.transactionSignature).toBe('tx-sig-123');
      expect(result.status).toBe('confirmed');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/mint/ticket',
        mockRequest
      );
    });

    it('should return pending status for async minting', async () => {
      const mockResponse = {
        data: {
          success: true,
          status: 'pending',
          estimatedConfirmationTime: 30000,
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.mintTicket(mockRequest);

      expect(result.success).toBe(true);
      expect(result.status).toBe('pending');
      expect(result.estimatedConfirmationTime).toBe(30000);
    });

    it('should return failure response on 4xx error without retrying', async () => {
      const clientError = new Error('Bad Request');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (clientError as any).response = { status: 400 };

      mockAxiosInstance.post.mockRejectedValue(clientError);

      const result = await client.mintTicket(mockRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should return failure response on non-axios error', async () => {
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
      mockAxiosInstance.post.mockRejectedValue(new Error('Unknown error'));

      const result = await client.mintTicket(mockRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Unknown error');
    });

    it('should include all ticket details in request payload', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, status: 'confirmed' },
      });

      await client.mintTicket(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/mint/ticket',
        expect.objectContaining({
          ticketId: 'ticket-123',
          userId: 'user-456',
          eventId: 'event-789',
          ticketTypeId: 'type-1',
          tenantId: 'tenant-123',
          metadata: expect.objectContaining({
            eventName: 'Test Event',
            venue: 'Test Venue',
            seatInfo: 'A1',
          }),
        })
      );
    });
  });

  describe('circuit breaker behavior', () => {
    const mockRequest = {
      ticketId: 'ticket-123',
      userId: 'user-456',
      eventId: 'event-789',
      ticketTypeId: 'type-1',
      metadata: {
        eventName: 'Test Event',
        eventDate: '2024-06-15',
        venue: 'Test Venue',
        ticketType: 'GA',
        price: 50,
      },
      tenantId: 'tenant-123',
    };

    it('should open circuit breaker after 5 failures via response interceptor', async () => {
      // Trigger 5 failures through the response interceptor
      for (let i = 0; i < 5; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('Server error'));
        } catch (e) {
          // Expected to throw
        }
      }

      const status = client.getCircuitBreakerStatus();
      expect(status.state).toBe('open');
      expect(status.failureCount).toBe(5);
      expect(status.lastFailureTime).toBeDefined();
    });

    it('should block requests when circuit breaker is open', async () => {
      // Open the circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      expect(client.getCircuitBreakerStatus().state).toBe('open');

      // Now try to make a request - should be blocked
      const result = await client.mintTicket(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Circuit breaker is open');
      // post should not be called because circuit is open
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
    });

    it('should transition to half-open state after reset timeout', async () => {
      jest.useFakeTimers();

      // Open the circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      expect(client.getCircuitBreakerStatus().state).toBe('open');

      // Advance time past reset timeout (60 seconds)
      jest.advanceTimersByTime(61000);

      // Setup successful response for the test request
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, status: 'confirmed' },
      });

      // Make a request - canMakeRequest() should transition to half-open
      await client.mintTicket(mockRequest);

      // After the time elapsed and request made, should be half-open
      expect(client.getCircuitBreakerStatus().state).toBe('half-open');

      jest.useRealTimers();
    });

    it('should close circuit breaker after successful request in half-open state', async () => {
      jest.useFakeTimers();

      // Open the circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      // Advance time to allow half-open
      jest.advanceTimersByTime(61000);

      // Mock successful response
      mockAxiosInstance.post.mockResolvedValue({
        data: { success: true, status: 'confirmed' },
      });

      // Make request (transitions to half-open)
      await client.mintTicket(mockRequest);

      // Simulate successful response through interceptor (closes circuit)
      capturedResponseInterceptor.onSuccess({ data: { success: true } });

      expect(client.getCircuitBreakerStatus().state).toBe('closed');
      expect(client.getCircuitBreakerStatus().failureCount).toBe(0);

      jest.useRealTimers();
    });

    it('should reset failure count on successful response', async () => {
      // Add some failures
      for (let i = 0; i < 3; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      expect(client.getCircuitBreakerStatus().failureCount).toBe(3);

      // Simulate successful response - this resets count only in non-half-open state
      // In closed state, onSuccess just resets failureCount
      capturedResponseInterceptor.onSuccess({ status: 200, data: {} });

      expect(client.getCircuitBreakerStatus().failureCount).toBe(0);
    });
  });

  describe('getMintStatus', () => {
    it('should get mint status successfully', async () => {
      const mockResponse = {
        data: {
          ticketId: 'ticket-123',
          mintAddress: 'mint-address-123',
          transactionSignature: 'tx-sig-123',
          status: 'confirmed',
          confirmed: true,
          confirmedAt: '2024-01-01T00:00:00Z',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getMintStatus('ticket-123');

      expect(result.ticketId).toBe('ticket-123');
      expect(result.mintAddress).toBe('mint-address-123');
      expect(result.confirmed).toBe(true);
      expect(result.confirmedAt).toBe('2024-01-01T00:00:00Z');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/mint/status/ticket-123');
    });

    it('should return pending status for unconfirmed mint', async () => {
      const mockResponse = {
        data: {
          ticketId: 'ticket-123',
          status: 'pending',
          confirmed: false,
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getMintStatus('ticket-123');

      expect(result.status).toBe('pending');
      expect(result.confirmed).toBe(false);
      expect(result.mintAddress).toBeUndefined();
    });

    it('should return failed status with error message', async () => {
      const mockResponse = {
        data: {
          ticketId: 'ticket-123',
          status: 'failed',
          confirmed: false,
          error: 'Insufficient funds',
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.getMintStatus('ticket-123');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Insufficient funds');
    });

    it('should throw error on network failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getMintStatus('ticket-123')).rejects.toThrow('Network error');
    });

    it('should throw error on 404 not found', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as any).response = { status: 404 };
      mockAxiosInstance.get.mockRejectedValue(notFoundError);

      await expect(client.getMintStatus('nonexistent')).rejects.toThrow();
    });

    it('should throw when circuit breaker is open', async () => {
      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      await expect(client.getMintStatus('ticket-123')).rejects.toThrow('Circuit breaker is open');
    });
  });

  describe('batchMintTickets', () => {
    const mockRequests = [
      {
        ticketId: 'ticket-1',
        userId: 'user-1',
        eventId: 'event-1',
        ticketTypeId: 'type-1',
        metadata: {
          eventName: 'Event 1',
          eventDate: '2024-01-01',
          venue: 'Venue 1',
          ticketType: 'GA',
          price: 50,
        },
        tenantId: 'tenant-1',
      },
      {
        ticketId: 'ticket-2',
        userId: 'user-1',
        eventId: 'event-1',
        ticketTypeId: 'type-1',
        metadata: {
          eventName: 'Event 1',
          eventDate: '2024-01-01',
          venue: 'Venue 1',
          ticketType: 'VIP',
          price: 100,
        },
        tenantId: 'tenant-1',
      },
      {
        ticketId: 'ticket-3',
        userId: 'user-2',
        eventId: 'event-1',
        ticketTypeId: 'type-2',
        metadata: {
          eventName: 'Event 1',
          eventDate: '2024-01-01',
          venue: 'Venue 1',
          ticketType: 'GA',
          price: 50,
        },
        tenantId: 'tenant-1',
      },
    ];

    it('should batch mint tickets successfully', async () => {
      const mockResponse = {
        data: {
          results: [
            { success: true, status: 'confirmed', mintAddress: 'mint-1', transactionSignature: 'tx-1' },
            { success: true, status: 'confirmed', mintAddress: 'mint-2', transactionSignature: 'tx-2' },
            { success: true, status: 'pending', mintAddress: 'mint-3' },
          ],
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const results = await client.batchMintTickets(mockRequests);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[0].mintAddress).toBe('mint-1');
      expect(results[1].success).toBe(true);
      expect(results[2].status).toBe('pending');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/mint/batch',
        { tickets: mockRequests }
      );
    });

    it('should handle partial batch success', async () => {
      const mockResponse = {
        data: {
          results: [
            { success: true, status: 'confirmed', mintAddress: 'mint-1' },
            { success: false, status: 'failed', error: 'Invalid metadata' },
            { success: true, status: 'confirmed', mintAddress: 'mint-3' },
          ],
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const results = await client.batchMintTickets(mockRequests);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Invalid metadata');
      expect(results[2].success).toBe(true);
    });

    it('should return failure responses for all tickets on network error', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Batch endpoint unavailable'));

      const results = await client.batchMintTickets(mockRequests);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(false);
        expect(result.status).toBe('failed');
        expect(result.error).toContain('Batch');
      });
    });

    it('should return failure responses when circuit breaker is open', async () => {
      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      const results = await client.batchMintTickets(mockRequests);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(false);
        expect(result.error).toContain('Circuit breaker is open');
      });
    });

    it('should handle empty batch', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { results: [] },
      });

      const results = await client.batchMintTickets([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200, data: { status: 'ok' } });

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should return false when service returns non-200', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 503 });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on connection refused', async () => {
      const connectionError = new Error('ECONNREFUSED');
      (connectionError as any).code = 'ECONNREFUSED';
      mockAxiosInstance.get.mockRejectedValue(connectionError);

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';
      mockAxiosInstance.get.mockRejectedValue(timeoutError);

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should not affect circuit breaker state on failure', async () => {
      const initialStatus = client.getCircuitBreakerStatus();

      mockAxiosInstance.get.mockRejectedValue(new Error('Health check failed'));
      await client.healthCheck();

      const afterStatus = client.getCircuitBreakerStatus();
      expect(afterStatus.failureCount).toBe(initialStatus.failureCount);
    });
  });

  describe('getCircuitBreakerStatus', () => {
    it('should return initial closed state', () => {
      const status = client.getCircuitBreakerStatus();

      expect(status).toEqual({
        state: 'closed',
        failureCount: 0,
        lastFailureTime: undefined,
      });
    });

    it('should track failure count incrementally', async () => {
      try {
        await capturedResponseInterceptor.onError(new Error('fail'));
      } catch (e) {}

      expect(client.getCircuitBreakerStatus().failureCount).toBe(1);

      try {
        await capturedResponseInterceptor.onError(new Error('fail'));
      } catch (e) {}

      expect(client.getCircuitBreakerStatus().failureCount).toBe(2);
    });

    it('should record lastFailureTime on failure', async () => {
      const beforeTime = Date.now();

      try {
        await capturedResponseInterceptor.onError(new Error('fail'));
      } catch (e) {}

      const status = client.getCircuitBreakerStatus();
      expect(status.lastFailureTime).toBeDefined();
      expect(status.lastFailureTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should show open state after threshold failures', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      const status = client.getCircuitBreakerStatus();
      expect(status.state).toBe('open');
      expect(status.failureCount).toBe(5);
    });
  });

  describe('retry logic', () => {
    const mockRequest = {
      ticketId: 'ticket-123',
      userId: 'user-456',
      eventId: 'event-789',
      ticketTypeId: 'type-1',
      metadata: {
        eventName: 'Test Event',
        eventDate: '2024-06-15',
        venue: 'Test Venue',
        ticketType: 'GA',
        price: 50,
      },
      tenantId: 'tenant-123',
    };

    it('should not retry on 400 client error', async () => {
      const clientError = new Error('Bad Request');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (clientError as any).response = { status: 400 };

      mockAxiosInstance.post.mockRejectedValue(clientError);

      await client.mintTicket(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 401 unauthorized', async () => {
      const authError = new Error('Unauthorized');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (authError as any).response = { status: 401 };

      mockAxiosInstance.post.mockRejectedValue(authError);

      await client.mintTicket(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 403 forbidden', async () => {
      const forbiddenError = new Error('Forbidden');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (forbiddenError as any).response = { status: 403 };

      mockAxiosInstance.post.mockRejectedValue(forbiddenError);

      await client.mintTicket(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 not found', async () => {
      const notFoundError = new Error('Not Found');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (notFoundError as any).response = { status: 404 };

      mockAxiosInstance.post.mockRejectedValue(notFoundError);

      await client.mintTicket(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 422 unprocessable entity', async () => {
      const validationError = new Error('Unprocessable Entity');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (validationError as any).response = { status: 422 };

      mockAxiosInstance.post.mockRejectedValue(validationError);

      await client.mintTicket(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling via interceptor', () => {
    it('should handle axios error with response data', async () => {
      const axiosError = new Error('Request failed');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      (axiosError as any).response = {
        status: 500,
        statusText: 'Internal Server Error',
        data: { message: 'Database connection failed' },
      };

      await expect(capturedResponseInterceptor.onError(axiosError)).rejects.toThrow();
      expect(client.getCircuitBreakerStatus().failureCount).toBe(1);
    });

    it('should handle non-axios error', async () => {
      const genericError = new Error('Something went wrong');
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);

      await expect(capturedResponseInterceptor.onError(genericError)).rejects.toThrow('Something went wrong');
    });

    it('should increment failure count on each error', async () => {
      for (let i = 1; i <= 3; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error(`Error ${i}`));
        } catch (e) {}
        expect(client.getCircuitBreakerStatus().failureCount).toBe(i);
      }
    });
  });

  describe('request interceptor', () => {
    it('should pass through valid config', () => {
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0];
      const onRequest = requestInterceptor[0];

      const config = { method: 'post', url: '/test', data: { foo: 'bar' } };
      const result = onRequest(config);

      expect(result).toEqual(config);
    });

    it('should reject on request error', async () => {
      const requestInterceptor = mockAxiosInstance.interceptors.request.use.mock.calls[0];
      const onRequestError = requestInterceptor[1];

      const error = new Error('Request setup failed');

      await expect(onRequestError(error)).rejects.toThrow('Request setup failed');
    });
  });

  describe('response interceptor success path', () => {
    it('should pass through successful response', () => {
      const response = { status: 200, data: { success: true } };
      const result = capturedResponseInterceptor.onSuccess(response);

      expect(result).toEqual(response);
    });

    it('should reset failure count on success in closed state', async () => {
      // Add some failures (but not enough to open)
      for (let i = 0; i < 3; i++) {
        try {
          await capturedResponseInterceptor.onError(new Error('fail'));
        } catch (e) {}
      }

      expect(client.getCircuitBreakerStatus().failureCount).toBe(3);
      expect(client.getCircuitBreakerStatus().state).toBe('closed');

      // Success resets in closed state
      capturedResponseInterceptor.onSuccess({ status: 200, data: {} });

      expect(client.getCircuitBreakerStatus().failureCount).toBe(0);
    });
  });

  describe('singleton instance', () => {
    it('should export mintingServiceClient singleton', () => {
      expect(mintingServiceClient).toBeInstanceOf(MintingServiceClient);
    });

    it('should be the same instance on multiple imports', async () => {
      const { mintingServiceClient: client1 } = await import('../../../src/clients/MintingServiceClient');
      const { mintingServiceClient: client2 } = await import('../../../src/clients/MintingServiceClient');

      expect(client1).toBe(client2);
    });
  });
});
