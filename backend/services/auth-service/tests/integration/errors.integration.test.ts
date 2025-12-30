import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  TokenError
} from '../../src/errors';

/**
 * INTEGRATION TESTS FOR ERROR CLASSES
 *
 * These tests verify custom error classes:
 * - Error inheritance and properties
 * - Status codes and messages
 * - Stack trace capture
 * - No mocks needed (pure class testing)
 */

describe('Error Classes Integration Tests', () => {
  describe('AppError (base class)', () => {
    it('should set message from constructor', () => {
      const error = new AppError('Test error message', 500);

      expect(error.message).toBe('Test error message');
    });

    it('should set statusCode from constructor', () => {
      const error = new AppError('Test error', 503);

      expect(error.statusCode).toBe(503);
    });

    it('should set isOperational to true', () => {
      const error = new AppError('Test error', 500);

      expect(error.isOperational).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error', 500);

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      // Stack trace should contain the test file where error was created
      expect(error.stack).toContain('errors.integration.test');
    });

    it('should be instanceof Error', () => {
      const error = new AppError('Test error', 500);

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof AppError', () => {
      const error = new AppError('Test error', 500);

      expect(error).toBeInstanceOf(AppError);
    });

    it('should work with different status codes', () => {
      const error400 = new AppError('Bad request', 400);
      const error503 = new AppError('Service unavailable', 503);

      expect(error400.statusCode).toBe(400);
      expect(error503.statusCode).toBe(503);
    });
  });

  describe('ValidationError', () => {
    it('should have message "Validation failed"', () => {
      const error = new ValidationError([]);

      expect(error.message).toBe('Validation failed');
    });

    it('should have statusCode 422', () => {
      const error = new ValidationError([]);

      expect(error.statusCode).toBe(422);
    });

    it('should store errors array', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' }
      ];
      const error = new ValidationError(errors);

      expect(error.errors).toEqual(errors);
      expect(error.errors).toHaveLength(2);
    });

    it('should be instanceof AppError', () => {
      const error = new ValidationError([]);

      expect(error).toBeInstanceOf(AppError);
    });

    it('should be instanceof ValidationError', () => {
      const error = new ValidationError([]);

      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should handle empty errors array', () => {
      const error = new ValidationError([]);

      expect(error.errors).toEqual([]);
      expect(error.errors).toHaveLength(0);
    });
  });

  describe('NotFoundError', () => {
    it('should have message "Resource not found" by default', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
    });

    it('should have custom message when resource provided', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
    });

    it('should work with different resource names', () => {
      const userError = new NotFoundError('User');
      const eventError = new NotFoundError('Event');
      const ticketError = new NotFoundError('Ticket');

      expect(userError.message).toBe('User not found');
      expect(eventError.message).toBe('Event not found');
      expect(ticketError.message).toBe('Ticket not found');
    });

    it('should have statusCode 404', () => {
      const error = new NotFoundError();

      expect(error.statusCode).toBe(404);
    });

    it('should be instanceof AppError', () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('AuthenticationError', () => {
    it('should have message "Authentication failed" by default', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
    });

    it('should have custom message when provided', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.message).toBe('Invalid credentials');
    });

    it('should have statusCode 401', () => {
      const error = new AuthenticationError();

      expect(error.statusCode).toBe(401);
    });

    it('should be instanceof AppError', () => {
      const error = new AuthenticationError();

      expect(error).toBeInstanceOf(AppError);
    });

    it('should work with different messages', () => {
      const error1 = new AuthenticationError('Token expired');
      const error2 = new AuthenticationError('Missing token');

      expect(error1.message).toBe('Token expired');
      expect(error2.message).toBe('Missing token');
    });
  });

  describe('AuthorizationError', () => {
    it('should have message "Access denied" by default', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Access denied');
    });

    it('should have custom message when provided', () => {
      const error = new AuthorizationError('Insufficient permissions');

      expect(error.message).toBe('Insufficient permissions');
    });

    it('should have statusCode 403', () => {
      const error = new AuthorizationError();

      expect(error.statusCode).toBe(403);
    });

    it('should be instanceof AppError', () => {
      const error = new AuthorizationError();

      expect(error).toBeInstanceOf(AppError);
    });

    it('should work with different messages', () => {
      const error1 = new AuthorizationError('Admin access required');
      const error2 = new AuthorizationError('Role mismatch');

      expect(error1.message).toBe('Admin access required');
      expect(error2.message).toBe('Role mismatch');
    });
  });

  describe('ConflictError', () => {
    it('should have message "Resource conflict" by default', () => {
      const error = new ConflictError();

      expect(error.message).toBe('Resource conflict');
    });

    it('should have custom message when provided', () => {
      const error = new ConflictError('Email already exists');

      expect(error.message).toBe('Email already exists');
    });

    it('should have statusCode 409', () => {
      const error = new ConflictError();

      expect(error.statusCode).toBe(409);
    });

    it('should be instanceof AppError', () => {
      const error = new ConflictError();

      expect(error).toBeInstanceOf(AppError);
    });

    it('should work with different conflict scenarios', () => {
      const emailError = new ConflictError('Email already registered');
      const usernameError = new ConflictError('Username taken');

      expect(emailError.message).toBe('Email already registered');
      expect(usernameError.message).toBe('Username taken');
    });
  });

  describe('RateLimitError', () => {
    it('should have message "Too many requests" by default', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Too many requests');
    });

    it('should have custom message when provided', () => {
      const error = new RateLimitError('Rate limit exceeded');

      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should have statusCode 429', () => {
      const error = new RateLimitError();

      expect(error.statusCode).toBe(429);
    });

    it('should store ttl when provided', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.ttl).toBe(60);
    });

    it('should have ttl undefined when not provided', () => {
      const error = new RateLimitError();

      expect(error.ttl).toBeUndefined();
    });

    it('should be instanceof AppError', () => {
      const error = new RateLimitError();

      expect(error).toBeInstanceOf(AppError);
    });

    it('should work with custom message and ttl', () => {
      const error = new RateLimitError('Slow down!', 120);

      expect(error.message).toBe('Slow down!');
      expect(error.ttl).toBe(120);
      expect(error.statusCode).toBe(429);
    });

    it('should work with only custom message', () => {
      const error = new RateLimitError('Please wait');

      expect(error.message).toBe('Please wait');
      expect(error.ttl).toBeUndefined();
    });
  });

  describe('TokenError', () => {
    it('should have message "Invalid or expired token" by default', () => {
      const error = new TokenError();

      expect(error.message).toBe('Invalid or expired token');
    });

    it('should have custom message when provided', () => {
      const error = new TokenError('Token has been revoked');

      expect(error.message).toBe('Token has been revoked');
    });

    it('should have statusCode 401', () => {
      const error = new TokenError();

      expect(error.statusCode).toBe(401);
    });

    it('should be instanceof AppError', () => {
      const error = new TokenError();

      expect(error).toBeInstanceOf(AppError);
    });

    it('should work with different token error scenarios', () => {
      const expiredError = new TokenError('Access token expired');
      const invalidError = new TokenError('Malformed token');

      expect(expiredError.message).toBe('Access token expired');
      expect(invalidError.message).toBe('Malformed token');
    });
  });

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance for all custom errors', () => {
      const validationError = new ValidationError([]);
      const notFoundError = new NotFoundError();
      const authError = new AuthenticationError();
      const authzError = new AuthorizationError();
      const conflictError = new ConflictError();
      const rateLimitError = new RateLimitError();
      const tokenError = new TokenError();

      expect(validationError).toBeInstanceOf(Error);
      expect(notFoundError).toBeInstanceOf(Error);
      expect(authError).toBeInstanceOf(Error);
      expect(authzError).toBeInstanceOf(Error);
      expect(conflictError).toBeInstanceOf(Error);
      expect(rateLimitError).toBeInstanceOf(Error);
      expect(tokenError).toBeInstanceOf(Error);

      expect(validationError).toBeInstanceOf(AppError);
      expect(notFoundError).toBeInstanceOf(AppError);
      expect(authError).toBeInstanceOf(AppError);
      expect(authzError).toBeInstanceOf(AppError);
      expect(conflictError).toBeInstanceOf(AppError);
      expect(rateLimitError).toBeInstanceOf(AppError);
      expect(tokenError).toBeInstanceOf(AppError);
    });

    it('should all have isOperational=true inherited from AppError', () => {
      const errors = [
        new ValidationError([]),
        new NotFoundError(),
        new AuthenticationError(),
        new AuthorizationError(),
        new ConflictError(),
        new RateLimitError(),
        new TokenError()
      ];

      errors.forEach(error => {
        expect(error.isOperational).toBe(true);
      });
    });

    it('should all have stack traces', () => {
      const errors = [
        new ValidationError([]),
        new NotFoundError(),
        new AuthenticationError(),
        new AuthorizationError(),
        new ConflictError(),
        new RateLimitError(),
        new TokenError()
      ];

      errors.forEach(error => {
        expect(error.stack).toBeDefined();
        expect(typeof error.stack).toBe('string');
      });
    });
  });

  describe('Error throwing and catching', () => {
    it('should be catchable with try-catch', () => {
      try {
        throw new AuthenticationError('Test error');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect(error).toBeInstanceOf(AppError);
      }
    });

    it('should preserve error type through throw/catch', () => {
      const testError = (ErrorClass: any, expectedStatusCode: number) => {
        try {
          throw new ErrorClass();
        } catch (error: any) {
          expect(error).toBeInstanceOf(ErrorClass);
          expect(error.statusCode).toBe(expectedStatusCode);
        }
      };

      testError(NotFoundError, 404);
      testError(AuthenticationError, 401);
      testError(AuthorizationError, 403);
      testError(ConflictError, 409);
      testError(RateLimitError, 429);
      testError(TokenError, 401);
    });
  });
});
