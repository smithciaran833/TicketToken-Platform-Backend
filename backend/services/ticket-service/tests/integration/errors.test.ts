import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError
} from '../../src/utils/errors';

/**
 * INTEGRATION TESTS FOR ERROR CLASSES
 * Tests custom error types and inheritance
 */

describe('Error Classes Integration Tests', () => {
  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Test error', 500);
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('AppError');
    });

    it('should create error with code', () => {
      const error = new AppError('Test error', 400, 'TEST_CODE');
      
      expect(error.code).toBe('TEST_CODE');
    });

    it('should default to 500 status code', () => {
      const error = new AppError('Test error');
      
      expect(error.statusCode).toBe(500);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error');
      
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('AppError');
    });

    it('should be throwable', () => {
      expect(() => {
        throw new AppError('Test error', 500);
      }).toThrow(AppError);
    });

    it('should be catchable as Error', () => {
      try {
        throw new AppError('Test error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AppError);
      }
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with 400 status', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should be throwable', () => {
      expect(() => {
        throw new ValidationError('Invalid field');
      }).toThrow(ValidationError);
    });

    it('should inherit from AppError', () => {
      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with 404 status', () => {
      const error = new NotFoundError('User');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
    });

    it('should format message with resource name', () => {
      const ticketError = new NotFoundError('Ticket');
      const orderError = new NotFoundError('Order');
      
      expect(ticketError.message).toBe('Ticket not found');
      expect(orderError.message).toBe('Order not found');
    });

    it('should be throwable', () => {
      expect(() => {
        throw new NotFoundError('Resource');
      }).toThrow(NotFoundError);
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error with 409 status', () => {
      const error = new ConflictError('Resource already exists');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.name).toBe('ConflictError');
    });

    it('should be throwable', () => {
      expect(() => {
        throw new ConflictError('Duplicate entry');
      }).toThrow(ConflictError);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with 401 status', () => {
      const error = new UnauthorizedError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should accept custom message', () => {
      const error = new UnauthorizedError('Invalid token');
      
      expect(error.message).toBe('Invalid token');
      expect(error.statusCode).toBe(401);
    });

    it('should be throwable', () => {
      expect(() => {
        throw new UnauthorizedError();
      }).toThrow(UnauthorizedError);
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with 403 status', () => {
      const error = new ForbiddenError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.name).toBe('ForbiddenError');
    });

    it('should accept custom message', () => {
      const error = new ForbiddenError('Insufficient permissions');
      
      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
    });

    it('should be throwable', () => {
      expect(() => {
        throw new ForbiddenError();
      }).toThrow(ForbiddenError);
    });
  });

  describe('TooManyRequestsError', () => {
    it('should create rate limit error with 429 status', () => {
      const error = new TooManyRequestsError();
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(TooManyRequestsError);
      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('TOO_MANY_REQUESTS');
      expect(error.name).toBe('TooManyRequestsError');
    });

    it('should accept custom message', () => {
      const error = new TooManyRequestsError('Rate limit exceeded');
      
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
    });

    it('should be throwable', () => {
      expect(() => {
        throw new TooManyRequestsError();
      }).toThrow(TooManyRequestsError);
    });
  });

  describe('error inheritance chain', () => {
    it('should maintain proper inheritance for ValidationError', () => {
      const error = new ValidationError('Test');
      
      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should maintain proper inheritance for NotFoundError', () => {
      const error = new NotFoundError('Test');
      
      expect(error instanceof NotFoundError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should maintain proper inheritance for ConflictError', () => {
      const error = new ConflictError('Test');
      
      expect(error instanceof ConflictError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should maintain proper inheritance for UnauthorizedError', () => {
      const error = new UnauthorizedError('Test');
      
      expect(error instanceof UnauthorizedError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should maintain proper inheritance for ForbiddenError', () => {
      const error = new ForbiddenError('Test');
      
      expect(error instanceof ForbiddenError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should maintain proper inheritance for TooManyRequestsError', () => {
      const error = new TooManyRequestsError('Test');
      
      expect(error instanceof TooManyRequestsError).toBe(true);
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('error catching by type', () => {
    it('should catch specific error type', () => {
      try {
        throw new ValidationError('Test validation');
      } catch (error) {
        if (error instanceof ValidationError) {
          expect(error.message).toBe('Test validation');
          expect(error.statusCode).toBe(400);
        } else {
          fail('Should have caught ValidationError');
        }
      }
    });

    it('should catch as AppError', () => {
      try {
        throw new NotFoundError('Resource');
      } catch (error) {
        if (error instanceof AppError) {
          expect(error.statusCode).toBe(404);
        } else {
          fail('Should have caught AppError');
        }
      }
    });

    it('should catch as generic Error', () => {
      try {
        throw new ConflictError('Conflict');
      } catch (error) {
        if (error instanceof Error) {
          expect(error.message).toBe('Conflict');
        } else {
          fail('Should have caught Error');
        }
      }
    });
  });

  describe('error serialization', () => {
    it('should serialize AppError properties', () => {
      const error = new AppError('Test error', 500, 'TEST_CODE');
      const serialized = {
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        name: error.name
      };
      
      expect(serialized).toEqual({
        message: 'Test error',
        statusCode: 500,
        code: 'TEST_CODE',
        name: 'AppError'
      });
    });

    it('should include stack in JSON stringify', () => {
      const error = new ValidationError('Test');
      const json = JSON.stringify({
        message: error.message,
        stack: error.stack
      });
      
      expect(json).toContain('Test');
      expect(json).toContain('ValidationError');
    });
  });

  describe('error with different scenarios', () => {
    it('should handle empty message', () => {
      const error = new AppError('', 500);
      expect(error.message).toBe('');
    });

    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(1000);
      const error = new AppError(longMessage, 500);
      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(1000);
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Error: "value" is <invalid> & can\'t be null!';
      const error = new ValidationError(specialMessage);
      expect(error.message).toBe(specialMessage);
    });

    it('should handle unicode in message', () => {
      const unicodeMessage = 'Ошибка проверки 错误 エラー';
      const error = new ValidationError(unicodeMessage);
      expect(error.message).toBe(unicodeMessage);
    });
  });

  describe('error comparison', () => {
    it('should differentiate between error types', () => {
      const validation = new ValidationError('Test');
      const notFound = new NotFoundError('Test');
      
      expect(validation).not.toBeInstanceOf(NotFoundError);
      expect(notFound).not.toBeInstanceOf(ValidationError);
    });

    it('should compare status codes', () => {
      const errors = [
        new ValidationError('Test'),
        new NotFoundError('Test'),
        new ConflictError('Test'),
        new UnauthorizedError('Test'),
        new ForbiddenError('Test'),
        new TooManyRequestsError('Test')
      ];
      
      const statusCodes = errors.map(e => e.statusCode);
      expect(statusCodes).toEqual([400, 404, 409, 401, 403, 429]);
    });
  });
});
