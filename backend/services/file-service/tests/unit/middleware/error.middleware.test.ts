/**
 * Unit Tests for Error Middleware
 */

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { errorHandler } from '../../../src/middleware/error.middleware';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('middleware/error', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = require('../../../src/utils/logger').logger;

    mockRequest = {
      url: '/test/path',
      method: 'POST',
      id: 'req-123',
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('errorHandler', () => {
    it('should handle error with statusCode', () => {
      const error: FastifyError = {
        statusCode: 404,
        message: 'Not found',
        name: 'NotFoundError',
        code: 'NOT_FOUND',
      };

      errorHandler(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        {
          err: error,
          url: '/test/path',
          method: 'POST',
        },
        'Request error'
      );

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Not found',
        statusCode: 404,
        timestamp: expect.any(String),
      });
    });

    it('should default to 500 status code when not provided', () => {
      const error: FastifyError = {
        message: 'Internal error',
        name: 'Error',
        code: 'ERR_INTERNAL',
      };

      errorHandler(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal error',
        statusCode: 500,
        timestamp: expect.any(String),
      });
    });

    it('should use default message when not provided', () => {
      const error: FastifyError = {
        name: 'Error',
        code: 'ERR_UNKNOWN',
      } as FastifyError;

      errorHandler(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        statusCode: 500,
        timestamp: expect.any(String),
      });
    });

    it('should include ISO timestamp in response', () => {
      const error: FastifyError = {
        statusCode: 400,
        message: 'Bad request',
        name: 'BadRequestError',
        code: 'BAD_REQUEST',
      };

      errorHandler(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const sendCall = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sendCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle various HTTP status codes', () => {
      const testCases = [
        { statusCode: 400, message: 'Bad Request' },
        { statusCode: 401, message: 'Unauthorized' },
        { statusCode: 403, message: 'Forbidden' },
        { statusCode: 404, message: 'Not Found' },
        { statusCode: 409, message: 'Conflict' },
        { statusCode: 422, message: 'Unprocessable Entity' },
        { statusCode: 500, message: 'Internal Server Error' },
        { statusCode: 503, message: 'Service Unavailable' },
      ];

      testCases.forEach(({ statusCode, message }) => {
        jest.clearAllMocks();

        const error: FastifyError = {
          statusCode,
          message,
          name: 'TestError',
          code: 'TEST',
        };

        errorHandler(
          error,
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.status).toHaveBeenCalledWith(statusCode);
        expect(mockReply.send).toHaveBeenCalledWith({
          error: message,
          statusCode,
          timestamp: expect.any(String),
        });
      });
    });

    it('should log error with request context', () => {
      // Create a new mock request with specific values instead of reassigning
      const uploadRequest: Partial<FastifyRequest> = {
        url: '/api/files/upload',
        method: 'POST',
        id: 'req-123',
      };

      const error: FastifyError = {
        statusCode: 500,
        message: 'Upload failed',
        name: 'UploadError',
        code: 'UPLOAD_FAILED',
      };

      errorHandler(
        error,
        uploadRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        {
          err: error,
          url: '/api/files/upload',
          method: 'POST',
        },
        'Request error'
      );
    });

    it('should handle error without code property', () => {
      const error = {
        statusCode: 400,
        message: 'Invalid input',
        name: 'ValidationError',
      } as FastifyError;

      errorHandler(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should handle errors with stack traces', () => {
      const error = new Error('Test error') as FastifyError;
      error.statusCode = 500;

      errorHandler(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.objectContaining({
            stack: expect.any(String),
          }),
        }),
        'Request error'
      );
    });
  });
});
