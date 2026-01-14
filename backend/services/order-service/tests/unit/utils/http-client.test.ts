/**
 * Unit Tests: HTTP Client Utility
 *
 * Tests secure S2S HTTP client including:
 * - Authentication headers
 * - Retry logic with jitter
 * - URL handling
 */

// Mock logger first
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('HTTP Client Utility', () => {
  const originalEnv = process.env;
  let mockAxiosCreate: jest.Mock;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      INTERNAL_SERVICE_SECRET: 'test-secret-for-hmac-signing-32chars',
      SERVICE_NAME: 'order-service',
    };

    // Setup mock client
    mockClient = {
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockAxiosCreate = jest.fn().mockReturnValue(mockClient);

    // Mock axios
    jest.doMock('axios', () => ({
      create: mockAxiosCreate,
      default: { create: mockAxiosCreate },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  // ============================================
  // createSecureServiceClient
  // ============================================
  describe('createSecureServiceClient', () => {
    it('should create an axios instance', () => {
      jest.resetModules();
      const { createSecureServiceClient } = require('../../../src/utils/http-client.util');

      const client = createSecureServiceClient({
        baseUrl: 'http://localhost:3001',
        serviceName: 'test-service',
      });

      expect(client).toBeDefined();
      expect(client.interceptors).toBeDefined();
    });

    it('should allow HTTP URL in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();

      const { createSecureServiceClient } = require('../../../src/utils/http-client.util');

      expect(() => {
        createSecureServiceClient({
          baseUrl: 'http://localhost:3001',
          serviceName: 'test-service',
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // createSecureServiceClient - Production Mode
  // ============================================
  describe('createSecureServiceClient - Production Mode', () => {
    beforeEach(() => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        INTERNAL_SERVICE_SECRET: 'test-secret-for-hmac-signing-32chars',
        SERVICE_NAME: 'order-service',
      };
    });

    it('should throw error for HTTP URL in production', () => {
      jest.resetModules();
      const { createSecureServiceClient } = require('../../../src/utils/http-client.util');

      expect(() => {
        createSecureServiceClient({
          baseUrl: 'http://localhost:3001',
          serviceName: 'test-service',
        });
      }).toThrow('HTTPS required for test-service in production');
    });

    it('should allow HTTPS URL in production', () => {
      jest.resetModules();
      const { createSecureServiceClient } = require('../../../src/utils/http-client.util');

      expect(() => {
        createSecureServiceClient({
          baseUrl: 'https://service.example.com',
          serviceName: 'test-service',
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // executeWithRetry
  // ============================================
  describe('executeWithRetry', () => {
    it('should return response on first success', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const mockResponse = { data: 'success', status: 200 };
      const fn = jest.fn().mockResolvedValue(mockResponse);

      const result = await executeWithRetry(fn);

      expect(result).toEqual(mockResponse);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx errors', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const error5xx = { response: { status: 500 } };
      const mockResponse = { data: 'success', status: 200 };

      const fn = jest.fn()
        .mockRejectedValueOnce(error5xx)
        .mockResolvedValue(mockResponse);

      const result = await executeWithRetry(fn, 3, 'test-service');

      expect(result).toEqual(mockResponse);
      expect(fn).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should not retry on 4xx errors', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const error4xx = { response: { status: 400 } };
      const fn = jest.fn().mockRejectedValue(error4xx);

      await expect(executeWithRetry(fn, 3, 'test-service')).rejects.toEqual(error4xx);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 401 errors', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const error401 = { response: { status: 401 } };
      const fn = jest.fn().mockRejectedValue(error401);

      await expect(executeWithRetry(fn, 3, 'test-service')).rejects.toEqual(error401);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on 404 errors', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const error404 = { response: { status: 404 } };
      const fn = jest.fn().mockRejectedValue(error404);

      await expect(executeWithRetry(fn, 3, 'test-service')).rejects.toEqual(error404);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const error5xx = { response: { status: 503 }, message: 'Service unavailable' };
      const fn = jest.fn().mockRejectedValue(error5xx);

      await expect(executeWithRetry(fn, 2, 'test-service')).rejects.toEqual(error5xx);
      expect(fn).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should retry network errors (no response)', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const networkError = { message: 'Network Error' };
      const mockResponse = { data: 'success', status: 200 };

      const fn = jest.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue(mockResponse);

      const result = await executeWithRetry(fn, 3, 'test-service');

      expect(result).toEqual(mockResponse);
      expect(fn).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should use default maxRetries of 3', async () => {
      jest.resetModules();
      const { executeWithRetry } = require('../../../src/utils/http-client.util');

      const error = { response: { status: 500 } };
      const fn = jest.fn().mockRejectedValue(error);

      await expect(executeWithRetry(fn)).rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(4);
    }, 30000);
  });

  // ============================================
  // getServiceUrl
  // ============================================
  describe('getServiceUrl', () => {
    it('should return URL from environment variable', () => {
      process.env.PAYMENT_SERVICE_URL = 'http://payment:3003';
      jest.resetModules();

      const { getServiceUrl } = require('../../../src/utils/http-client.util');
      const url = getServiceUrl('payment-service', 'http://default:3000');

      expect(url).toBe('http://payment:3003');
    });

    it('should return default URL if env var not set', () => {
      delete process.env.TEST_SERVICE_URL;
      jest.resetModules();

      const { getServiceUrl } = require('../../../src/utils/http-client.util');
      const url = getServiceUrl('test-service', 'http://default:3000');

      expect(url).toBe('http://default:3000');
    });

    it('should keep HTTP in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DEV_SERVICE_URL;
      jest.resetModules();

      const { getServiceUrl } = require('../../../src/utils/http-client.util');
      const url = getServiceUrl('dev-service', 'http://localhost:3000');

      expect(url).toBe('http://localhost:3000');
    });

    it('should handle service names with hyphens', () => {
      process.env.MY_COOL_SERVICE_URL = 'http://cool:3000';
      jest.resetModules();

      const { getServiceUrl } = require('../../../src/utils/http-client.util');
      const url = getServiceUrl('my-cool-service', 'http://default:3000');

      expect(url).toBe('http://cool:3000');
    });
  });

  // ============================================
  // getServiceUrl - Production Mode
  // ============================================
  describe('getServiceUrl - Production Mode', () => {
    beforeEach(() => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        INTERNAL_SERVICE_SECRET: 'test-secret-for-hmac-signing-32chars',
      };
    });

    it('should convert HTTP to HTTPS in production', () => {
      delete process.env.MY_SERVICE_URL;
      jest.resetModules();

      const { getServiceUrl } = require('../../../src/utils/http-client.util');
      const url = getServiceUrl('my-service', 'http://service:3000');

      expect(url).toBe('https://service:3000');
    });

    it('should keep HTTPS in production', () => {
      delete process.env.SECURE_SERVICE_URL;
      jest.resetModules();

      const { getServiceUrl } = require('../../../src/utils/http-client.util');
      const url = getServiceUrl('secure-service', 'https://service:3000');

      expect(url).toBe('https://service:3000');
    });
  });
});
