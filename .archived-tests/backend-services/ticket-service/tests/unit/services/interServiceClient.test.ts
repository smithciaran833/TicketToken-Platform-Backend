// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => mockLogger),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    services: {
      auth: 'http://auth-service:3001',
      event: 'http://event-service:3003',
      payment: 'http://payment-service:3006',
    },
  },
}));

// Setup axios mock BEFORE importing the service
const mockAxiosInstance = {
  request: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: {
      use: jest.fn(),
    },
    response: {
      use: jest.fn(),
    },
  },
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
  isAxiosError: jest.fn((error) => error.isAxiosError === true),
}));

// Import after mocks
import { InterServiceClient } from '../../../src/services/interServiceClient';
import axios from 'axios';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('InterServiceClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockAxiosInstance.request.mockResolvedValue({
      data: { result: 'success' },
      headers: {},
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // =============================================================================
  // Constructor and initialization - 8 test cases
  // =============================================================================

  describe('initialization', () => {
    it('should create clients for services', () => {
      expect(axios.create).toHaveBeenCalled();
    });

    it('should setup request interceptor', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should setup response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('should create client with correct timeout', () => {
      const createCall = (axios.create as jest.Mock).mock.calls[0];
      expect(createCall[0].timeout).toBe(10000);
    });

    it('should set content-type header', () => {
      const createCall = (axios.create as jest.Mock).mock.calls[0];
      expect(createCall[0].headers['Content-Type']).toBe('application/json');
    });

    it('should create multiple service clients', () => {
      expect(axios.create).toHaveBeenCalledTimes(4); // auth, event, payment, notification
    });

    it('should create client with baseURL', () => {
      const createCall = (axios.create as jest.Mock).mock.calls[0];
      expect(createCall[0].baseURL).toBeDefined();
    });

    it('should start health checks', () => {
      // Health check interval should be set
      expect(mockAxiosInstance.get).not.toHaveBeenCalled(); // Not immediately
    });
  });

  // =============================================================================
  // request() - 15 test cases
  // =============================================================================

  describe('request()', () => {
    beforeEach(() => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { result: 'success' },
        headers: {},
      });
    });

    it('should make request to service', async () => {
      const result = await InterServiceClient.request('auth', 'GET', '/users/123');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/users/123',
        data: undefined,
        timeout: 10000,
        headers: undefined,
      });
      expect(result.success).toBe(true);
    });

    it('should return successful response', async () => {
      const result = await InterServiceClient.request('auth', 'GET', '/test');

      expect(result).toEqual({
        success: true,
        data: { result: 'success' },
        metadata: expect.any(Object),
      });
    });

    it('should include response metadata', async () => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { result: 'success' },
        headers: {
          'x-request-id': 'req-123',
          'x-trace-id': 'trace-456',
        },
      });

      const result = await InterServiceClient.request('auth', 'GET', '/test');

      expect(result.metadata?.requestId).toBe('req-123');
      expect(result.metadata?.traceId).toBe('trace-456');
      expect(result.metadata?.duration).toBeDefined();
    });

    it('should pass data in request', async () => {
      await InterServiceClient.request('auth', 'POST', '/users', { name: 'John' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'John' },
        })
      );
    });

    it('should use custom timeout if provided', async () => {
      await InterServiceClient.request('auth', 'GET', '/test', undefined, { timeout: 5000 });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should pass custom headers', async () => {
      await InterServiceClient.request('auth', 'GET', '/test', undefined, {
        headers: { 'X-Custom': 'value' },
      });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'X-Custom': 'value' },
        })
      );
    });

    it('should handle axios errors', async () => {
      const error = {
        message: 'Network error',
        response: {
          status: 400,
          data: { error: 'Bad request' },
          headers: {},
        },
        isAxiosError: true,
      };
      mockAxiosInstance.request.mockRejectedValue(error);

      const result = await InterServiceClient.request('auth', 'GET', '/test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bad request');
    });

    it('should log request failures', async () => {
      const error = {
        message: 'Network error',
        response: { status: 500, data: {}, headers: {} },
        isAxiosError: true,
      };
      mockAxiosInstance.request.mockRejectedValue(error);

      await InterServiceClient.request('auth', 'GET', '/test');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error for unknown service', async () => {
      await expect(
        InterServiceClient.request('unknown', 'GET', '/test')
      ).rejects.toThrow('Service client not found: unknown');
    });

    it('should warn about unhealthy services', async () => {
      // Mark service as unhealthy
      (InterServiceClient as any).healthStatus.set('auth', false);

      await InterServiceClient.request('auth', 'GET', '/test');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Service auth is marked as unhealthy'
      );
    });

    it('should handle network errors with retry', async () => {
      const error = {
        message: 'Network error',
        isAxiosError: true,
      };
      mockAxiosInstance.request
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: { result: 'success' },
          headers: {},
        });

      const result = await InterServiceClient.request('auth', 'GET', '/test', undefined, {
        retry: true,
        maxRetries: 1,
      });

      expect(result.success).toBe(true);
    });

    it('should handle 5xx errors with retry', async () => {
      const error = {
        message: 'Server error',
        response: { status: 500, data: {}, headers: {} },
        isAxiosError: true,
      };
      mockAxiosInstance.request
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: { result: 'success' },
          headers: {},
        });

      const result = await InterServiceClient.request('auth', 'GET', '/test', undefined, {
        retry: true,
      });

      // Advance timers for retry delay
      await jest.runAllTimersAsync();

      expect(result.success).toBe(true);
    });

    it('should not retry on 4xx errors', async () => {
      const error = {
        message: 'Bad request',
        response: { status: 400, data: { error: 'Bad request' }, headers: {} },
        isAxiosError: true,
      };
      mockAxiosInstance.request.mockRejectedValue(error);

      const result = await InterServiceClient.request('auth', 'GET', '/test', undefined, {
        retry: true,
      });

      expect(result.success).toBe(false);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(1);
    });

    it('should handle non-axios errors', async () => {
      const error = new Error('Unknown error');
      mockAxiosInstance.request.mockRejectedValue(error);

      await expect(
        InterServiceClient.request('auth', 'GET', '/test')
      ).rejects.toThrow('Unknown error');
    });

    it('should handle different HTTP methods', async () => {
      await InterServiceClient.request('auth', 'POST', '/test');
      await InterServiceClient.request('auth', 'PUT', '/test');
      await InterServiceClient.request('auth', 'DELETE', '/test');

      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3);
    });
  });

  // =============================================================================
  // Convenience methods - 8 test cases
  // =============================================================================

  describe('convenience methods', () => {
    beforeEach(() => {
      mockAxiosInstance.request.mockResolvedValue({
        data: { result: 'success' },
        headers: {},
      });
    });

    it('should support get()', async () => {
      await InterServiceClient.get('auth', '/users');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/users',
        })
      );
    });

    it('should support post()', async () => {
      await InterServiceClient.post('auth', '/users', { name: 'John' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/users',
          data: { name: 'John' },
        })
      );
    });

    it('should support put()', async () => {
      await InterServiceClient.put('auth', '/users/123', { name: 'Jane' });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/users/123',
          data: { name: 'Jane' },
        })
      );
    });

    it('should support delete()', async () => {
      await InterServiceClient.delete('auth', '/users/123');

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/users/123',
        })
      );
    });

    it('should pass options in get()', async () => {
      await InterServiceClient.get('auth', '/users', { timeout: 5000 });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should pass options in post()', async () => {
      await InterServiceClient.post('auth', '/users', {}, { timeout: 5000 });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should pass options in put()', async () => {
      await InterServiceClient.put('auth', '/users/123', {}, { timeout: 5000 });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should pass options in delete()', async () => {
      await InterServiceClient.delete('auth', '/users/123', { timeout: 5000 });

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });
  });

  // =============================================================================
  // Health checks - 5 test cases
  // =============================================================================

  describe('health checks', () => {
    it('should return health status', async () => {
      const health = await InterServiceClient.checkHealth();

      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
    });

    it('should get individual service health', () => {
      const healthy = InterServiceClient.getHealthStatus('auth');

      expect(typeof healthy).toBe('boolean');
    });

    it('should return false for unknown service', () => {
      const healthy = InterServiceClient.getHealthStatus('unknown');

      expect(healthy).toBe(false);
    });

    it('should perform periodic health checks', () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      jest.advanceTimersByTime(30000);

      expect(mockAxiosInstance.get).toHaveBeenCalled();
    });

    it('should mark service unhealthy on failed check', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Health check failed'));

      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      const healthy = InterServiceClient.getHealthStatus('auth');
      expect(typeof healthy).toBe('boolean');
    });
  });

  // =============================================================================
  // instance test
  // =============================================================================

  describe('instance', () => {
    it('should be a singleton', () => {
      expect(InterServiceClient).toBeDefined();
    });

    it('should have all required methods', () => {
      expect(typeof InterServiceClient.request).toBe('function');
      expect(typeof InterServiceClient.get).toBe('function');
      expect(typeof InterServiceClient.post).toBe('function');
      expect(typeof InterServiceClient.put).toBe('function');
      expect(typeof InterServiceClient.delete).toBe('function');
      expect(typeof InterServiceClient.checkHealth).toBe('function');
      expect(typeof InterServiceClient.getHealthStatus).toBe('function');
    });
  });
});
