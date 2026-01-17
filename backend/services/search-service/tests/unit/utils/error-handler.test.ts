// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/error-handler.ts
 */

describe('src/utils/error-handler.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  // =============================================================================
  // SearchError - Constructor
  // =============================================================================

  describe('SearchError - Constructor', () => {
    it('should create instance with message', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test error');

      expect(error.message).toBe('Test error');
    });

    it('should extend Error', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test');

      expect(error instanceof Error).toBe(true);
    });

    it('should be instanceof SearchError', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test');

      expect(error instanceof SearchError).toBe(true);
    });

    it('should have default statusCode of 500', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test');

      expect(error.statusCode).toBe(500);
    });

    it('should have default code of SEARCH_ERROR', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test');

      expect(error.code).toBe('SEARCH_ERROR');
    });

    it('should accept custom statusCode', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test', 400);

      expect(error.statusCode).toBe(400);
    });

    it('should accept custom code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test', 500, 'CUSTOM_CODE');

      expect(error.code).toBe('CUSTOM_CODE');
    });

    it('should accept both custom statusCode and code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test', 403, 'FORBIDDEN');

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });

    it('should have name property', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test');

      expect(error.name).toBe('Error');
    });

    it('should have stack trace', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Test');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  // =============================================================================
  // SearchError - Different Status Codes
  // =============================================================================

  describe('SearchError - Different Status Codes', () => {
    it('should handle 400 status code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Bad request', 400);

      expect(error.statusCode).toBe(400);
    });

    it('should handle 401 status code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Unauthorized', 401);

      expect(error.statusCode).toBe(401);
    });

    it('should handle 403 status code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Forbidden', 403);

      expect(error.statusCode).toBe(403);
    });

    it('should handle 404 status code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Not found', 404);

      expect(error.statusCode).toBe(404);
    });

    it('should handle 500 status code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Internal error', 500);

      expect(error.statusCode).toBe(500);
    });

    it('should handle 503 status code', () => {
      const { SearchError } = require('../../../src/utils/error-handler');
      const error = new SearchError('Service unavailable', 503);

      expect(error.statusCode).toBe(503);
    });
  });

  // =============================================================================
  // ValidationError - Constructor
  // =============================================================================

  describe('ValidationError - Constructor', () => {
    it('should create instance with message', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
    });

    it('should extend SearchError', () => {
      const { ValidationError, SearchError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Test');

      expect(error instanceof SearchError).toBe(true);
    });

    it('should extend Error', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Test');

      expect(error instanceof Error).toBe(true);
    });

    it('should have statusCode of 400', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Invalid');

      expect(error.statusCode).toBe(400);
    });

    it('should have code of VALIDATION_ERROR', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Invalid');

      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should be instanceof ValidationError', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Test');

      expect(error instanceof ValidationError).toBe(true);
    });

    it('should have fixed statusCode regardless of constructor call', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Test');

      expect(error.statusCode).toBe(400);
    });

    it('should have stack trace', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Test');

      expect(error.stack).toBeDefined();
    });
  });

  // =============================================================================
  // NotFoundError - Constructor
  // =============================================================================

  describe('NotFoundError - Constructor', () => {
    it('should create instance with message', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Resource not found');

      expect(error.message).toBe('Resource not found');
    });

    it('should extend SearchError', () => {
      const { NotFoundError, SearchError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Test');

      expect(error instanceof SearchError).toBe(true);
    });

    it('should extend Error', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Test');

      expect(error instanceof Error).toBe(true);
    });

    it('should have statusCode of 404', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Not found');

      expect(error.statusCode).toBe(404);
    });

    it('should have code of NOT_FOUND', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Not found');

      expect(error.code).toBe('NOT_FOUND');
    });

    it('should be instanceof NotFoundError', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Test');

      expect(error instanceof NotFoundError).toBe(true);
    });

    it('should have fixed statusCode', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Test');

      expect(error.statusCode).toBe(404);
    });

    it('should have stack trace', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Test');

      expect(error.stack).toBeDefined();
    });
  });

  // =============================================================================
  // RateLimitError - Constructor
  // =============================================================================

  describe('RateLimitError - Constructor', () => {
    it('should create instance with message', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Too many requests');

      expect(error.message).toBe('Too many requests');
    });

    it('should extend SearchError', () => {
      const { RateLimitError, SearchError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Test');

      expect(error instanceof SearchError).toBe(true);
    });

    it('should extend Error', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Test');

      expect(error instanceof Error).toBe(true);
    });

    it('should have statusCode of 429', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Rate limited');

      expect(error.statusCode).toBe(429);
    });

    it('should have code of RATE_LIMIT_EXCEEDED', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Rate limited');

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should be instanceof RateLimitError', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Test');

      expect(error instanceof RateLimitError).toBe(true);
    });

    it('should have fixed statusCode', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Test');

      expect(error.statusCode).toBe(429);
    });

    it('should have stack trace', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Test');

      expect(error.stack).toBeDefined();
    });
  });

  // =============================================================================
  // Error Inheritance Chain
  // =============================================================================

  describe('Error Inheritance Chain', () => {
    it('should maintain proper inheritance for ValidationError', () => {
      const { ValidationError, SearchError } = require('../../../src/utils/error-handler');
      const error = new ValidationError('Test');

      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof SearchError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should maintain proper inheritance for NotFoundError', () => {
      const { NotFoundError, SearchError } = require('../../../src/utils/error-handler');
      const error = new NotFoundError('Test');

      expect(error instanceof NotFoundError).toBe(true);
      expect(error instanceof SearchError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should maintain proper inheritance for RateLimitError', () => {
      const { RateLimitError, SearchError } = require('../../../src/utils/error-handler');
      const error = new RateLimitError('Test');

      expect(error instanceof RateLimitError).toBe(true);
      expect(error instanceof SearchError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should differentiate between error types', () => {
      const { ValidationError, NotFoundError } = require('../../../src/utils/error-handler');
      const validationError = new ValidationError('Test');
      const notFoundError = new NotFoundError('Test');

      expect(validationError instanceof NotFoundError).toBe(false);
      expect(notFoundError instanceof ValidationError).toBe(false);
    });
  });

  // =============================================================================
  // Error Throwability
  // =============================================================================

  describe('Error Throwability', () => {
    it('should be throwable as SearchError', () => {
      const { SearchError } = require('../../../src/utils/error-handler');

      expect(() => {
        throw new SearchError('Test error');
      }).toThrow('Test error');
    });

    it('should be throwable as ValidationError', () => {
      const { ValidationError } = require('../../../src/utils/error-handler');

      expect(() => {
        throw new ValidationError('Validation failed');
      }).toThrow('Validation failed');
    });

    it('should be throwable as NotFoundError', () => {
      const { NotFoundError } = require('../../../src/utils/error-handler');

      expect(() => {
        throw new NotFoundError('Not found');
      }).toThrow('Not found');
    });

    it('should be throwable as RateLimitError', () => {
      const { RateLimitError } = require('../../../src/utils/error-handler');

      expect(() => {
        throw new RateLimitError('Rate limit exceeded');
      }).toThrow('Rate limit exceeded');
    });

    it('should be catchable', () => {
      const { SearchError } = require('../../../src/utils/error-handler');

      try {
        throw new SearchError('Test');
      } catch (error) {
        expect(error instanceof SearchError).toBe(true);
      }
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export SearchError', () => {
      const module = require('../../../src/utils/error-handler');

      expect(module.SearchError).toBeDefined();
      expect(typeof module.SearchError).toBe('function');
    });

    it('should export ValidationError', () => {
      const module = require('../../../src/utils/error-handler');

      expect(module.ValidationError).toBeDefined();
      expect(typeof module.ValidationError).toBe('function');
    });

    it('should export NotFoundError', () => {
      const module = require('../../../src/utils/error-handler');

      expect(module.NotFoundError).toBeDefined();
      expect(typeof module.NotFoundError).toBe('function');
    });

    it('should export RateLimitError', () => {
      const module = require('../../../src/utils/error-handler');

      expect(module.RateLimitError).toBeDefined();
      expect(typeof module.RateLimitError).toBe('function');
    });

    it('should have all expected exports', () => {
      const module = require('../../../src/utils/error-handler');

      expect(Object.keys(module).sort()).toEqual([
        'NotFoundError',
        'RateLimitError',
        'SearchError',
        'ValidationError'
      ].sort());
    });
  });
});
