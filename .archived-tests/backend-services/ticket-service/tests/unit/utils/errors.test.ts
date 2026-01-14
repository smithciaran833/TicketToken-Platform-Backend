// =============================================================================
// TEST SUITE - errors.ts
// =============================================================================

import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
} from '../../../src/utils/errors';

describe('Error classes', () => {
  // =============================================================================
  // AppError - 10 test cases
  // =============================================================================

  describe('AppError', () => {
    it('should create error with message', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
    });

    it('should have default status code 500', () => {
      const error = new AppError('Test error');

      expect(error.statusCode).toBe(500);
    });

    it('should accept custom status code', () => {
      const error = new AppError('Test error', 400);

      expect(error.statusCode).toBe(400);
    });

    it('should accept error code', () => {
      const error = new AppError('Test error', 400, 'CUSTOM_ERROR');

      expect(error.code).toBe('CUSTOM_ERROR');
    });

    it('should extend Error class', () => {
      const error = new AppError('Test error');

      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct name', () => {
      const error = new AppError('Test error');

      expect(error.name).toBe('AppError');
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should be throwable', () => {
      expect(() => {
        throw new AppError('Test error');
      }).toThrow('Test error');
    });

    it('should be catchable', () => {
      try {
        throw new AppError('Test error', 400, 'TEST');
      } catch (error: any) {
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('TEST');
      }
    });

    it('should preserve instanceof check', () => {
      const error = new AppError('Test error');

      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  // =============================================================================
  // ValidationError - 5 test cases
  // =============================================================================

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
    });

    it('should have status code 400', () => {
      const error = new ValidationError('Invalid input');

      expect(error.statusCode).toBe(400);
    });

    it('should have VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid input');

      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should extend AppError', () => {
      const error = new ValidationError('Invalid input');

      expect(error).toBeInstanceOf(AppError);
    });

    it('should have correct name', () => {
      const error = new ValidationError('Invalid input');

      expect(error.name).toBe('ValidationError');
    });
  });

  // =============================================================================
  // NotFoundError - 5 test cases
  // =============================================================================

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
    });

    it('should have status code 404', () => {
      const error = new NotFoundError('User');

      expect(error.statusCode).toBe(404);
    });

    it('should have NOT_FOUND code', () => {
      const error = new NotFoundError('User');

      expect(error.code).toBe('NOT_FOUND');
    });

    it('should extend AppError', () => {
      const error = new NotFoundError('Resource');

      expect(error).toBeInstanceOf(AppError);
    });

    it('should accept different resource names', () => {
      const error1 = new NotFoundError('Ticket');
      const error2 = new NotFoundError('Event');

      expect(error1.message).toBe('Ticket not found');
      expect(error2.message).toBe('Event not found');
    });
  });

  // =============================================================================
  // ConflictError - 5 test cases
  // =============================================================================

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
    });

    it('should have status code 409', () => {
      const error = new ConflictError('Duplicate entry');

      expect(error.statusCode).toBe(409);
    });

    it('should have CONFLICT code', () => {
      const error = new ConflictError('Duplicate');

      expect(error.code).toBe('CONFLICT');
    });

    it('should extend AppError', () => {
      const error = new ConflictError('Conflict');

      expect(error).toBeInstanceOf(AppError);
    });

    it('should accept custom messages', () => {
      const error = new ConflictError('Email already registered');

      expect(error.message).toBe('Email already registered');
    });
  });

  // =============================================================================
  // UnauthorizedError - 5 test cases
  // =============================================================================

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
    });

    it('should accept custom message', () => {
      const error = new UnauthorizedError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });

    it('should have status code 401', () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
    });

    it('should have UNAUTHORIZED code', () => {
      const error = new UnauthorizedError();

      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('should extend AppError', () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(AppError);
    });
  });

  // =============================================================================
  // ForbiddenError - 5 test cases
  // =============================================================================

  describe('ForbiddenError', () => {
    it('should create forbidden error with default message', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Forbidden');
    });

    it('should accept custom message', () => {
      const error = new ForbiddenError('Access denied');

      expect(error.message).toBe('Access denied');
    });

    it('should have status code 403', () => {
      const error = new ForbiddenError();

      expect(error.statusCode).toBe(403);
    });

    it('should have FORBIDDEN code', () => {
      const error = new ForbiddenError();

      expect(error.code).toBe('FORBIDDEN');
    });

    it('should extend AppError', () => {
      const error = new ForbiddenError();

      expect(error).toBeInstanceOf(AppError);
    });
  });

  // =============================================================================
  // TooManyRequestsError - 5 test cases
  // =============================================================================

  describe('TooManyRequestsError', () => {
    it('should create rate limit error with default message', () => {
      const error = new TooManyRequestsError();

      expect(error.message).toBe('Too many requests');
    });

    it('should accept custom message', () => {
      const error = new TooManyRequestsError('Rate limit exceeded');

      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should have status code 429', () => {
      const error = new TooManyRequestsError();

      expect(error.statusCode).toBe(429);
    });

    it('should have TOO_MANY_REQUESTS code', () => {
      const error = new TooManyRequestsError();

      expect(error.code).toBe('TOO_MANY_REQUESTS');
    });

    it('should extend AppError', () => {
      const error = new TooManyRequestsError();

      expect(error).toBeInstanceOf(AppError);
    });
  });

  // =============================================================================
  // Integration tests - 5 test cases
  // =============================================================================

  describe('Error integration', () => {
    it('should differentiate between error types', () => {
      const validation = new ValidationError('Invalid');
      const notFound = new NotFoundError('User');
      const unauthorized = new UnauthorizedError();

      expect(validation.statusCode).toBe(400);
      expect(notFound.statusCode).toBe(404);
      expect(unauthorized.statusCode).toBe(401);
    });

    it('should be catchable by type', () => {
      try {
        throw new ValidationError('Test');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error).toBeInstanceOf(AppError);
      }
    });

    it('should preserve all properties', () => {
      const error = new ConflictError('Duplicate');

      expect(error.message).toBe('Duplicate');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.name).toBe('ConflictError');
      expect(error.stack).toBeDefined();
    });

    it('should work in error middleware', () => {
      const errors = [
        new ValidationError('Invalid'),
        new NotFoundError('User'),
        new UnauthorizedError(),
        new ForbiddenError(),
        new ConflictError('Duplicate'),
        new TooManyRequestsError(),
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBeGreaterThanOrEqual(400);
        expect(error.statusCode).toBeLessThan(500);
      });
    });

    it('should support error chaining', () => {
      const cause = new Error('Root cause');
      const error = new AppError('Wrapper error', 500);
      (error as any).cause = cause;

      expect((error as any).cause).toBe(cause);
    });
  });
});
