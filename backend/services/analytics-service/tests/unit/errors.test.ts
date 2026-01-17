/**
 * Error Classes Unit Tests
 */

import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
  ServiceUnavailableError,
  BadGatewayError,
  BadRequestError,
  InternalServerError,
  toRFC7807Response,
} from '../../src/errors';

describe('Error Classes', () => {
  describe('InternalServerError', () => {
    it('should create with default message', () => {
      const error = new InternalServerError();
      expect(error.message).toBe('Internal Server Error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should create with custom message', () => {
      const error = new InternalServerError('Database connection failed');
      expect(error.message).toBe('Database connection failed');
      expect(error.statusCode).toBe(500);
    });

    it('should create with custom code', () => {
      const error = new InternalServerError('Custom error', 'CUSTOM_CODE');
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
    });

    it('should be an instance of AppError', () => {
      const error = new InternalServerError();
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Re-exported Errors', () => {
    it('should export ValidationError', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
    });

    it('should export NotFoundError', () => {
      const error = new NotFoundError('Resource not found');
      expect(error.statusCode).toBe(404);
    });

    it('should export ConflictError', () => {
      const error = new ConflictError('Resource conflict');
      expect(error.statusCode).toBe(409);
    });

    it('should export UnauthorizedError', () => {
      const error = new UnauthorizedError('Not authenticated');
      expect(error.statusCode).toBe(401);
    });

    it('should export ForbiddenError', () => {
      const error = new ForbiddenError('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should export TooManyRequestsError', () => {
      const error = new TooManyRequestsError('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
    });

    it('should export ServiceUnavailableError', () => {
      const error = new ServiceUnavailableError('Service down');
      expect(error.statusCode).toBe(503);
    });

    it('should export BadGatewayError', () => {
      const error = new BadGatewayError('Bad gateway');
      expect(error.statusCode).toBe(502);
    });

    it('should export BadRequestError', () => {
      const error = new BadRequestError('Bad request');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('toRFC7807Response', () => {
    it('should convert error to RFC 7807 format', () => {
      const error = new ValidationError('Invalid email', 'INVALID_EMAIL');
      const response = toRFC7807Response(error, '/api/users');

      expect(response.type).toBe('https://api.tickettoken.com/errors/INVALID_EMAIL');
      expect(response.title).toBe('ValidationError');
      expect(response.status).toBe(400);
      expect(response.detail).toBe('Invalid email');
      expect(response.instance).toBe('/api/users');
    });

    it('should include requestId when provided', () => {
      const error = new NotFoundError('User not found');
      const response = toRFC7807Response(error, '/api/users/123', 'req-abc-123');

      expect(response.requestId).toBe('req-abc-123');
    });

    it('should handle unknown errors', () => {
      const error = { message: 'Something went wrong' };
      const response = toRFC7807Response(error, '/api/test');

      expect(response.type).toBe('https://api.tickettoken.com/errors/UNKNOWN');
      expect(response.status).toBe(500);
    });

    it('should handle errors without code', () => {
      const error = new Error('Generic error');
      const response = toRFC7807Response(error, '/api/test');

      expect(response.type).toBe('https://api.tickettoken.com/errors/UNKNOWN');
    });

    it('should handle error with details property', () => {
      const error = {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        name: 'ValidationError',
        details: { fields: ['email', 'name'] },
      };
      const response = toRFC7807Response(error, '/api/users');

      expect(response.details).toEqual({ fields: ['email', 'name'] });
    });
  });
});
