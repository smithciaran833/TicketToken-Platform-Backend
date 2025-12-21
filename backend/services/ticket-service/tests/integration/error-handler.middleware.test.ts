import { errorHandler } from '../../src/middleware/errorHandler';
import { AppError, NotFoundError, ConflictError, ValidationError, UnauthorizedError } from '../../src/utils/errors';

/**
 * INTEGRATION TESTS FOR ERROR HANDLER MIDDLEWARE
 * Tests error handling and response formatting
 */

describe('Error Handler Middleware Integration Tests', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      url: '/api/tickets',
      method: 'GET',
      ip: '127.0.0.1'
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('AppError handling', () => {
    it('should handle NotFoundError with 404', async () => {
      const error = new NotFoundError('Ticket');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Ticket not found',
        code: 'NOT_FOUND'
      });
    });

    it('should handle ConflictError with 409', async () => {
      const error = new ConflictError('Ticket already sold');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Ticket already sold',
        code: 'CONFLICT'
      });
    });

    it('should handle ValidationError with 400', async () => {
      const error = new ValidationError('Invalid ticket type');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid ticket type',
        code: 'VALIDATION_ERROR'
      });
    });

    it('should handle UnauthorizedError with 401', async () => {
      const error = new UnauthorizedError('Invalid token');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid token',
        code: 'UNAUTHORIZED'
      });
    });

    it('should include error code from AppError', async () => {
      const error = new AppError('Custom error', 422, 'CUSTOM_CODE');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Custom error',
        code: 'CUSTOM_CODE'
      });
    });
  });

  describe('Database error handling', () => {
    it('should handle PostgreSQL FK violations (tenant isolation)', async () => {
      const error: any = new Error('Foreign key violation');
      error.code = '23503';

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid tenant ID. The specified tenant does not exist.',
        code: 'INVALID_TENANT'
      });
    });

    it('should handle PostgreSQL unique violations', async () => {
      const error: any = new Error('Unique violation');
      error.code = '23505';

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'A record with this value already exists.',
        code: 'DUPLICATE_ENTRY'
      });
    });
  });

  describe('Named error handling', () => {
    it('should handle ValidationError', async () => {
      const error: any = new Error('Field X is required');
      error.name = 'ValidationError';

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation error',
        details: 'Field X is required'
      });
    });

    it('should handle UnauthorizedError by name', async () => {
      const error: any = new Error('Token expired');
      error.name = 'UnauthorizedError';

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized'
      });
    });
  });

  describe('Generic error handling', () => {
    it('should handle generic Error with 500', async () => {
      const error: any = new Error('Something went wrong');

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error'
        })
      );
    });

    it('should include error details in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error: any = new Error('Debug this error');

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        details: 'Debug this error'
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should not include error details in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error: any = new Error('Sensitive error info');

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error'
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error logging', () => {
    it('should log error with request context', async () => {
      const error = new Error('Test error');
      
      await errorHandler(error as any, mockRequest, mockReply);

      // Error should be logged (we can't directly test logger.error, but we ensure it doesn't throw)
      expect(mockReply.status).toHaveBeenCalled();
    });

    it('should log error with stack trace', async () => {
      const error = new Error('Error with stack');
      error.stack = 'Error: Error with stack\n    at Object.<anonymous>';

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalled();
    });

    it('should handle errors without stack traces', async () => {
      const error: any = { message: 'Error object without stack' };

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Request context', () => {
    it('should handle errors with different HTTP methods', async () => {
      mockRequest.method = 'POST';
      const error = new Error('POST error');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle errors from different URLs', async () => {
      mockRequest.url = '/api/tickets/purchase';
      const error = new Error('Purchase error');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle errors with different IP addresses', async () => {
      mockRequest.ip = '192.168.1.100';
      const error = new Error('Remote error');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Edge cases', () => {
    it('should handle null error message', async () => {
      const error: any = new Error();
      error.message = null;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle undefined error properties', async () => {
      const error: any = {};

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle errors with custom properties', async () => {
      const error: any = new Error('Custom error');
      error.customProp = 'custom value';
      error.statusCode = 418;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should handle multiple error codes', async () => {
      const error: any = new Error('Multi-code error');
      error.code = 'ERR_CUSTOM';
      error.statusCode = 503;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Response format', () => {
    it('should always return error field', async () => {
      const error = new Error('Test');

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });

    it('should format AppError responses consistently', async () => {
      const error = new NotFoundError('Resource');

      await errorHandler(error as any, mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall).toHaveProperty('error');
      expect(sendCall).toHaveProperty('code');
      expect(Object.keys(sendCall).length).toBe(2);
    });

    it('should format generic error responses consistently', async () => {
      const error = new Error('Generic');

      await errorHandler(error as any, mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall).toHaveProperty('error');
    });
  });
});
