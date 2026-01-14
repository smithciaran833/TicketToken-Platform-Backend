/**
 * Unit Tests for src/utils/errors.ts
 */
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
  StateTransitionError,
} from '../../../src/utils/errors';

describe('utils/errors', () => {
  describe('AppError', () => {
    it('sets message, statusCode, code, details', () => {
      const details = { field: 'email' };
      const error = new AppError('Something went wrong', 500, 'INTERNAL_ERROR', details);

      expect(error.message).toBe('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.details).toEqual(details);
    });

    it('captures stack trace', () => {
      const error = new AppError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('defaults statusCode to 500', () => {
      const error = new AppError('Test error');
      expect(error.statusCode).toBe(500);
    });

    it('sets name to constructor name', () => {
      const error = new AppError('Test error');
      expect(error.name).toBe('AppError');
    });

    describe('toJSON()', () => {
      it('returns error, code, statusCode, details', () => {
        const error = new AppError('Test', 400, 'TEST_CODE', { foo: 'bar' });
        const json = error.toJSON();

        expect(json).toEqual({
          error: 'Test',
          code: 'TEST_CODE',
          statusCode: 400,
          details: { foo: 'bar' },
        });
      });

      it('omits details when not provided', () => {
        const error = new AppError('Test', 400, 'TEST_CODE');
        const json = error.toJSON();

        expect(json).toEqual({
          error: 'Test',
          code: 'TEST_CODE',
          statusCode: 400,
        });
        expect(json).not.toHaveProperty('details');
      });
    });
  });

  describe('ValidationError', () => {
    it('sets statusCode=400, code=VALIDATION_ERROR', () => {
      const error = new ValidationError('Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
    });

    it('accepts details', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      expect(error.details).toEqual({ field: 'email' });
    });

    it('extends AppError', () => {
      const error = new ValidationError('Invalid input');
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NotFoundError', () => {
    it('sets statusCode=404, code=NOT_FOUND', () => {
      const error = new NotFoundError('Ticket');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });

    it('formats message as "{resource} not found"', () => {
      const error = new NotFoundError('Ticket');
      expect(error.message).toBe('Ticket not found');
    });

    it('accepts details', () => {
      const error = new NotFoundError('Ticket', { id: '123' });
      expect(error.details).toEqual({ id: '123' });
    });
  });

  describe('ConflictError', () => {
    it('sets statusCode=409, code=CONFLICT', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Resource already exists');
    });

    it('accepts details', () => {
      const error = new ConflictError('Conflict', { reason: 'duplicate' });
      expect(error.details).toEqual({ reason: 'duplicate' });
    });
  });

  describe('UnauthorizedError', () => {
    it('sets statusCode=401, code=UNAUTHORIZED', () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('uses default message "Unauthorized"', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Unauthorized');
    });

    it('accepts custom message', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.message).toBe('Token expired');
    });

    it('accepts details', () => {
      const error = new UnauthorizedError('Unauthorized', { reason: 'expired' });
      expect(error.details).toEqual({ reason: 'expired' });
    });
  });

  describe('ForbiddenError', () => {
    it('sets statusCode=403, code=FORBIDDEN', () => {
      const error = new ForbiddenError();

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
    });

    it('uses default message "Forbidden"', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Forbidden');
    });

    it('accepts custom message', () => {
      const error = new ForbiddenError('Access denied');
      expect(error.message).toBe('Access denied');
    });

    it('accepts details', () => {
      const error = new ForbiddenError('Forbidden', { resource: 'admin' });
      expect(error.details).toEqual({ resource: 'admin' });
    });
  });

  describe('TooManyRequestsError', () => {
    it('sets statusCode=429, code=TOO_MANY_REQUESTS', () => {
      const error = new TooManyRequestsError();

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('TOO_MANY_REQUESTS');
    });

    it('uses default message "Too many requests"', () => {
      const error = new TooManyRequestsError();
      expect(error.message).toBe('Too many requests');
    });

    it('accepts custom message', () => {
      const error = new TooManyRequestsError('Rate limit exceeded');
      expect(error.message).toBe('Rate limit exceeded');
    });

    it('accepts details', () => {
      const error = new TooManyRequestsError('Too many requests', { retryAfter: 60 });
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe('StateTransitionError', () => {
    it('extends ValidationError', () => {
      const error = new StateTransitionError('active', 'sold', ['reserved']);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('formats message with from, to, allowed transitions', () => {
      const error = new StateTransitionError('active', 'sold', ['reserved', 'cancelled']);

      expect(error.message).toBe(
        "Invalid status transition from 'active' to 'sold'. Allowed transitions: [reserved, cancelled]"
      );
    });

    it('handles terminal state message when no allowed transitions', () => {
      const error = new StateTransitionError('used', 'active', []);

      expect(error.message).toBe(
        "Invalid status transition from 'used' to 'active'. No transitions allowed (terminal state)"
      );
    });

    it('handles undefined allowed transitions', () => {
      const error = new StateTransitionError('used', 'active');

      expect(error.message).toBe(
        "Invalid status transition from 'used' to 'active'. No transitions allowed (terminal state)"
      );
    });

    it('includes from, to, allowed in details', () => {
      const error = new StateTransitionError('active', 'sold', ['reserved']);

      expect(error.details).toMatchObject({
        from: 'active',
        to: 'sold',
        allowed: ['reserved'],
      });
    });

    it('merges additional details', () => {
      const error = new StateTransitionError('active', 'sold', ['reserved'], { ticketId: '123' });

      expect(error.details).toMatchObject({
        from: 'active',
        to: 'sold',
        allowed: ['reserved'],
        ticketId: '123',
      });
    });
  });
});
