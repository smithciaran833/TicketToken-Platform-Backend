import { ValidationError, NotFoundError, UnauthorizedError } from '../../../src/utils/errors';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('Event not found');

      expect(error.message).toBe('Event not found');
      expect(error.name).toBe('NotFoundError');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error', () => {
      const error = new UnauthorizedError('Access denied');

      expect(error.message).toBe('Access denied');
      expect(error.name).toBe('UnauthorizedError');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
