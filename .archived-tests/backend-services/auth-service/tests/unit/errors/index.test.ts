import {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  TokenError,
} from '../../../src/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Test error', 500);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error).toBeInstanceOf(Error);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error', 500);
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with errors array', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];

      const error = new ValidationError(errors);

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(422);
      expect(error.errors).toEqual(errors);
    });
  });

  describe('NotFoundError', () => {
    it('should create 404 error with default message', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create 404 error with custom resource', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('AuthenticationError', () => {
    it('should create 401 error with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
    });

    it('should create 401 error with custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('AuthorizationError', () => {
    it('should create 403 error with default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should create 403 error with custom message', () => {
      const error = new AuthorizationError('Insufficient permissions');

      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('ConflictError', () => {
    it('should create 409 error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
    });
  });

  describe('RateLimitError', () => {
    it('should create 429 error', () => {
      const error = new RateLimitError('Too many requests');

      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
    });

    it('should include TTL when provided', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.message).toBe('Too many requests');
      expect(error.statusCode).toBe(429);
      expect(error.ttl).toBe(60);
    });
  });

  describe('TokenError', () => {
    it('should create 401 error with default message', () => {
      const error = new TokenError();

      expect(error.message).toBe('Invalid or expired token');
      expect(error.statusCode).toBe(401);
    });

    it('should create 401 error with custom message', () => {
      const error = new TokenError('Token expired');

      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });
  });
});
