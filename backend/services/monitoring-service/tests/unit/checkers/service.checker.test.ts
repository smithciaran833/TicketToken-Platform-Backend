const mockAxiosGet = jest.fn();

jest.mock('axios', () => ({
  get: mockAxiosGet,
}));

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ServiceHealthChecker } from '../../../src/checkers/service.checker';
import { logger } from '../../../src/logger';

describe('ServiceHealthChecker', () => {
  let checker: ServiceHealthChecker;
  const serviceName = 'test-service';
  const serviceUrl = 'http://localhost:3000';

  beforeEach(() => {
    jest.clearAllMocks();
    checker = new ServiceHealthChecker(serviceName, serviceUrl);
  });

  describe('getName', () => {
    it('should return correct name with service name', () => {
      expect(checker.getName()).toBe('ServiceHealthChecker-test-service');
    });

    it('should include service name for different services', () => {
      const authChecker = new ServiceHealthChecker('auth-service', 'http://auth:3001');
      expect(authChecker.getName()).toBe('ServiceHealthChecker-auth-service');
    });
  });

  describe('check', () => {
    it('should return healthy status for 200 response with low latency', async () => {
      mockAxiosGet.mockResolvedValue({
        status: 200,
        data: { status: 'ok', uptime: 86400 },
      });

      const result = await checker.check();

      expect(result.status).toBe('healthy');
      expect(result.httpStatus).toBe(200);
      expect(result.service).toBe(serviceName);
      expect(result.url).toBe(serviceUrl);
      expect(result.details).toEqual({ status: 'ok', uptime: 86400 });
      expect(result.message).toBe('Service responsive');
    });

    it('should include latency in response', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200, data: {} });

      const result = await checker.check();

      expect(result.latency).toBeDefined();
      expect(typeof result.latency).toBe('number');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return degraded status for 4xx responses', async () => {
      mockAxiosGet.mockResolvedValue({
        status: 401,
        data: { error: 'Unauthorized' },
      });

      const result = await checker.check();

      expect(result.status).toBe('degraded');
      expect(result.httpStatus).toBe(401);
      expect(result.message).toBe('Service returned 401');
    });

    it('should return degraded for 403 forbidden', async () => {
      mockAxiosGet.mockResolvedValue({
        status: 403,
        data: { error: 'Forbidden' },
      });

      const result = await checker.check();

      expect(result.status).toBe('degraded');
      expect(result.httpStatus).toBe(403);
    });

    it('should return degraded for 404 not found', async () => {
      mockAxiosGet.mockResolvedValue({
        status: 404,
        data: { error: 'Not found' },
      });

      const result = await checker.check();

      expect(result.status).toBe('degraded');
      expect(result.httpStatus).toBe(404);
    });

    it('should return unhealthy for ECONNREFUSED error', async () => {
      const connError = new Error('Connection refused');
      (connError as any).code = 'ECONNREFUSED';
      mockAxiosGet.mockRejectedValue(connError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection refused');
      expect(result.service).toBe(serviceName);
      expect(result.url).toBe(serviceUrl);
      expect(result.message).toBe('Service not reachable');
      expect(logger.error).toHaveBeenCalledWith(
        `Service health check failed for ${serviceName}: Connection refused`
      );
    });

    it('should return unhealthy for ETIMEDOUT error', async () => {
      const timeoutError = new Error('Timeout');
      (timeoutError as any).code = 'ETIMEDOUT';
      mockAxiosGet.mockRejectedValue(timeoutError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Timeout');
      expect(result.message).toBe('Service timeout');
      expect(logger.error).toHaveBeenCalledWith(
        `Service health check failed for ${serviceName}: Timeout`
      );
    });

    it('should return unhealthy for ECONNABORTED error', async () => {
      const abortError = new Error('Connection aborted');
      (abortError as any).code = 'ECONNABORTED';
      mockAxiosGet.mockRejectedValue(abortError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Timeout');
      expect(result.message).toBe('Service timeout');
    });

    it('should return unhealthy for 5xx error responses', async () => {
      const serverError = new Error('Internal Server Error');
      (serverError as any).response = { status: 500 };
      mockAxiosGet.mockRejectedValue(serverError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.httpStatus).toBe(500);
      expect(result.message).toBe('Service error: 500');
    });

    it('should return unhealthy for 503 service unavailable', async () => {
      const unavailableError = new Error('Service Unavailable');
      (unavailableError as any).response = { status: 503 };
      mockAxiosGet.mockRejectedValue(unavailableError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.httpStatus).toBe(503);
      expect(result.message).toBe('Service error: 503');
    });

    it('should return unhealthy for unknown errors', async () => {
      const unknownError = new Error('Unknown error');
      (unknownError as any).code = 'UNKNOWN';
      mockAxiosGet.mockRejectedValue(unknownError);

      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Unknown error');
      expect(result.code).toBe('UNKNOWN');
      expect(result.message).toBe('Service check failed');
      expect(logger.error).toHaveBeenCalledWith(
        `Service health check failed for ${serviceName}:`,
        expect.any(Error)
      );
    });

    it('should call health endpoint with correct URL', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200, data: {} });

      await checker.check();

      expect(mockAxiosGet).toHaveBeenCalledWith(
        `${serviceUrl}/health`,
        expect.objectContaining({
          timeout: 5000,
          validateStatus: expect.any(Function),
        })
      );
    });

    it('should accept 4xx status codes in validateStatus', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200, data: {} });

      await checker.check();

      const validateStatus = mockAxiosGet.mock.calls[0][1].validateStatus;
      expect(validateStatus(200)).toBe(true);
      expect(validateStatus(400)).toBe(true);
      expect(validateStatus(404)).toBe(true);
      expect(validateStatus(499)).toBe(true);
      expect(validateStatus(500)).toBe(false);
      expect(validateStatus(503)).toBe(false);
    });

    it('should use 5000ms timeout for requests', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200, data: {} });

      await checker.check();

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('should return service and url in all responses', async () => {
      mockAxiosGet.mockResolvedValue({ status: 200, data: {} });

      const result = await checker.check();

      expect(result.service).toBe(serviceName);
      expect(result.url).toBe(serviceUrl);
    });
  });
});
