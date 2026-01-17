import { ProxyService } from '../../../src/services/proxy.service';

// Create mock functions before mocking
const mockAxiosCall = jest.fn();
const mockIsAxiosError = jest.fn();

// Mock axios module
jest.mock('axios', () => {
  const axiosMock: any = jest.fn();
  axiosMock.isAxiosError = jest.fn();
  return axiosMock;
});

// Import after mocking
import axios from 'axios';

jest.mock('../../../src/config/services', () => ({
  serviceUrls: {
    auth: 'http://auth-service:3001',
    venue: 'http://venue-service:3002',
    event: 'http://event-service:3003',
    ticket: 'http://ticket-service:3004',
    payment: 'http://payment-service:3005',
    marketplace: 'http://marketplace-service:3006',
    notification: 'http://notification-service:3007',
    analytics: 'http://analytics-service:3008',
    integration: 'http://integration-service:3009',
    compliance: 'http://compliance-service:3010',
    queue: 'http://queue-service:3011',
    search: 'http://search-service:3012',
    file: 'http://file-service:3013',
    monitoring: 'http://monitoring-service:3014',
    blockchain: 'http://blockchain-service:3015',
    order: 'http://order-service:3016',
    scanning: 'http://scanning-service:3017',
    minting: 'http://minting-service:3018',
    transfer: 'http://transfer-service:3019',
  },
}));

const mockedAxios = axios as any;

describe('ProxyService', () => {
  let proxyService: ProxyService;
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();
    proxyService = new ProxyService();

    mockRequest = {
      id: 'test-request-id',
      method: 'GET',
      url: '/test',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer token',
      },
      query: {},
      body: {},
      ip: '127.0.0.1',
      protocol: 'http',
      hostname: 'localhost',
      socket: { localPort: 3000 },
    };

    // Mock axios as a function
    mockedAxios.mockResolvedValue({
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });

    // Mock isAxiosError
    mockedAxios.isAxiosError.mockReturnValue(false);
  });

  describe('forward', () => {
    it('forwards request to correct service URL', async () => {
      await proxyService.forward(mockRequest, 'auth-service');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://auth-service:3001/test',
        })
      );
    });

    it('includes forwarded headers in request', async () => {
      await proxyService.forward(mockRequest, 'auth-service');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-forwarded-for': '127.0.0.1',
            'x-forwarded-proto': 'http',
            'x-forwarded-host': 'localhost',
            'x-forwarded-port': 3000,
          }),
        })
      );
    });

    it('preserves original request headers', async () => {
      await proxyService.forward(mockRequest, 'auth-service');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'authorization': 'Bearer token',
          }),
        })
      );
    });

    it('forwards request method', async () => {
      mockRequest.method = 'POST';

      await proxyService.forward(mockRequest, 'auth-service');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('forwards request body', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { username: 'test', password: 'pass' };

      await proxyService.forward(mockRequest, 'auth-service');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { username: 'test', password: 'pass' },
        })
      );
    });

    it('uses custom timeout when provided', async () => {
      await proxyService.forward(mockRequest, 'auth-service', { timeout: 5000 });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('uses default timeout of 10000ms when not provided', async () => {
      await proxyService.forward(mockRequest, 'auth-service');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });

    it('returns successful response', async () => {
      const mockResponse = { data: { success: true }, status: 200 };
      mockedAxios.mockResolvedValue(mockResponse);

      const result = await proxyService.forward(mockRequest, 'auth-service');

      expect(result).toEqual(mockResponse);
    });

    it('passes through additional options', async () => {
      await proxyService.forward(mockRequest, 'auth-service', {
        maxRedirects: 5,
        validateStatus: () => true,
      });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRedirects: 5,
          validateStatus: expect.any(Function),
        })
      );
    });
  });

  describe('error transformation', () => {
    it('transforms ECONNREFUSED to ServiceUnavailableError', async () => {
      const axiosError = {
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED',
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service is unavailable');
    });

    it('transforms ETIMEDOUT to ServiceTimeoutError', async () => {
      const axiosError = {
        code: 'ETIMEDOUT',
        message: 'timeout of 10000ms exceeded',
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service timed out after 10000ms');
    });

    it('transforms ECONNABORTED to ServiceTimeoutError', async () => {
      const axiosError = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service timed out after 10000ms');
    });

    it('transforms ENOTFOUND to ServiceUnavailableError', async () => {
      const axiosError = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND',
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service is unavailable');
    });

    it('transforms ECONNRESET to ServiceUnavailableError', async () => {
      const axiosError = {
        code: 'ECONNRESET',
        message: 'socket hang up',
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service is unavailable');
    });

    it('transforms 500 response to BadGatewayError', async () => {
      const axiosError = {
        message: 'Internal error',
        response: {
          status: 500,
          data: { message: 'Internal error' },
        },
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service error: Internal error');
    });

    it('transforms 502 response to BadGatewayError', async () => {
      const axiosError = {
        message: 'Bad Gateway',
        response: {
          status: 502,
          data: {},
        },
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service error: Bad Gateway');
    });

    it('transforms 503 response to BadGatewayError', async () => {
      const axiosError = {
        message: 'Service Unavailable',
        response: {
          status: 503,
          data: {},
        },
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service error: Service Unavailable');
    });

    it('passes through 4xx errors as ProxyError with status code', async () => {
      const axiosError = {
        message: 'Not found',
        response: {
          status: 404,
          data: { message: 'Not found' },
        },
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      try {
        await proxyService.forward(mockRequest, 'auth-service');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Not found');
        expect(error.statusCode).toBe(404);
      }
    });

    it('includes error message from downstream service', async () => {
      const axiosError = {
        message: 'Bad Request',
        response: {
          status: 400,
          data: { message: 'Username is required' },
        },
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      try {
        await proxyService.forward(mockRequest, 'auth-service');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Username is required');
      }
    });

    it('handles non-axios errors as BadGatewayError', async () => {
      const regularError = new Error('Something went wrong');
      mockedAxios.mockRejectedValue(regularError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      await expect(
        proxyService.forward(mockRequest, 'auth-service')
      ).rejects.toThrow('auth-service error: Something went wrong');
    });

    it('includes service name in all errors', async () => {
      const axiosError = {
        code: 'ECONNREFUSED',
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      try {
        await proxyService.forward(mockRequest, 'auth-service');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('auth-service');
      }
    });

    it('includes original error in transformed error', async () => {
      const axiosError = {
        code: 'ETIMEDOUT',
        message: 'timeout exceeded',
        isAxiosError: true,
      };
      mockedAxios.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      try {
        await proxyService.forward(mockRequest, 'auth-service');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.originalError).toBeDefined();
      }
    });
  });
});
