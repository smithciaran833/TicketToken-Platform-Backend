/**
 * Error Handler Middleware Unit Tests
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  errorHandler,
} from '../../../src/middleware/error-handler';
import { logger } from '../../../src/utils/logger';

describe('Error Handler Middleware', () => {
  describe('AppError', () => {
    it('should create error with default status code', () => {
      const error = new AppError('Something went wrong');
      
      expect(error.message).toBe('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBeUndefined();
      expect(error.name).toBe('AppError');
    });

    it('should create error with custom status code and code', () => {
      const error = new AppError('Custom error', 422, 'CUSTOM_CODE');
      
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('CUSTOM_CODE');
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    it('should create with 400 status and VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('NotFoundError', () => {
    it('should create with 404 status and formatted message', () => {
      const error = new NotFoundError('User');
      
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create with default message', () => {
      const error = new UnauthorizedError();
      
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should create with custom message', () => {
      const error = new UnauthorizedError('Invalid credentials');
      
      expect(error.message).toBe('Invalid credentials');
    });
  });

  describe('ForbiddenError', () => {
    it('should create with default message', () => {
      const error = new ForbiddenError();
      
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });
  });

  describe('errorHandler', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      
      mockReq = {
        path: '/api/test',
        method: 'GET',
      };
      
      mockRes = {
        headersSent: false,
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      
      mockNext = jest.fn();
    });

    it('should call next if headers already sent', () => {
      mockRes.headersSent = true;
      const error = new Error('Test error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle AppError with proper status and format', () => {
      const error = new ValidationError('Invalid email');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email',
        code: 'VALIDATION_ERROR',
      });
    });

    it('should log AppError details', () => {
      const error = new NotFoundError('Resource');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledWith({
        error: 'Resource not found',
        code: 'NOT_FOUND',
        statusCode: 404,
        path: '/api/test',
        method: 'GET',
      });
    });

    it('should handle unexpected errors with 500 status', () => {
      const error = new Error('Unexpected error');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });

    it('should log unexpected error with stack trace', () => {
      const error = new Error('DB connection failed');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'DB connection failed',
          stack: expect.any(String),
          path: '/api/test',
          method: 'GET',
        })
      );
    });

    it('should not expose internal error details to client', () => {
      const error = new Error('Database password: secret123');

      errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });
});
