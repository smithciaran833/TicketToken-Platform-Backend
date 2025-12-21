/**
 * Custom Errors Integration Tests
 */

import { ValidationError, NotFoundError, UnauthorizedError } from '../../src/utils/errors';

describe('Custom Errors', () => {
  // ==========================================================================
  // ValidationError
  // ==========================================================================
  describe('ValidationError', () => {
    it('should create error with correct name', () => {
      const error = new ValidationError('Invalid input');

      expect(error.name).toBe('ValidationError');
    });

    it('should create error with correct message', () => {
      const error = new ValidationError('Field is required');

      expect(error.message).toBe('Field is required');
    });

    it('should be instanceof Error', () => {
      const error = new ValidationError('Test');

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof ValidationError', () => {
      const error = new ValidationError('Test');

      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should have stack trace', () => {
      const error = new ValidationError('Test');

      expect(error.stack).toBeDefined();
    });
  });

  // ==========================================================================
  // NotFoundError
  // ==========================================================================
  describe('NotFoundError', () => {
    it('should create error with correct name', () => {
      const error = new NotFoundError('Event not found');

      expect(error.name).toBe('NotFoundError');
    });

    it('should create error with correct message', () => {
      const error = new NotFoundError('Resource does not exist');

      expect(error.message).toBe('Resource does not exist');
    });

    it('should be instanceof Error', () => {
      const error = new NotFoundError('Test');

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof NotFoundError', () => {
      const error = new NotFoundError('Test');

      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  // ==========================================================================
  // UnauthorizedError
  // ==========================================================================
  describe('UnauthorizedError', () => {
    it('should create error with correct name', () => {
      const error = new UnauthorizedError('Invalid token');

      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create error with correct message', () => {
      const error = new UnauthorizedError('Authentication required');

      expect(error.message).toBe('Authentication required');
    });

    it('should be instanceof Error', () => {
      const error = new UnauthorizedError('Test');

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof UnauthorizedError', () => {
      const error = new UnauthorizedError('Test');

      expect(error).toBeInstanceOf(UnauthorizedError);
    });
  });

  // ==========================================================================
  // Error differentiation
  // ==========================================================================
  describe('Error differentiation', () => {
    it('should be able to catch specific error types', () => {
      const validationError = new ValidationError('Validation');
      const notFoundError = new NotFoundError('Not found');
      const unauthorizedError = new UnauthorizedError('Unauthorized');

      expect(validationError instanceof ValidationError).toBe(true);
      expect(validationError instanceof NotFoundError).toBe(false);
      expect(validationError instanceof UnauthorizedError).toBe(false);

      expect(notFoundError instanceof ValidationError).toBe(false);
      expect(notFoundError instanceof NotFoundError).toBe(true);
      expect(notFoundError instanceof UnauthorizedError).toBe(false);

      expect(unauthorizedError instanceof ValidationError).toBe(false);
      expect(unauthorizedError instanceof NotFoundError).toBe(false);
      expect(unauthorizedError instanceof UnauthorizedError).toBe(true);
    });

    it('should work in try-catch blocks', () => {
      const throwValidation = () => { throw new ValidationError('Test'); };
      const throwNotFound = () => { throw new NotFoundError('Test'); };

      let caughtValidation = false;
      let caughtNotFound = false;

      try {
        throwValidation();
      } catch (e) {
        if (e instanceof ValidationError) {
          caughtValidation = true;
        }
      }

      try {
        throwNotFound();
      } catch (e) {
        if (e instanceof NotFoundError) {
          caughtNotFound = true;
        }
      }

      expect(caughtValidation).toBe(true);
      expect(caughtNotFound).toBe(true);
    });
  });
});
