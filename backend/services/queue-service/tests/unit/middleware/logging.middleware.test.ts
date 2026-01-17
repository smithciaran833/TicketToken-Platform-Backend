// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { loggingMiddleware } from '../../../src/middleware/logging.middleware';
import { logger } from '../../../src/utils/logger';

describe('Logging Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let finishHandler: () => void;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/api/queues',
      query: { page: '1' },
      ip: '127.0.0.1',
    };

    finishHandler = jest.fn();
    mockReply = {
      statusCode: 200,
      raw: {
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'finish') {
            finishHandler = handler;
          }
        }),
      } as any,
    };
  });

  describe('request logging', () => {
    it('should log incoming request with method and url', async () => {
      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'GET /api/queues',
        {
          query: { page: '1' },
          ip: '127.0.0.1',
        }
      );
    });

    it('should log POST request', async () => {
      mockRequest.method = 'POST';
      mockRequest.url = '/api/jobs';

      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'POST /api/jobs',
        expect.objectContaining({
          ip: '127.0.0.1',
        })
      );
    });

    it('should log request with empty query', async () => {
      mockRequest.query = {};

      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.info).toHaveBeenCalledWith(
        'GET /api/queues',
        {
          query: {},
          ip: '127.0.0.1',
        }
      );
    });

    it('should log request IP address', async () => {
      mockRequest.ip = '192.168.1.100';

      await loggingMiddleware(
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
  });

  describe('response logging', () => {
    it('should register finish event handler on reply.raw', async () => {
      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.raw!.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should log response with status code on finish', async () => {
      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Trigger the finish event
      finishHandler();

      expect(logger.info).toHaveBeenCalledWith(
        'GET /api/queues - 200',
        expect.objectContaining({
          duration: expect.stringMatching(/^\d+ms$/),
        })
      );
    });

    it('should log different status codes', async () => {
      mockReply.statusCode = 404;

      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      finishHandler();

      expect(logger.info).toHaveBeenCalledWith(
        'GET /api/queues - 404',
        expect.any(Object)
      );
    });

    it('should log 500 status code', async () => {
      mockReply.statusCode = 500;
      mockRequest.method = 'POST';
      mockRequest.url = '/api/jobs';

      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      finishHandler();

      expect(logger.info).toHaveBeenCalledWith(
        'POST /api/jobs - 500',
        expect.any(Object)
      );
    });

    it('should calculate duration between request and response', async () => {
      jest.useFakeTimers();

      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Advance time by 150ms
      jest.advanceTimersByTime(150);

      finishHandler();

      expect(logger.info).toHaveBeenLastCalledWith(
        expect.any(String),
        { duration: '150ms' }
      );

      jest.useRealTimers();
    });

    it('should log 0ms for immediate response', async () => {
      jest.useFakeTimers();

      await loggingMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // No time advance
      finishHandler();

      expect(logger.info).toHaveBeenLastCalledWith(
        expect.any(String),
        { duration: '0ms' }
      );

      jest.useRealTimers();
    });
  });
});
