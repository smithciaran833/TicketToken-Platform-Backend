// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/middleware/request-id', () => ({
  getRequestDuration: jest.fn(() => 100),
}));

jest.mock('../../../src/config/index', () => ({
  isProduction: jest.fn(() => false),
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  requestLoggerOnRequest,
  requestLoggerOnResponse,
  requestLoggerOnError,
} from '../../../src/middleware/request-logger';
import { logger } from '../../../src/utils/logger';
import { getRequestDuration } from '../../../src/middleware/request-id';
import { isProduction } from '../../../src/config/index';

describe('request-logger middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    (getRequestDuration as jest.Mock).mockReturnValue(100);
    (isProduction as jest.Mock).mockReturnValue(false);

    mockRequest = {
      id: 'req-123',
      correlationId: 'corr-456',
      method: 'POST',
      url: '/api/integrations',
      routerPath: '/api/integrations',
      ip: '192.168.1.1',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'TestAgent/1.0',
        'x-request-id': 'req-123',
      },
      query: { page: '1', limit: '10' },
      body: { name: 'test' },
      tenantId: 'tenant-123',
      user: { id: 'user-456' },
    };

    mockReply = {
      statusCode: 200,
    };
  });

  describe('requestLoggerOnRequest', () => {
    it('should log incoming request', async () => {
      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'POST /api/integrations',
        expect.objectContaining({
          type: 'request',
          requestId: 'req-123',
          correlationId: 'corr-456',
          method: 'POST',
          url: '/api/integrations',
          tenantId: 'tenant-123',
          userId: 'user-456',
        })
      );
    });

    it('should skip health check endpoints', async () => {
      mockRequest.url = '/health';

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should skip /health/live endpoint', async () => {
      mockRequest.url = '/health/live';

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should skip /health/ready endpoint', async () => {
      mockRequest.url = '/health/ready';

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should skip /metrics endpoint', async () => {
      mockRequest.url = '/metrics';

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should redact authorization header', async () => {
      mockRequest.headers = {
        ...mockRequest.headers,
        authorization: 'Bearer secret-token',
      };

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            authorization: 'Bearer secret-token',
          }),
        })
      );
    });

    it('should log body in non-production', async () => {
      (isProduction as jest.Mock).mockReturnValue(false);
      mockRequest.body = { secret: 'value' };

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.any(String),
        })
      );
    });

    it('should not log body in production', async () => {
      (isProduction as jest.Mock).mockReturnValue(true);
      mockRequest.body = { secret: 'value' };

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: undefined,
        })
      );
    });

    it('should extract client IP from x-forwarded-for', async () => {
      mockRequest.headers = {
        ...mockRequest.headers,
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      };

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ip: '10.0.0.1',
        })
      );
    });

    it('should use request.ip when x-forwarded-for not present', async () => {
      mockRequest.ip = '192.168.1.100';

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ip: '192.168.1.100',
        })
      );
    });

    it('should handle missing user', async () => {
      mockRequest.user = undefined;

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: undefined,
        })
      );
    });

    it('should log query parameters', async () => {
      mockRequest.query = { search: 'test', filter: 'active' };

      await requestLoggerOnRequest(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          queryParams: { search: 'test', filter: 'active' },
        })
      );
    });
  });

  describe('requestLoggerOnResponse', () => {
    it('should log successful response', async () => {
      (getRequestDuration as jest.Mock).mockReturnValue(150);
      mockReply.statusCode = 200;

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'POST /api/integrations 200 150ms',
        expect.objectContaining({
          type: 'response',
          statusCode: 200,
          duration: 150,
        })
      );
    });

    it('should log 4xx responses as warnings', async () => {
      mockReply.statusCode = 400;

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log 5xx responses as errors', async () => {
      mockReply.statusCode = 500;

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.error).toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should log slow requests as warnings', async () => {
      (getRequestDuration as jest.Mock).mockReturnValue(6000);
      mockReply.statusCode = 200;

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[SLOW]'),
        expect.any(Object)
      );
    });

    it('should skip excluded paths', async () => {
      mockRequest.url = '/health';

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should include request duration', async () => {
      (getRequestDuration as jest.Mock).mockReturnValue(250);

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          duration: 250,
        })
      );
    });

    it('should log 404 as warning', async () => {
      mockReply.statusCode = 404;

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should log 201 created as info', async () => {
      mockReply.statusCode = 201;

      await requestLoggerOnResponse(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('requestLoggerOnError', () => {
    it('should log error with details', async () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      (getRequestDuration as jest.Mock).mockReturnValue(200);

      await requestLoggerOnError(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        error
      );

      expect(logger.error).toHaveBeenCalledWith(
        'POST /api/integrations ERROR 200ms',
        expect.objectContaining({
          type: 'error',
          duration: 200,
          error: {
            name: 'Error',
            message: 'Test error',
            stack: 'Error stack trace',
          },
        })
      );
    });

    it('should not log stack in production', async () => {
      (isProduction as jest.Mock).mockReturnValue(true);
      const error = new Error('Production error');
      error.stack = 'Should not appear';

      await requestLoggerOnError(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        error
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: expect.objectContaining({
            stack: undefined,
          }),
        })
      );
    });

    it('should include tenant and user context', async () => {
      const error = new Error('Context error');

      await requestLoggerOnError(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        error
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tenantId: 'tenant-123',
          userId: 'user-456',
        })
      );
    });

    it('should log error name and message', async () => {
      const error = new TypeError('Invalid type');

      await requestLoggerOnError(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        error
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'TypeError',
            message: 'Invalid type',
          }),
        })
      );
    });
  });
});
