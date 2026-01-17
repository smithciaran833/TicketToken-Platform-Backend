// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/validation.middleware.ts
 */

jest.mock('../../../src/validators/search.schemas');

describe('src/middleware/validation.middleware.ts - Comprehensive Unit Tests', () => {
  let validators: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock validators
    validators = require('../../../src/validators/search.schemas');
    validators.validateSearchQuery = jest.fn();
    validators.validateVenueSearch = jest.fn();
    validators.validateEventSearch = jest.fn();
    validators.validateSuggest = jest.fn();

    // Mock request
    mockRequest = {
      query: {}
    };

    // Mock reply
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  // =============================================================================
  // createValidator() - Success Cases
  // =============================================================================

  describe('createValidator() - Success Cases', () => {
    it('should return a middleware function', () => {
      const mockValidator = jest.fn().mockReturnValue({ value: {} });

      const { default: module } = require('../../../src/middleware/validation.middleware');
      // Since createValidator is not exported, we test through exported middlewares
      const { validateSearch } = require('../../../src/middleware/validation.middleware');

      expect(typeof validateSearch).toBe('function');
    });

    it('should call validator with request.query', async () => {
      mockRequest.query = { q: 'test', limit: 10 };
      validators.validateSearchQuery.mockReturnValue({
        value: { q: 'test', limit: 10 }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(validators.validateSearchQuery).toHaveBeenCalledWith({ q: 'test', limit: 10 });
    });

    it('should replace query with validated values', async () => {
      mockRequest.query = { q: 'test' };
      const validatedValue = { q: 'test', limit: 20, offset: 0 };
      validators.validateSearchQuery.mockReturnValue({ value: validatedValue });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockRequest.query).toEqual(validatedValue);
    });

    it('should not call reply on success', async () => {
      validators.validateSearchQuery.mockReturnValue({ value: {} });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should sanitize input values', async () => {
      mockRequest.query = { q: '  test  ', limit: '20' };
      validators.validateSearchQuery.mockReturnValue({
        value: { q: 'test', limit: 20 }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockRequest.query).toEqual({ q: 'test', limit: 20 });
    });
  });

  // =============================================================================
  // createValidator() - Validation Errors
  // =============================================================================

  describe('createValidator() - Validation Errors', () => {
    it('should return 400 on validation error', async () => {
      validators.validateSearchQuery.mockReturnValue({
        error: {
          details: [
            { path: ['q'], message: 'q is required', type: 'any.required' }
          ]
        }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should send validation error response', async () => {
      validators.validateSearchQuery.mockReturnValue({
        error: {
          details: [
            { path: ['limit'], message: 'limit must be a number', type: 'number.base' }
          ]
        }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: [
          {
            field: 'limit',
            message: 'limit must be a number',
            type: 'number.base'
          }
        ]
      });
    });

    it('should map error details correctly', async () => {
      validators.validateSearchQuery.mockReturnValue({
        error: {
          details: [
            { path: ['q'], message: 'q is required', type: 'any.required' },
            { path: ['limit'], message: 'limit must be positive', type: 'number.positive' }
          ]
        }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          details: [
            { field: 'q', message: 'q is required', type: 'any.required' },
            { field: 'limit', message: 'limit must be positive', type: 'number.positive' }
          ]
        })
      );
    });

    it('should handle nested field paths', async () => {
      validators.validateSearchQuery.mockReturnValue({
        error: {
          details: [
            { path: ['filters', 'category'], message: 'Invalid category', type: 'string.valid' }
          ]
        }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          details: [
            { field: 'filters.category', message: 'Invalid category', type: 'string.valid' }
          ]
        })
      );
    });

    it('should not modify request.query on error', async () => {
      const originalQuery = { q: 'test' };
      mockRequest.query = originalQuery;
      validators.validateSearchQuery.mockReturnValue({
        error: {
          details: [
            { path: ['q'], message: 'q is too short', type: 'string.min' }
          ]
        }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockRequest.query).toBe(originalQuery);
    });

    it('should handle multiple validation errors', async () => {
      validators.validateSearchQuery.mockReturnValue({
        error: {
          details: [
            { path: ['q'], message: 'q is required', type: 'any.required' },
            { path: ['limit'], message: 'limit is invalid', type: 'number.base' },
            { path: ['offset'], message: 'offset must be non-negative', type: 'number.min' }
          ]
        }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.arrayContaining([
            expect.objectContaining({ field: 'q' }),
            expect.objectContaining({ field: 'limit' }),
            expect.objectContaining({ field: 'offset' })
          ])
        })
      );
    });
  });

  // =============================================================================
  // validateSearch - Middleware
  // =============================================================================

  describe('validateSearch - Middleware', () => {
    it('should be exported', () => {
      const { validateSearch } = require('../../../src/middleware/validation.middleware');

      expect(validateSearch).toBeDefined();
      expect(typeof validateSearch).toBe('function');
    });

    it('should use validateSearchQuery validator', async () => {
      validators.validateSearchQuery.mockReturnValue({ value: {} });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      expect(validators.validateSearchQuery).toHaveBeenCalled();
    });

    it('should validate search queries', async () => {
      const originalQuery = { q: 'concerts', limit: 50 };
      mockRequest.query = originalQuery;
      validators.validateSearchQuery.mockReturnValue({
        value: { q: 'concerts', limit: 50, offset: 0 }
      });

      const { validateSearch } = require('../../../src/middleware/validation.middleware');
      await validateSearch(mockRequest, mockReply);

      // Should be called with the ORIGINAL query before validation
      expect(validators.validateSearchQuery).toHaveBeenCalledWith(originalQuery);
    });
  });

  // =============================================================================
  // validateVenues - Middleware
  // =============================================================================

  describe('validateVenues - Middleware', () => {
    it('should be exported', () => {
      const { validateVenues } = require('../../../src/middleware/validation.middleware');

      expect(validateVenues).toBeDefined();
      expect(typeof validateVenues).toBe('function');
    });

    it('should use validateVenueSearch validator', async () => {
      validators.validateVenueSearch.mockReturnValue({ value: {} });

      const { validateVenues } = require('../../../src/middleware/validation.middleware');
      await validateVenues(mockRequest, mockReply);

      expect(validators.validateVenueSearch).toHaveBeenCalled();
    });

    it('should validate venue queries', async () => {
      mockRequest.query = { city: 'New York', capacity: 1000 };
      validators.validateVenueSearch.mockReturnValue({
        value: { city: 'New York', capacity: 1000 }
      });

      const { validateVenues } = require('../../../src/middleware/validation.middleware');
      await validateVenues(mockRequest, mockReply);

      expect(validators.validateVenueSearch).toHaveBeenCalledWith(mockRequest.query);
    });
  });

  // =============================================================================
  // validateEvents - Middleware
  // =============================================================================

  describe('validateEvents - Middleware', () => {
    it('should be exported', () => {
      const { validateEvents } = require('../../../src/middleware/validation.middleware');

      expect(validateEvents).toBeDefined();
      expect(typeof validateEvents).toBe('function');
    });

    it('should use validateEventSearch validator', async () => {
      validators.validateEventSearch.mockReturnValue({ value: {} });

      const { validateEvents } = require('../../../src/middleware/validation.middleware');
      await validateEvents(mockRequest, mockReply);

      expect(validators.validateEventSearch).toHaveBeenCalled();
    });

    it('should validate event queries', async () => {
      mockRequest.query = { category: 'concert', date: '2024-12-25' };
      validators.validateEventSearch.mockReturnValue({
        value: { category: 'concert', date: '2024-12-25' }
      });

      const { validateEvents } = require('../../../src/middleware/validation.middleware');
      await validateEvents(mockRequest, mockReply);

      expect(validators.validateEventSearch).toHaveBeenCalledWith(mockRequest.query);
    });
  });

  // =============================================================================
  // validateSuggestions - Middleware
  // =============================================================================

  describe('validateSuggestions - Middleware', () => {
    it('should be exported', () => {
      const { validateSuggestions } = require('../../../src/middleware/validation.middleware');

      expect(validateSuggestions).toBeDefined();
      expect(typeof validateSuggestions).toBe('function');
    });

    it('should use validateSuggest validator', async () => {
      validators.validateSuggest.mockReturnValue({ value: {} });

      const { validateSuggestions } = require('../../../src/middleware/validation.middleware');
      await validateSuggestions(mockRequest, mockReply);

      expect(validators.validateSuggest).toHaveBeenCalled();
    });

    it('should validate suggest queries', async () => {
      mockRequest.query = { q: 'rock', limit: 10 };
      validators.validateSuggest.mockReturnValue({
        value: { q: 'rock', limit: 10 }
      });

      const { validateSuggestions } = require('../../../src/middleware/validation.middleware');
      await validateSuggestions(mockRequest, mockReply);

      expect(validators.validateSuggest).toHaveBeenCalledWith(mockRequest.query);
    });
  });

  // =============================================================================
  // handleValidationError() - Joi Errors
  // =============================================================================

  describe('handleValidationError() - Joi Errors', () => {
    it('should handle Joi validation errors', () => {
      const error = {
        isJoi: true,
        details: [
          { path: ['field'], message: 'field is required' }
        ]
      };

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');
      handleValidationError(error, mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should send formatted error response', () => {
      const error = {
        isJoi: true,
        details: [
          { path: ['q'], message: 'q is required' },
          { path: ['limit'], message: 'limit must be a number' }
        ]
      };

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');
      handleValidationError(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Invalid request parameters',
        details: [
          { field: 'q', message: 'q is required' },
          { field: 'limit', message: 'limit must be a number' }
        ]
      });
    });

    it('should map field paths correctly', () => {
      const error = {
        isJoi: true,
        details: [
          { path: ['filters', 'category'], message: 'Invalid category' }
        ]
      };

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');
      handleValidationError(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          details: [
            { field: 'filters.category', message: 'Invalid category' }
          ]
        })
      );
    });

    it('should handle multiple error details', () => {
      const error = {
        isJoi: true,
        details: [
          { path: ['a'], message: 'a error' },
          { path: ['b'], message: 'b error' },
          { path: ['c'], message: 'c error' }
        ]
      };

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');
      handleValidationError(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.arrayContaining([
            { field: 'a', message: 'a error' },
            { field: 'b', message: 'b error' },
            { field: 'c', message: 'c error' }
          ])
        })
      );
    });

    it('should include error type in response', () => {
      const error = {
        isJoi: true,
        details: [
          { path: ['field'], message: 'field is required' }
        ]
      };

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');
      handleValidationError(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          message: 'Invalid request parameters'
        })
      );
    });
  });

  // =============================================================================
  // handleValidationError() - Non-Joi Errors
  // =============================================================================

  describe('handleValidationError() - Non-Joi Errors', () => {
    it('should re-throw non-Joi errors', () => {
      const error = new Error('Not a Joi error');

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');

      expect(() => handleValidationError(error, mockRequest, mockReply)).toThrow('Not a Joi error');
    });

    it('should not call reply for non-Joi errors', () => {
      const error = new Error('Regular error');

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');

      try {
        handleValidationError(error, mockRequest, mockReply);
      } catch (e) {}

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should throw the original error', () => {
      const error = new Error('Original');

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');

      expect(() => handleValidationError(error, mockRequest, mockReply)).toThrow(error);
    });

    it('should handle errors without isJoi property', () => {
      const error = { message: 'Some error' };

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');

      expect(() => handleValidationError(error, mockRequest, mockReply)).toThrow();
    });

    it('should handle errors with isJoi false', () => {
      const error = { isJoi: false, message: 'Not Joi' };

      const { handleValidationError } = require('../../../src/middleware/validation.middleware');

      expect(() => handleValidationError(error, mockRequest, mockReply)).toThrow();
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export validateSearch', () => {
      const module = require('../../../src/middleware/validation.middleware');

      expect(module.validateSearch).toBeDefined();
      expect(typeof module.validateSearch).toBe('function');
    });

    it('should export validateVenues', () => {
      const module = require('../../../src/middleware/validation.middleware');

      expect(module.validateVenues).toBeDefined();
      expect(typeof module.validateVenues).toBe('function');
    });

    it('should export validateEvents', () => {
      const module = require('../../../src/middleware/validation.middleware');

      expect(module.validateEvents).toBeDefined();
      expect(typeof module.validateEvents).toBe('function');
    });

    it('should export validateSuggestions', () => {
      const module = require('../../../src/middleware/validation.middleware');

      expect(module.validateSuggestions).toBeDefined();
      expect(typeof module.validateSuggestions).toBe('function');
    });

    it('should export handleValidationError', () => {
      const module = require('../../../src/middleware/validation.middleware');

      expect(module.handleValidationError).toBeDefined();
      expect(typeof module.handleValidationError).toBe('function');
    });

    it('should have all expected exports', () => {
      const module = require('../../../src/middleware/validation.middleware');

      expect(Object.keys(module).sort()).toEqual([
        'handleValidationError',
        'validateEvents',
        'validateSearch',
        'validateSuggestions',
        'validateVenues'
      ].sort());
    });
  });
});
