import { errorHandler } from '../../../src/middleware/error-handler';
import { AppError } from '../../../src/types';
import { FastifyRequest, FastifyReply } from 'fastify';

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    error: jest.fn(),
  })),
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      method: 'GET',
      url: '/test',
      params: {},
      query: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('AppError handling', () => {
    it('should handle AppError with custom status', () => {
      const error = new AppError('Not found', 404, 'NOT_FOUND');

      errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Not found',
        code: 'NOT_FOUND',
        details: undefined,
      });
    });

    it('should handle AppError with details', () => {
      const error = new AppError('Validation failed', 422, 'VALIDATION', [{ field: 'email' }]);

      errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          details: [{ field: 'email' }],
        })
      );
    });
  });

  describe('Validation error handling', () => {
    it('should handle Fastify validation errors', () => {
      const error: any = {
        validation: [
          { field: 'name', message: 'Required' },
        ],
      };

      errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.validation,
      });
    });
  });

  describe('Generic error handling', () => {
    it('should handle generic Error with 500', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    });

    it('should handle error with custom statusCode', () => {
      const error: any = new Error('Bad request');
      error.statusCode = 400;

      errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Bad request',
        code: 'INTERNAL_ERROR',
      });
    });
  });
});
