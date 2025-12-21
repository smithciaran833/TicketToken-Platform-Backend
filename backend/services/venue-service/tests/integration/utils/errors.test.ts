/**
 * Errors Utility Integration Tests
 */

import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  CacheError,
  ServiceUnavailableError,
  VenueNotFoundError,
  DuplicateVenueError,
  mapDatabaseError,
  isAppError,
  isValidationError,
  isNotFoundError,
  isRateLimitError
} from '../../../src/utils/errors';

describe('Errors Utility Integration Tests', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('AppError');
    });

    it('should create error with custom status code', () => {
      const error = new AppError('Bad request', 400, 'BAD_REQUEST');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
    });

    it('should serialize to JSON', () => {
      const error = new AppError('Test', 400, 'TEST', { foo: 'bar' });
      const json = error.toJSON();
      expect(json.message).toBe('Test');
      expect(json.statusCode).toBe(400);
      expect(json.code).toBe('TEST');
      expect(json.details).toEqual({ foo: 'bar' });
    });
  });

  describe('Specific Error Types', () => {
    it('should create ValidationError with 422 status', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create NotFoundError with 404 status', () => {
      const error = new NotFoundError('Venue');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Venue not found');
    });

    it('should create UnauthorizedError with 401 status', () => {
      const error = new UnauthorizedError();
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });

    it('should create ForbiddenError with 403 status', () => {
      const error = new ForbiddenError('No access');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('No access');
    });

    it('should create ConflictError with 409 status', () => {
      const error = new ConflictError('Already exists');
      expect(error.statusCode).toBe(409);
    });

    it('should create RateLimitError with 429 status', () => {
      const error = new RateLimitError('API', 60);
      expect(error.statusCode).toBe(429);
      expect(error.details).toEqual({ retryAfter: 60 });
    });

    it('should create DatabaseError with 500 status', () => {
      const original = new Error('Connection failed');
      const error = new DatabaseError('DB error', original);
      expect(error.statusCode).toBe(500);
      expect(error.details.originalMessage).toBe('Connection failed');
    });

    it('should create CacheError with 500 status', () => {
      const error = new CacheError('get', new Error('Redis down'));
      expect(error.statusCode).toBe(500);
      expect(error.details.operation).toBe('get');
    });

    it('should create ServiceUnavailableError with 503 status', () => {
      const error = new ServiceUnavailableError('Auth Service', 30);
      expect(error.statusCode).toBe(503);
      expect(error.details.service).toBe('Auth Service');
    });
  });

  describe('Venue-specific Errors', () => {
    it('should create VenueNotFoundError', () => {
      const error = new VenueNotFoundError('venue-123');
      expect(error.statusCode).toBe(404);
      expect(error.details.venueId).toBe('venue-123');
    });

    it('should create DuplicateVenueError', () => {
      const error = new DuplicateVenueError('slug', 'my-venue');
      expect(error.statusCode).toBe(409);
      expect(error.message).toContain('slug');
      expect(error.message).toContain('my-venue');
    });
  });

  describe('mapDatabaseError', () => {
    it('should map unique violation to DuplicateVenueError', () => {
      const dbError = {
        code: '23505',
        detail: 'Key (slug)=(test-venue) already exists.'
      };
      const error = mapDatabaseError(dbError);
      expect(error).toBeInstanceOf(DuplicateVenueError);
    });

    it('should map foreign key violation to ValidationError', () => {
      const dbError = { code: '23503' };
      const error = mapDatabaseError(dbError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should map not null violation to ValidationError', () => {
      const dbError = { code: '23502', column: 'name' };
      const error = mapDatabaseError(dbError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should map connection errors to DatabaseError', () => {
      const dbError = { code: 'ECONNREFUSED' };
      const error = mapDatabaseError(dbError);
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });

  describe('Type Guards', () => {
    it('should identify AppError', () => {
      expect(isAppError(new AppError('test'))).toBe(true);
      expect(isAppError(new Error('test'))).toBe(false);
    });

    it('should identify ValidationError', () => {
      expect(isValidationError(new ValidationError('test'))).toBe(true);
      expect(isValidationError(new NotFoundError('test'))).toBe(false);
    });

    it('should identify NotFoundError', () => {
      expect(isNotFoundError(new NotFoundError('test'))).toBe(true);
      expect(isNotFoundError(new ValidationError('test'))).toBe(false);
    });

    it('should identify RateLimitError', () => {
      expect(isRateLimitError(new RateLimitError())).toBe(true);
      expect(isRateLimitError(new AppError('test'))).toBe(false);
    });
  });
});
