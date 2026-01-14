import axios from 'axios';

// Mocks
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

let mockCorrelationId: string | undefined = 'test-correlation-id';

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
  getCorrelationId: jest.fn(() => mockCorrelationId),
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  withCircuitBreaker: jest.fn((name, fn, fallback, options) => fn),
}));

import { createHttpClient, getCorrelationHeaders, createProtectedRequest, internalClients } from '../../../src/utils/http-client';
import { withCircuitBreaker } from '../../../src/utils/circuit-breaker';

describe('http-client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCorrelationId = 'test-correlation-id';
  });

  describe('createHttpClient', () => {
    it('should create axios client with default options', () => {
      const client = createHttpClient();

      expect(client.defaults.timeout).toBe(5000);
    });

    it('should create axios client with custom options', () => {
      const client = createHttpClient({
        baseURL: 'https://api.example.com',
        timeout: 10000,
      });

      expect(client.defaults.baseURL).toBe('https://api.example.com');
      expect(client.defaults.timeout).toBe(10000);
    });

    it('should add correlation headers to requests', async () => {
      const client = createHttpClient();
      
      const mockAdapter = jest.fn().mockResolvedValue({
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });
      client.defaults.adapter = mockAdapter;

      await client.get('/test');

      expect(mockAdapter).toHaveBeenCalled();
      const config = mockAdapter.mock.calls[0][0];
      expect(config.headers['x-correlation-id']).toBe('test-correlation-id');
      expect(config.headers['x-request-id']).toBe('test-correlation-id');
    });

    it('should log debug on request', async () => {
      const client = createHttpClient();
      
      const mockAdapter = jest.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: '/test', method: 'get' },
      });
      client.defaults.adapter = mockAdapter;

      await client.get('/test');

      expect(mockLogger.debug).toHaveBeenCalledWith('Outbound HTTP request', expect.objectContaining({
        correlationId: 'test-correlation-id',
        method: 'get',
        url: '/test',
      }));
    });

    it('should log debug on successful response', async () => {
      const client = createHttpClient();
      
      const mockAdapter = jest.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: '/test' },
      });
      client.defaults.adapter = mockAdapter;

      await client.get('/test');

      expect(mockLogger.debug).toHaveBeenCalledWith('Outbound HTTP response', expect.objectContaining({
        status: 200,
      }));
    });

    it('should handle missing correlation ID', async () => {
      mockCorrelationId = undefined;
      const client = createHttpClient();
      
      const mockAdapter = jest.fn().mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });
      client.defaults.adapter = mockAdapter;

      await client.get('/test');

      expect(mockAdapter).toHaveBeenCalled();
    });

    describe('retry logic', () => {
      it('should retry on 5xx errors', async () => {
        const client = createHttpClient({ retries: 2, retryDelay: 10 });
        
        let callCount = 0;
        const mockAdapter = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            const error: any = new Error('Server error');
            error.response = { status: 500 };
            error.config = { url: '/test', __retryCount: callCount - 1 };
            return Promise.reject(error);
          }
          return Promise.resolve({
            data: { success: true },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { url: '/test' },
          });
        });
        client.defaults.adapter = mockAdapter;

        const result = await client.get('/test');

        expect(result.status).toBe(200);
        expect(mockLogger.warn).toHaveBeenCalledWith('Retrying HTTP request', expect.any(Object));
      });

      it('should retry on 429 rate limit', async () => {
        const client = createHttpClient({ retries: 1, retryDelay: 10 });
        
        let callCount = 0;
        const mockAdapter = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            const error: any = new Error('Rate limited');
            error.response = { status: 429 };
            error.config = { url: '/test', __retryCount: 0 };
            return Promise.reject(error);
          }
          return Promise.resolve({
            data: { success: true },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { url: '/test' },
          });
        });
        client.defaults.adapter = mockAdapter;

        const result = await client.get('/test');

        expect(result.status).toBe(200);
      });

      it('should retry on network errors', async () => {
        const client = createHttpClient({ retries: 1, retryDelay: 10 });
        
        let callCount = 0;
        const mockAdapter = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            const error: any = new Error('Network error');
            error.config = { url: '/test', __retryCount: 0 };
            return Promise.reject(error);
          }
          return Promise.resolve({
            data: { success: true },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { url: '/test' },
          });
        });
        client.defaults.adapter = mockAdapter;

        const result = await client.get('/test');

        expect(result.status).toBe(200);
      });

      it('should not retry on 4xx errors (except 429)', async () => {
        const client = createHttpClient({ retries: 3, retryDelay: 10 });
        
        const mockAdapter = jest.fn().mockImplementation(() => {
          const error: any = new Error('Bad request');
          error.response = { status: 400 };
          error.config = { url: '/test', __retryCount: 0 };
          return Promise.reject(error);
        });
        client.defaults.adapter = mockAdapter;

        await expect(client.get('/test')).rejects.toThrow('Bad request');
        expect(mockAdapter).toHaveBeenCalledTimes(1);
      });

      it('should give up after max retries', async () => {
        const client = createHttpClient({ retries: 2, retryDelay: 10 });
        
        const mockAdapter = jest.fn().mockImplementation((config: any) => {
          const error: any = new Error('Server error');
          error.response = { status: 500 };
          error.config = config;
          return Promise.reject(error);
        });
        client.defaults.adapter = mockAdapter;

        await expect(client.get('/test')).rejects.toThrow('Server error');
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Outbound HTTP error (no more retries)',
          expect.any(Object)
        );
      });
    });
  });

  describe('getCorrelationHeaders', () => {
    it('should return headers with correlation ID', () => {
      const headers = getCorrelationHeaders();

      expect(headers['x-correlation-id']).toBe('test-correlation-id');
      expect(headers['x-request-id']).toBe('test-correlation-id');
    });

    it('should use request correlationId if provided', () => {
      const mockRequest = {
        correlationId: 'request-correlation-id',
      } as any;

      const headers = getCorrelationHeaders(mockRequest);

      expect(headers['x-correlation-id']).toBe('request-correlation-id');
      expect(headers['x-request-id']).toBe('request-correlation-id');
    });

    it('should return empty string if no correlation ID', () => {
      mockCorrelationId = undefined;
      
      const headers = getCorrelationHeaders();

      expect(headers['x-correlation-id']).toBe('');
      expect(headers['x-request-id']).toBe('');
    });
  });

  describe('createProtectedRequest', () => {
    it('should wrap request with circuit breaker', async () => {
      const mockFn = jest.fn().mockResolvedValue({ data: 'test' });
      
      const protectedFn = createProtectedRequest('test-request', mockFn);
      const result = await protectedFn();

      expect(withCircuitBreaker).toHaveBeenCalledWith(
        'test-request',
        expect.any(Function),
        undefined,
        { timeout: 5000 }
      );
      expect(result).toEqual({ data: 'test' });
    });

    it('should use custom timeout', async () => {
      const mockFn = jest.fn().mockResolvedValue({ data: 'test' });
      
      createProtectedRequest('test-request', mockFn, { timeout: 10000 });

      expect(withCircuitBreaker).toHaveBeenCalledWith(
        'test-request',
        expect.any(Function),
        undefined,
        { timeout: 10000 }
      );
    });

    it('should pass fallback function', async () => {
      const mockFn = jest.fn().mockResolvedValue({ data: 'test' });
      const fallback = () => ({ data: 'fallback' });
      
      createProtectedRequest('test-request', mockFn, { fallback });

      expect(withCircuitBreaker).toHaveBeenCalledWith(
        'test-request',
        expect.any(Function),
        fallback,
        { timeout: 5000 }
      );
    });
  });

  describe('internalClients', () => {
    it('should have venueService client', () => {
      expect(internalClients.venueService).toBeDefined();
      expect(internalClients.venueService.defaults.timeout).toBe(5000);
    });

    it('should have notificationService client', () => {
      expect(internalClients.notificationService).toBeDefined();
      expect(internalClients.notificationService.defaults.timeout).toBe(5000);
    });

    it('should have apiGateway client', () => {
      expect(internalClients.apiGateway).toBeDefined();
      expect(internalClients.apiGateway.defaults.timeout).toBe(5000);
    });
  });
});
