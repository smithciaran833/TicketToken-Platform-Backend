/**
 * Unit Tests: Error Handler Middleware
 * Tests error handling for different error types
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { errorHandler } from '../../../src/middleware/error-handler.middleware';
import { ValidationError } from '../../../src/utils/validators';
import { DomainError } from '../../../src/errors/domain-errors';

describe('errorHandler middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      id: 'req-123',
      url: '/api/v1/orders',
      method: 'POST',
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('ValidationError handling', () => {
    it('should return 400 for ValidationError', async () => {
      const error = new ValidationError('email', 'Invalid email format');

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid email format',
        field: 'email',
        requestId: 'req-123',
      });
    });
  });

  describe('Fastify validation errors', () => {
    it('should return 400 for Fastify validation errors', async () => {
      const error = {
        validation: [{ message: 'must have required property' }],
        message: 'Validation failed',
      } as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: error.validation,
        requestId: 'req-123',
      });
    });
  });

  describe('DomainError handling', () => {
    it('should extract error code from DomainError', async () => {
      const error = new DomainError('Order not found', 'ORDER_NOT_FOUND', 404);

      await errorHandler(error as any, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Order not found',
        requestId: 'req-123',
      });
    });
  });

  describe('Generic error handling', () => {
    it('should return 500 for unknown errors', async () => {
      const error = new Error('Something went wrong') as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'req-123',
      });
    });

    it('should use statusCode from error if present', async () => {
      const error = { message: 'Not found', statusCode: 404 } as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Not found',
        requestId: 'req-123',
      });
    });

    it('should hide error message for 500 errors', async () => {
      const error = { message: 'Database connection failed', statusCode: 500 } as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'req-123',
      });
    });
  });

  describe('Logging', () => {
    it('should log error details', async () => {
      const { logger } = require('../../../src/utils/logger');
      const error = new Error('Test error') as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        'Unhandled error',
        expect.objectContaining({
          error: 'Test error',
          url: '/api/v1/orders',
          method: 'POST',
          requestId: 'req-123',
        })
      );
    });
  });
});
