import { AppError, errorHandler, notFoundHandler } from '../../../src/middleware/error.middleware';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/logger');

describe('Error Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      url: '/api/v1/test',
      method: 'GET'
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('AppError', () => {
    it('should create error with statusCode and message', () => {
      const error = new AppError(400, 'Bad request');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
      expect(error.isOperational).toBe(true);
    });

    it('should default isOperational to true', () => {
      const error = new AppError(500, 'Server error');

      expect(error.isOperational).toBe(true);
    });

    it('should allow setting isOperational to false', () => {
      const error = new AppError(500, 'Critical error', false);

      expect(error.isOperational).toBe(false);
    });

    it('should be instance of Error', () => {
      const error = new AppError(404, 'Not found');

      expect(error).toBeInstanceOf(Error);
    });

    it('should capture stack trace', () => {
      const error = new AppError(500, 'Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should support different status codes', () => {
      const error400 = new AppError(400, 'Bad Request');
      const error401 = new AppError(401, 'Unauthorized');
      const error403 = new AppError(403, 'Forbidden');
      const error404 = new AppError(404, 'Not Found');
      const error500 = new AppError(500, 'Internal Server Error');

      expect(error400.statusCode).toBe(400);
      expect(error401.statusCode).toBe(401);
      expect(error403.statusCode).toBe(403);
      expect(error404.statusCode).toBe(404);
      expect(error500.statusCode).toBe(500);
    });
  });

  describe('errorHandler', () => {
    describe('AppError Handling', () => {
      it('should handle AppError with correct status', () => {
        const error = new AppError(400, 'Validation failed');

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Validation failed'
        });
      });

      it('should handle 401 AppError', () => {
        const error = new AppError(401, 'Authentication required');

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Authentication required'
        });
      });

      it('should handle 403 AppError', () => {
        const error = new AppError(403, 'Access denied');

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(403);
      });

      it('should handle 404 AppError', () => {
        const error = new AppError(404, 'Resource not found');

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(404);
      });

      it('should handle 500 AppError', () => {
        const error = new AppError(500, 'Internal error');

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
      });

      it('should NOT log AppError (operational)', () => {
        const error = new AppError(400, 'Client error');

        errorHandler(error as any, mockRequest, mockReply);

        expect(logger.error).not.toHaveBeenCalled();
      });
    });

    describe('Generic Error Handling', () => {
      it('should handle generic Error as 500', () => {
        const error = new Error('Unexpected error');

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Internal server error'
        });
      });

      it('should log generic errors', () => {
        const error = new Error('Database connection failed');
        error.stack = 'Error stack trace';

        errorHandler(error as any, mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Unhandled error', {
          error: 'Database connection failed',
          stack: 'Error stack trace',
          path: '/api/v1/test',
          method: 'GET'
        });
      });

      it('should log error with request context', () => {
        mockRequest.url = '/api/v1/notifications/send';
        mockRequest.method = 'POST';
        const error = new Error('Processing failed');

        errorHandler(error as any, mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Unhandled error', expect.objectContaining({
          path: '/api/v1/notifications/send',
          method: 'POST'
        }));
      });

      it('should not expose error details to client', () => {
        const error = new Error('Database password is wrong');

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          success: false,
          error: 'Internal server error'
        });
      });

      it('should handle errors without stack trace', () => {
        const error = new Error('Simple error');
        delete error.stack;

        errorHandler(error as any, mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalledWith('Unhandled error', expect.objectContaining({
          error: 'Simple error',
          stack: undefined
        }));
      });
    });

    describe('Fastify Error Handling', () => {
      it('should handle Fastify validation error', () => {
        const error = {
          name: 'FastifyError',
          message: 'Validation error',
          statusCode: 400,
          validation: [{ field: 'email', message: 'Invalid email' }]
        };

        errorHandler(error as any, mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 status', () => {
      notFoundHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should return not found message', () => {
      notFoundHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found'
      });
    });

    it('should work for any request', () => {
      mockRequest.url = '/nonexistent/route';
      mockRequest.method = 'DELETE';

      notFoundHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found'
      });
    });
  });

  describe('Error Response Format', () => {
    it('should have consistent error response structure', () => {
      const error = new AppError(400, 'Test error');

      errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.any(String)
      });
    });

    it('should include success: false in all error responses', () => {
      const error = new Error('Generic error');

      errorHandler(error as any, mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.success).toBe(false);
    });
  });
});
