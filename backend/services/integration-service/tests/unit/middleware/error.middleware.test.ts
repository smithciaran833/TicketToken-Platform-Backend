// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { errorHandler } from '../../../src/middleware/error.middleware';
import { logger } from '../../../src/utils/logger';

describe('error.middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      code: mockCode,
    };

    mockRequest = {
      url: '/test/endpoint',
      method: 'POST',
    };
  });

  describe('errorHandler', () => {
    it('should log error with details', async () => {
      const error: FastifyError = {
        name: 'TestError',
        message: 'Test error message',
        stack: 'Error stack trace',
        statusCode: 500,
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.error).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          error: 'Test error message',
          stack: 'Error stack trace',
          path: '/test/endpoint',
          method: 'POST',
        })
      );
    });

    it('should handle ValidationError with 400 status', async () => {
      const error: FastifyError = {
        name: 'ValidationError',
        message: 'Validation failed',
        statusCode: 400,
        details: ['Field is required', 'Invalid format'],
      } as any;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCode).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details: ['Field is required', 'Invalid format'],
      });
    });

    it('should handle UnauthorizedError with 401 status', async () => {
      const error: FastifyError = {
        name: 'UnauthorizedError',
        message: 'Unauthorized access',
        statusCode: 401,
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCode).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('should use error statusCode when available', async () => {
      const error: FastifyError = {
        name: 'CustomError',
        message: 'Custom error message',
        statusCode: 403,
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCode).toHaveBeenCalledWith(403);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Custom error message',
      });
    });

    it('should default to 500 when statusCode not available', async () => {
      const error: FastifyError = {
        name: 'Error',
        message: 'Unknown error',
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCode).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown error',
      });
    });

    it('should use default message when error message not available', async () => {
      const error: FastifyError = {
        name: 'Error',
        message: '',
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });

    it('should handle error without stack trace', async () => {
      const error: FastifyError = {
        name: 'TestError',
        message: 'Error without stack',
        statusCode: 500,
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.error).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          error: 'Error without stack',
          stack: undefined,
        })
      );
    });

    it('should include request URL and method in log', async () => {
      mockRequest.url = '/api/integrations';
      mockRequest.method = 'GET';

      const error: FastifyError = {
        name: 'Error',
        message: 'Test error',
        statusCode: 500,
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.error).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          path: '/api/integrations',
          method: 'GET',
        })
      );
    });

    it('should handle 404 errors', async () => {
      const error: FastifyError = {
        name: 'NotFoundError',
        message: 'Resource not found',
        statusCode: 404,
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCode).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found',
      });
    });

    it('should handle 409 conflict errors', async () => {
      const error: FastifyError = {
        name: 'ConflictError',
        message: 'Resource already exists',
        statusCode: 409,
      } as FastifyError;

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCode).toHaveBeenCalledWith(409);
      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        error: 'Resource already exists',
      });
    });
  });
});
