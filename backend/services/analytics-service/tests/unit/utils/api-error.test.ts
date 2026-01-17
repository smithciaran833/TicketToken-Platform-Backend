/**
 * API Error Unit Tests
 */

import { ApiError } from '../../../src/utils/api-error';

describe('ApiError', () => {
  describe('constructor', () => {
    it('should create error with status code and message', () => {
      const error = new ApiError(400, 'Bad request');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
      expect(error.errors).toBeUndefined();
    });

    it('should create error with errors array', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'name', message: 'Name is required' },
      ];
      const error = new ApiError(400, 'Validation failed', validationErrors);

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Validation failed');
      expect(error.errors).toEqual(validationErrors);
    });

    it('should be an instance of Error', () => {
      const error = new ApiError(500, 'Server error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
    });

    it('should have name property', () => {
      const error = new ApiError(404, 'Not found');

      expect(error.name).toBe('Error');
    });

    it('should capture stack trace', () => {
      const error = new ApiError(500, 'Internal error');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack!.length).toBeGreaterThan(0);
    });

    it('should handle different status codes', () => {
      const cases = [
        { status: 400, message: 'Bad Request' },
        { status: 401, message: 'Unauthorized' },
        { status: 403, message: 'Forbidden' },
        { status: 404, message: 'Not Found' },
        { status: 409, message: 'Conflict' },
        { status: 422, message: 'Unprocessable Entity' },
        { status: 429, message: 'Too Many Requests' },
        { status: 500, message: 'Internal Server Error' },
        { status: 502, message: 'Bad Gateway' },
        { status: 503, message: 'Service Unavailable' },
      ];

      cases.forEach(({ status, message }) => {
        const error = new ApiError(status, message);
        expect(error.statusCode).toBe(status);
        expect(error.message).toBe(message);
      });
    });

    it('should handle empty errors array', () => {
      const error = new ApiError(400, 'Validation failed', []);

      expect(error.errors).toEqual([]);
    });

    it('should handle complex error objects', () => {
      const complexErrors = [
        { 
          field: 'items[0].quantity',
          message: 'Must be positive',
          code: 'INVALID_QUANTITY',
          meta: { min: 1, received: -5 }
        },
      ];
      const error = new ApiError(400, 'Invalid order', complexErrors);

      expect(error.errors).toEqual(complexErrors);
    });
  });
});
