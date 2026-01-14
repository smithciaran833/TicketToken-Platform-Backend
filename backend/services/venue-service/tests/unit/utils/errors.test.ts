/**
 * Unit tests for src/utils/errors.ts
 * Tests error classes, mapDatabaseError helper, and type guards
 */

import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  VenueNotFoundError,
  InsufficientPermissionsError,
  DuplicateVenueError,
  InvalidVenueDataError,
  VenueCapacityExceededError,
  VenueInactiveError,
  VenueOnboardingIncompleteError,
  RateLimitError,
  DatabaseError,
  CacheError,
  ServiceUnavailableError,
  CircuitBreakerOpenError,
  mapDatabaseError,
  isAppError,
  isValidationError,
  isNotFoundError,
  isRateLimitError,
} from '../../../src/utils/errors';

describe('utils/errors', () => {
  describe('AppError (base class)', () => {
    it('should create error with message and default values', () => {
      const error = new AppError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
      expect(error.name).toBe('AppError');
    });

    it('should create error with custom statusCode, code, and details', () => {
      const error = new AppError('Custom error', 418, 'TEAPOT', { custom: 'data' });
      
      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(418);
      expect(error.code).toBe('TEAPOT');
      expect(error.details).toEqual({ custom: 'data' });
    });

    it('should have stack trace', () => {
      const error = new AppError('Stack test');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    describe('toJSON()', () => {
      it('should return correct JSON structure', () => {
        const error = new AppError('JSON test', 400, 'TEST_CODE', { field: 'value' });
        const json = error.toJSON();
        
        expect(json).toEqual({
          name: 'AppError',
          message: 'JSON test',
          code: 'TEST_CODE',
          statusCode: 400,
          details: { field: 'value' },
        });
      });

      it('should handle undefined optional fields', () => {
        const error = new AppError('Minimal');
        const json = error.toJSON();
        
        expect(json).toEqual({
          name: 'AppError',
          message: 'Minimal',
          code: undefined,
          statusCode: 500,
          details: undefined,
        });
      });
    });
  });

  describe('ValidationError', () => {
    it('should have statusCode 422 and VALIDATION_ERROR code', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should accept details object', () => {
      const details = { field: 'email', message: 'Invalid format' };
      const error = new ValidationError('Validation failed', details);
      
      expect(error.details).toEqual(details);
    });
  });

  describe('NotFoundError', () => {
    it('should have statusCode 404 and NOT_FOUND code', () => {
      const error = new NotFoundError('User');
      
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should format message with resource name', () => {
      const error = new NotFoundError('Venue');
      expect(error.message).toBe('Venue not found');
    });
  });

  describe('UnauthorizedError', () => {
    it('should have statusCode 401 and default message', () => {
      const error = new UnauthorizedError();
      
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Unauthorized');
    });

    it('should accept custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.message).toBe('Token expired');
    });
  });

  describe('ForbiddenError', () => {
    it('should have statusCode 403 and default message', () => {
      const error = new ForbiddenError();
      
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Access denied');
    });

    it('should accept custom message', () => {
      const error = new ForbiddenError('Admin access required');
      expect(error.message).toBe('Admin access required');
    });
  });

  describe('ConflictError', () => {
    it('should have statusCode 409 and CONFLICT code', () => {
      const error = new ConflictError('Resource already exists');
      
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Resource already exists');
    });
  });

  describe('VenueNotFoundError', () => {
    it('should extend NotFoundError with venue-specific details', () => {
      const error = new VenueNotFoundError('venue-123');
      
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Venue not found');
      expect(error.details).toEqual({ venueId: 'venue-123' });
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe('InsufficientPermissionsError', () => {
    it('should extend ForbiddenError with resource and action', () => {
      const error = new InsufficientPermissionsError('venue', 'delete');
      
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Insufficient permissions to delete venue');
      expect(error.details).toEqual({ resource: 'venue', action: 'delete' });
      expect(error).toBeInstanceOf(ForbiddenError);
    });
  });

  describe('DuplicateVenueError', () => {
    it('should extend ConflictError with field and value', () => {
      const error = new DuplicateVenueError('slug', 'my-venue');
      
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe("Venue with slug 'my-venue' already exists");
      expect(error.details).toEqual({ field: 'slug', value: 'my-venue' });
      expect(error).toBeInstanceOf(ConflictError);
    });
  });

  describe('InvalidVenueDataError', () => {
    it('should extend ValidationError with invalid fields list', () => {
      const error = new InvalidVenueDataError(['name', 'email']);
      
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Invalid venue data provided');
      expect(error.details).toEqual({ invalidFields: ['name', 'email'] });
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('VenueCapacityExceededError', () => {
    it('should have statusCode 400 and capacity details', () => {
      const error = new VenueCapacityExceededError(1000, 500);
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CAPACITY_EXCEEDED');
      expect(error.message).toBe('Requested capacity 1000 exceeds available 500');
      expect(error.details).toEqual({ requested: 1000, available: 500 });
    });
  });

  describe('VenueInactiveError', () => {
    it('should have statusCode 400 and venue ID in details', () => {
      const error = new VenueInactiveError('venue-456');
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VENUE_INACTIVE');
      expect(error.message).toBe('Venue is not active');
      expect(error.details).toEqual({ venueId: 'venue-456' });
    });
  });

  describe('VenueOnboardingIncompleteError', () => {
    it('should have statusCode 400 and missing steps', () => {
      const error = new VenueOnboardingIncompleteError('venue-789', ['payment', 'address']);
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('ONBOARDING_INCOMPLETE');
      expect(error.message).toBe('Venue onboarding is incomplete');
      expect(error.details).toEqual({
        venueId: 'venue-789',
        missingSteps: ['payment', 'address'],
      });
    });
  });

  describe('RateLimitError', () => {
    it('should have statusCode 429 and documentation link', () => {
      const error = new RateLimitError('venues', 120);
      
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.message).toBe('Rate limit exceeded for venues');
      expect(error.details).toEqual({
        retryAfter: 120,
        resource: 'venues',
        documentation: 'https://docs.tickettoken.io/api/rate-limits',
        help: 'See documentation for rate limit tiers and how to request limit increases',
      });
    });

    it('should use default values when not provided', () => {
      const error = new RateLimitError();
      
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.details.retryAfter).toBe(60);
      expect(error.details.resource).toBe('global');
      expect(error.details.documentation).toBeDefined();
    });
  });

  describe('DatabaseError', () => {
    it('should have statusCode 500 and default message', () => {
      const error = new DatabaseError();
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.message).toBe('Database operation failed');
    });

    it('should include original error details', () => {
      const originalError = new Error('Connection refused');
      (originalError as any).code = 'ECONNREFUSED';
      
      const error = new DatabaseError('DB connection failed', originalError);
      
      expect(error.details).toEqual({
        originalMessage: 'Connection refused',
        code: 'ECONNREFUSED',
      });
    });
  });

  describe('CacheError', () => {
    it('should have statusCode 500 and operation in message', () => {
      const error = new CacheError('get');
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('CACHE_ERROR');
      expect(error.message).toBe('Cache get failed');
    });

    it('should include original error details', () => {
      const originalError = new Error('Redis timeout');
      const error = new CacheError('set', originalError);
      
      expect(error.details).toEqual({
        operation: 'set',
        originalMessage: 'Redis timeout',
      });
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should have statusCode 503', () => {
      const error = new ServiceUnavailableError('Payment service', 30);
      
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.message).toBe('Payment service is temporarily unavailable');
      expect(error.details).toEqual({ service: 'Payment service', retryAfter: 30 });
    });
  });

  describe('CircuitBreakerOpenError', () => {
    it('should extend ServiceUnavailableError with different code', () => {
      const error = new CircuitBreakerOpenError('Stripe API');
      
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('CIRCUIT_BREAKER_OPEN');
      expect(error.message).toBe('Stripe API is temporarily unavailable');
      expect(error).toBeInstanceOf(ServiceUnavailableError);
    });
  });

  describe('mapDatabaseError()', () => {
    it('should map 23505 (unique_violation) to DuplicateVenueError', () => {
      const dbError = {
        code: '23505',
        detail: "Key (slug)=(my-venue) already exists",
      };
      
      const error = mapDatabaseError(dbError);
      
      expect(error).toBeInstanceOf(DuplicateVenueError);
      expect(error.statusCode).toBe(409);
      expect((error as DuplicateVenueError).details).toEqual({ field: 'slug', value: 'my-venue' });
    });

    it('should map 23505 without parseable detail to ConflictError', () => {
      const dbError = {
        code: '23505',
        detail: 'Duplicate entry',
      };
      
      const error = mapDatabaseError(dbError);
      
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe('Duplicate entry');
    });

    it('should map 23503 (foreign_key_violation) to ValidationError', () => {
      const dbError = {
        code: '23503',
        detail: 'Referenced venue does not exist',
      };
      
      const error = mapDatabaseError(dbError);
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Referenced resource does not exist');
    });

    it('should map 23502 (not_null_violation) to ValidationError', () => {
      const dbError = {
        code: '23502',
        column: 'email',
      };
      
      const error = mapDatabaseError(dbError);
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Required field is missing: email');
    });

    it('should map ECONNREFUSED to DatabaseError', () => {
      const dbError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };
      
      const error = mapDatabaseError(dbError);
      
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe('Database connection failed');
    });

    it('should map ETIMEDOUT to DatabaseError', () => {
      const dbError = {
        code: 'ETIMEDOUT',
        message: 'Connection timed out',
      };
      
      const error = mapDatabaseError(dbError);
      
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe('Database connection failed');
    });

    it('should map unknown errors to generic DatabaseError', () => {
      const dbError = {
        code: '12345',
        message: 'Unknown database error',
      };
      
      const error = mapDatabaseError(dbError);
      
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.message).toBe('Database operation failed');
    });
  });

  describe('Type Guards', () => {
    describe('isAppError()', () => {
      it('should return true for AppError instances', () => {
        expect(isAppError(new AppError('test'))).toBe(true);
      });

      it('should return true for AppError subclasses', () => {
        expect(isAppError(new ValidationError('test'))).toBe(true);
        expect(isAppError(new NotFoundError('test'))).toBe(true);
        expect(isAppError(new RateLimitError())).toBe(true);
      });

      it('should return false for plain Error', () => {
        expect(isAppError(new Error('test'))).toBe(false);
      });

      it('should return false for non-error values', () => {
        expect(isAppError(null)).toBe(false);
        expect(isAppError(undefined)).toBe(false);
        expect(isAppError('error string')).toBe(false);
        expect(isAppError({ message: 'fake error' })).toBe(false);
      });
    });

    describe('isValidationError()', () => {
      it('should return true for ValidationError', () => {
        expect(isValidationError(new ValidationError('test'))).toBe(true);
      });

      it('should return true for ValidationError subclasses', () => {
        expect(isValidationError(new InvalidVenueDataError(['field']))).toBe(true);
      });

      it('should return false for other AppErrors', () => {
        expect(isValidationError(new NotFoundError('test'))).toBe(false);
        expect(isValidationError(new AppError('test'))).toBe(false);
      });
    });

    describe('isNotFoundError()', () => {
      it('should return true for NotFoundError', () => {
        expect(isNotFoundError(new NotFoundError('test'))).toBe(true);
      });

      it('should return true for NotFoundError subclasses', () => {
        expect(isNotFoundError(new VenueNotFoundError('id'))).toBe(true);
      });

      it('should return false for other AppErrors', () => {
        expect(isNotFoundError(new ValidationError('test'))).toBe(false);
        expect(isNotFoundError(new AppError('test'))).toBe(false);
      });
    });

    describe('isRateLimitError()', () => {
      it('should return true for RateLimitError', () => {
        expect(isRateLimitError(new RateLimitError())).toBe(true);
      });

      it('should return false for other AppErrors', () => {
        expect(isRateLimitError(new ValidationError('test'))).toBe(false);
        expect(isRateLimitError(new AppError('test', 429))).toBe(false);
      });
    });
  });
});
