import { isOperationalError, sanitizeError } from '../../../src/utils/errors';

describe('errors.ts', () => {
  describe('isOperationalError', () => {
    it('returns true for error with isOperational=true', () => {
      const error = { isOperational: true };
      expect(isOperationalError(error)).toBe(true);
    });

    it('returns false for error with isOperational=false', () => {
      const error = { isOperational: false };
      expect(isOperationalError(error)).toBe(false);
    });

    it('returns true for ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED' };
      expect(isOperationalError(error)).toBe(true);
    });

    it('returns true for ECONNRESET', () => {
      const error = { code: 'ECONNRESET' };
      expect(isOperationalError(error)).toBe(true);
    });

    it('returns true for ETIMEDOUT', () => {
      const error = { code: 'ETIMEDOUT' };
      expect(isOperationalError(error)).toBe(true);
    });

    it('returns true for ENOTFOUND', () => {
      const error = { code: 'ENOTFOUND' };
      expect(isOperationalError(error)).toBe(true);
    });

    it('returns true for EPIPE', () => {
      const error = { code: 'EPIPE' };
      expect(isOperationalError(error)).toBe(true);
    });

    it('returns false for unknown error code', () => {
      const error = { code: 'UNKNOWN' };
      expect(isOperationalError(error)).toBe(false);
    });

    it('returns false for error without code or isOperational', () => {
      const error = { message: 'Some error' };
      expect(isOperationalError(error)).toBe(false);
    });
  });

  describe('sanitizeError', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('includes message, statusCode, and code', () => {
      const error = {
        message: 'Test error',
        statusCode: 400,
        code: 'TEST_CODE',
        stack: 'stack trace',
      };

      const sanitized = sanitizeError(error);

      expect(sanitized.message).toBe('Test error');
      expect(sanitized.statusCode).toBe(400);
      expect(sanitized.code).toBe('TEST_CODE');
    });

    it('defaults statusCode to 500 if not provided', () => {
      const error = { message: 'Test error' };
      const sanitized = sanitizeError(error);
      expect(sanitized.statusCode).toBe(500);
    });

    it('includes stack trace in non-production', () => {
      process.env.NODE_ENV = 'development';
      const error = {
        message: 'Test error',
        stack: 'Error: Test error\n    at test.js:1:1',
      };

      const sanitized = sanitizeError(error);

      expect(sanitized.stack).toBe('Error: Test error\n    at test.js:1:1');
    });

    it('excludes stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const error = {
        message: 'Test error',
        stack: 'Error: Test error\n    at test.js:1:1',
      };

      const sanitized = sanitizeError(error);

      expect(sanitized.stack).toBeUndefined();
    });
  });
});
