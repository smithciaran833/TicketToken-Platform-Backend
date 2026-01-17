import {
  ApiError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
} from '../../../src/types/index';

describe('types/index.ts - Error Classes', () => {
  describe('ApiError', () => {
    it('creates error with statusCode and message', () => {
      const error = new ApiError(400, 'Bad request');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
      expect(error.name).toBe('ApiError');
    });

    it('includes optional code', () => {
      const error = new ApiError(500, 'Server error', 'INTERNAL_ERROR');

      expect(error.code).toBe('INTERNAL_ERROR');
    });

    it('includes optional details', () => {
      const details = { field: 'email', reason: 'invalid' };
      const error = new ApiError(400, 'Validation failed', 'VALIDATION', details);

      expect(error.details).toEqual(details);
    });

    it('captures stack trace', () => {
      const error = new ApiError(500, 'Test error');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('is instanceof Error', () => {
      const error = new ApiError(500, 'Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof ApiError).toBe(true);
    });
  });

  describe('ValidationError', () => {
    it('creates error with 422 status code', () => {
      const error = new ValidationError('Invalid input');

      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Invalid input');
    });

    it('sets code to VALIDATION_ERROR', () => {
      const error = new ValidationError('Invalid input');

      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('sets name to ValidationError', () => {
      const error = new ValidationError('Invalid input');

      expect(error.name).toBe('ValidationError');
    });

    it('includes optional details', () => {
      const details = { fields: ['email', 'password'] };
      const error = new ValidationError('Multiple fields invalid', details);

      expect(error.details).toEqual(details);
    });

    it('is instanceof ApiError', () => {
      const error = new ValidationError('Test');

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });
  });

  describe('AuthenticationError', () => {
    it('creates error with 401 status code', () => {
      const error = new AuthenticationError();

      expect(error.statusCode).toBe(401);
    });

    it('uses default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
    });

    it('accepts custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });

    it('sets code to AUTHENTICATION_ERROR', () => {
      const error = new AuthenticationError();

      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('sets name to AuthenticationError', () => {
      const error = new AuthenticationError();

      expect(error.name).toBe('AuthenticationError');
    });

    it('is instanceof ApiError', () => {
      const error = new AuthenticationError();

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof AuthenticationError).toBe(true);
    });
  });

  describe('AuthorizationError', () => {
    it('creates error with 403 status code', () => {
      const error = new AuthorizationError();

      expect(error.statusCode).toBe(403);
    });

    it('uses default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Insufficient permissions');
    });

    it('accepts custom message', () => {
      const error = new AuthorizationError('Access denied to resource');

      expect(error.message).toBe('Access denied to resource');
    });

    it('sets code to AUTHORIZATION_ERROR', () => {
      const error = new AuthorizationError();

      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });

    it('sets name to AuthorizationError', () => {
      const error = new AuthorizationError();

      expect(error.name).toBe('AuthorizationError');
    });

    it('is instanceof ApiError', () => {
      const error = new AuthorizationError();

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof AuthorizationError).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    it('creates error with 404 status code', () => {
      const error = new NotFoundError();

      expect(error.statusCode).toBe(404);
    });

    it('uses default resource name', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
    });

    it('accepts custom resource name', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
    });

    it('sets code to NOT_FOUND', () => {
      const error = new NotFoundError();

      expect(error.code).toBe('NOT_FOUND');
    });

    it('sets name to NotFoundError', () => {
      const error = new NotFoundError();

      expect(error.name).toBe('NotFoundError');
    });

    it('is instanceof ApiError', () => {
      const error = new NotFoundError();

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof NotFoundError).toBe(true);
    });
  });

  describe('ConflictError', () => {
    it('creates error with 409 status code', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.statusCode).toBe(409);
    });

    it('uses provided message', () => {
      const error = new ConflictError('Email already in use');

      expect(error.message).toBe('Email already in use');
    });

    it('sets code to CONFLICT_ERROR', () => {
      const error = new ConflictError('Conflict');

      expect(error.code).toBe('CONFLICT_ERROR');
    });

    it('sets name to ConflictError', () => {
      const error = new ConflictError('Conflict');

      expect(error.name).toBe('ConflictError');
    });

    it('is instanceof ApiError', () => {
      const error = new ConflictError('Test');

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof ConflictError).toBe(true);
    });
  });

  describe('RateLimitError', () => {
    it('creates error with 429 status code', () => {
      const error = new RateLimitError();

      expect(error.statusCode).toBe(429);
    });

    it('uses fixed message', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Too many requests');
    });

    it('sets code to RATE_LIMIT_ERROR', () => {
      const error = new RateLimitError();

      expect(error.code).toBe('RATE_LIMIT_ERROR');
    });

    it('sets name to RateLimitError', () => {
      const error = new RateLimitError();

      expect(error.name).toBe('RateLimitError');
    });

    it('includes retryAfter in details when provided', () => {
      const error = new RateLimitError(60);

      expect(error.details).toEqual({ retryAfter: 60 });
    });

    it('includes undefined retryAfter when not provided', () => {
      const error = new RateLimitError();

      expect(error.details).toEqual({ retryAfter: undefined });
    });

    it('is instanceof ApiError', () => {
      const error = new RateLimitError();

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof RateLimitError).toBe(true);
    });
  });

  describe('ServiceUnavailableError', () => {
    it('creates error with 503 status code', () => {
      const error = new ServiceUnavailableError('payment-service');

      expect(error.statusCode).toBe(503);
    });

    it('includes service name in message', () => {
      const error = new ServiceUnavailableError('auth-service');

      expect(error.message).toBe('Service unavailable: auth-service');
    });

    it('sets code to SERVICE_UNAVAILABLE', () => {
      const error = new ServiceUnavailableError('test-service');

      expect(error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('sets name to ServiceUnavailableError', () => {
      const error = new ServiceUnavailableError('test-service');

      expect(error.name).toBe('ServiceUnavailableError');
    });

    it('is instanceof ApiError', () => {
      const error = new ServiceUnavailableError('test');

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof ServiceUnavailableError).toBe(true);
    });
  });
});
