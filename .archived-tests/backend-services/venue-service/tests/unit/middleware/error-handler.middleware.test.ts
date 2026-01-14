import { errorHandler } from '../../../src/middleware/error-handler.middleware';
import { ErrorResponseBuilder } from '../../../src/utils/error-response';
import { NotFoundError, ConflictError, AppError } from '../../../src/utils/errors';

jest.mock('../../../src/utils/error-response');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      method: 'GET',
      url: '/api/v1/venues',
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  // =============================================================================
  // AppError Handling - 3 test cases
  // =============================================================================

  describe('AppError Handling', () => {
    it('should handle NotFoundError', async () => {
      const error = new NotFoundError('Venue');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        404,
        'Venue not found',
        'NOT_FOUND',
        undefined
      );
    });

    it('should handle ConflictError', async () => {
      const error = new ConflictError('Venue already exists');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        409,
        'Venue already exists',
        'CONFLICT',
        undefined
      );
    });

    it('should handle AppError with details', async () => {
      // Create a custom AppError with details
      const error = new AppError('Resource not found', 404, 'NOT_FOUND', { resourceId: '123' });

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        404,
        'Resource not found',
        'NOT_FOUND',
        { resourceId: '123' }
      );
    });
  });

  // =============================================================================
  // Fastify Validation Errors - 1 test case
  // =============================================================================

  describe('Fastify Validation Errors', () => {
    it('should handle validation errors', async () => {
      const error: any = {
        validation: [
          { field: 'name', message: 'Name is required' },
          { field: 'email', message: 'Invalid email' },
        ],
      };

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.validation).toHaveBeenCalledWith(mockReply, error.validation);
    });
  });

  // =============================================================================
  // Circuit Breaker Errors - 1 test case
  // =============================================================================

  describe('Circuit Breaker Errors', () => {
    it('should handle circuit breaker errors', async () => {
      const error = new Error('Circuit breaker is open');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        503,
        'Service temporarily unavailable',
        'SERVICE_UNAVAILABLE',
        { retryAfter: 30 }
      );
    });
  });

  // =============================================================================
  // Database Errors - 2 test cases
  // =============================================================================

  describe('Database Errors', () => {
    it('should handle QueryFailedError', async () => {
      const error: any = {
        name: 'QueryFailedError',
        message: 'Query failed',
      };

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalled();
    });

    it('should handle database connection errors', async () => {
      const error = new Error('database connection failed');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Generic Errors - 2 test cases
  // =============================================================================

  describe('Generic Errors', () => {
    it('should handle null/undefined errors', async () => {
      await errorHandler(null as any, mockRequest, mockReply);

      expect(ErrorResponseBuilder.internal).toHaveBeenCalledWith(
        mockReply,
        'An unexpected error occurred'
      );
    });

    it('should handle generic errors', async () => {
      const error = new Error('Something went wrong');
      process.env.NODE_ENV = 'development';

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.internal).toHaveBeenCalledWith(
        mockReply,
        'Something went wrong'
      );
    });
  });
});
