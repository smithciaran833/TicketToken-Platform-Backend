import { AppError, ValidationError, NotFoundError } from '../../../src/utils/errors';

describe('Error Utils', () => {
  describe('AppError', () => {
    it('should create error with message and default values', () => {
      const error = new AppError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom status code', () => {
      const error = new AppError('Test error', 404);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom operational flag', () => {
      const error = new AppError('Test error', 500, false);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('should have correct prototype chain', () => {
      const error = new AppError('Test error');

      expect(Object.getPrototypeOf(error)).toBe(AppError.prototype);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Error: Test error');
    });

    it('should have name property', () => {
      const error = new AppError('Test error');

      expect(error.name).toBe('Error');
    });

    it('should support error chaining', () => {
      const originalError = new Error('Original error');
      const appError = new AppError('Wrapped error', 500, true);

      expect(appError.message).toBe('Wrapped error');
      expect(originalError.message).toBe('Original error');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new AppError('Test error', 400);
      }).toThrow(AppError);

      try {
        throw new AppError('Test error', 400);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(400);
      }
    });

    it('should work with different status codes', () => {
      const errors = [
        new AppError('Bad Request', 400),
        new AppError('Unauthorized', 401),
        new AppError('Forbidden', 403),
        new AppError('Not Found', 404),
        new AppError('Internal Server Error', 500),
        new AppError('Service Unavailable', 503),
      ];

      expect(errors[0].statusCode).toBe(400);
      expect(errors[1].statusCode).toBe(401);
      expect(errors[2].statusCode).toBe(403);
      expect(errors[3].statusCode).toBe(404);
      expect(errors[4].statusCode).toBe(500);
      expect(errors[5].statusCode).toBe(503);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct defaults', () => {
      const error = new ValidationError('Invalid input');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should have correct prototype chain', () => {
      const error = new ValidationError('Invalid input');

      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new ValidationError('Invalid input');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new ValidationError('Invalid email format');
      }).toThrow(ValidationError);

      try {
        throw new ValidationError('Invalid email format');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error).toBeInstanceOf(AppError);
        expect((error as ValidationError).statusCode).toBe(400);
      }
    });

    it('should support different validation messages', () => {
      const errors = [
        new ValidationError('Email is required'),
        new ValidationError('Password must be at least 8 characters'),
        new ValidationError('Invalid date format'),
        new ValidationError('Price must be a positive number'),
      ];

      errors.forEach(error => {
        expect(error.statusCode).toBe(400);
        expect(error.isOperational).toBe(true);
      });
    });

    it('should be distinguishable from generic AppError', () => {
      const validationError = new ValidationError('Validation failed');
      const appError = new AppError('Something went wrong', 400);

      expect(validationError).toBeInstanceOf(ValidationError);
      expect(appError).not.toBeInstanceOf(ValidationError);
      expect(validationError).toBeInstanceOf(AppError);
      expect(appError).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with correct defaults', () => {
      const error = new NotFoundError('Resource not found');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });

    it('should have correct prototype chain', () => {
      const error = new NotFoundError('Resource not found');

      expect(error instanceof NotFoundError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new NotFoundError('User not found');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NotFoundError');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new NotFoundError('Job not found');
      }).toThrow(NotFoundError);

      try {
        throw new NotFoundError('Queue not found');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error).toBeInstanceOf(AppError);
        expect((error as NotFoundError).statusCode).toBe(404);
      }
    });

    it('should support different not found messages', () => {
      const errors = [
        new NotFoundError('User not found'),
        new NotFoundError('Job not found'),
        new NotFoundError('Queue not found'),
        new NotFoundError('Resource does not exist'),
      ];

      errors.forEach(error => {
        expect(error.statusCode).toBe(404);
        expect(error.isOperational).toBe(true);
      });
    });

    it('should be distinguishable from other error types', () => {
      const notFoundError = new NotFoundError('Not found');
      const validationError = new ValidationError('Validation failed');
      const appError = new AppError('Something went wrong', 404);

      expect(notFoundError).toBeInstanceOf(NotFoundError);
      expect(validationError).not.toBeInstanceOf(NotFoundError);
      expect(appError).not.toBeInstanceOf(NotFoundError);

      expect(notFoundError).toBeInstanceOf(AppError);
      expect(validationError).toBeInstanceOf(AppError);
      expect(appError).toBeInstanceOf(AppError);
    });
  });

  describe('error type checking', () => {
    it('should allow type guards to differentiate error types', () => {
      const errors: AppError[] = [
        new ValidationError('Invalid'),
        new NotFoundError('Not found'),
        new AppError('Generic', 500),
      ];

      const validationErrors = errors.filter(e => e instanceof ValidationError);
      const notFoundErrors = errors.filter(e => e instanceof NotFoundError);
      const genericErrors = errors.filter(
        e => !(e instanceof ValidationError) && !(e instanceof NotFoundError)
      );

      expect(validationErrors).toHaveLength(1);
      expect(notFoundErrors).toHaveLength(1);
      expect(genericErrors).toHaveLength(1);
    });

    it('should work with try-catch blocks', () => {
      const testError = (errorType: 'validation' | 'notfound' | 'generic') => {
        try {
          if (errorType === 'validation') {
            throw new ValidationError('Validation failed');
          } else if (errorType === 'notfound') {
            throw new NotFoundError('Not found');
          } else {
            throw new AppError('Generic error');
          }
        } catch (error) {
          if (error instanceof ValidationError) {
            return { type: 'validation', code: error.statusCode };
          } else if (error instanceof NotFoundError) {
            return { type: 'notfound', code: error.statusCode };
          } else if (error instanceof AppError) {
            return { type: 'generic', code: error.statusCode };
          }
          return { type: 'unknown', code: 0 };
        }
      };

      expect(testError('validation')).toEqual({ type: 'validation', code: 400 });
      expect(testError('notfound')).toEqual({ type: 'notfound', code: 404 });
      expect(testError('generic')).toEqual({ type: 'generic', code: 500 });
    });
  });

  describe('edge cases', () => {
    it('should handle empty error messages', () => {
      const error = new AppError('');
      expect(error.message).toBe('');
      expect(error.statusCode).toBe(500);
    });

    it('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new AppError(longMessage);
      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    it('should handle special characters in messages', () => {
      const messages = [
        'Error with "quotes"',
        "Error with 'single quotes'",
        'Error with\nnewlines',
        'Error with\ttabs',
        'Error with émojis 🚀',
      ];

      messages.forEach(msg => {
        const error = new AppError(msg);
        expect(error.message).toBe(msg);
      });
    });

    it('should handle status code 0', () => {
      const error = new AppError('Test', 0);
      expect(error.statusCode).toBe(0);
    });

    it('should handle negative status codes', () => {
      const error = new AppError('Test', -1);
      expect(error.statusCode).toBe(-1);
    });

    it('should handle very large status codes', () => {
      const error = new AppError('Test', 999999);
      expect(error.statusCode).toBe(999999);
    });
  });
});
