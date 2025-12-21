/**
 * ErrorResponseBuilder Integration Tests
 */

import { ErrorResponseBuilder, ErrorCodes } from '../../src/utils/error-response';
import { FastifyReply } from 'fastify';

describe('ErrorResponseBuilder', () => {
  let mockReply: jest.Mocked<FastifyReply>;
  let sentResponse: any;
  let sentStatusCode: number;

  beforeEach(() => {
    sentResponse = null;
    sentStatusCode = 0;

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockImplementation((response) => {
        sentResponse = response;
        return mockReply;
      }),
      request: { id: 'test-request-id' },
    } as any;

    mockReply.status.mockImplementation((code: number) => {
      sentStatusCode = code;
      return mockReply;
    });
  });

  // ==========================================================================
  // send
  // ==========================================================================
  describe('send', () => {
    it('should send error response with correct structure', () => {
      ErrorResponseBuilder.send(mockReply, 400, 'Bad request', 'BAD_REQUEST');

      expect(sentStatusCode).toBe(400);
      expect(sentResponse).toEqual({
        success: false,
        error: 'Bad request',
        code: 'BAD_REQUEST',
        details: undefined,
        requestId: 'test-request-id',
      });
    });

    it('should include details when provided', () => {
      ErrorResponseBuilder.send(mockReply, 400, 'Error', 'CODE', { field: 'name', issue: 'required' });

      expect(sentResponse.details).toEqual({ field: 'name', issue: 'required' });
    });
  });

  // ==========================================================================
  // validation
  // ==========================================================================
  describe('validation', () => {
    it('should send 422 with VALIDATION_ERROR code', () => {
      ErrorResponseBuilder.validation(mockReply, { field: 'email', message: 'Invalid email' });

      expect(sentStatusCode).toBe(422);
      expect(sentResponse.code).toBe('VALIDATION_ERROR');
      expect(sentResponse.error).toBe('Validation failed');
      expect(sentResponse.details).toEqual({ field: 'email', message: 'Invalid email' });
    });
  });

  // ==========================================================================
  // unauthorized
  // ==========================================================================
  describe('unauthorized', () => {
    it('should send 401 with default message', () => {
      ErrorResponseBuilder.unauthorized(mockReply);

      expect(sentStatusCode).toBe(401);
      expect(sentResponse.code).toBe('UNAUTHORIZED');
      expect(sentResponse.error).toBe('Unauthorized');
    });

    it('should send 401 with custom message', () => {
      ErrorResponseBuilder.unauthorized(mockReply, 'Invalid token');

      expect(sentResponse.error).toBe('Invalid token');
    });
  });

  // ==========================================================================
  // forbidden
  // ==========================================================================
  describe('forbidden', () => {
    it('should send 403 with default message', () => {
      ErrorResponseBuilder.forbidden(mockReply);

      expect(sentStatusCode).toBe(403);
      expect(sentResponse.code).toBe('FORBIDDEN');
      expect(sentResponse.error).toBe('Forbidden');
    });

    it('should send 403 with custom message', () => {
      ErrorResponseBuilder.forbidden(mockReply, 'Access denied to this resource');

      expect(sentResponse.error).toBe('Access denied to this resource');
    });
  });

  // ==========================================================================
  // notFound
  // ==========================================================================
  describe('notFound', () => {
    it('should send 404 with resource name', () => {
      ErrorResponseBuilder.notFound(mockReply, 'Event');

      expect(sentStatusCode).toBe(404);
      expect(sentResponse.code).toBe('NOT_FOUND');
      expect(sentResponse.error).toBe('Event not found');
    });
  });

  // ==========================================================================
  // conflict
  // ==========================================================================
  describe('conflict', () => {
    it('should send 409 with message', () => {
      ErrorResponseBuilder.conflict(mockReply, 'Event already exists');

      expect(sentStatusCode).toBe(409);
      expect(sentResponse.code).toBe('CONFLICT');
      expect(sentResponse.error).toBe('Event already exists');
    });
  });

  // ==========================================================================
  // tooManyRequests
  // ==========================================================================
  describe('tooManyRequests', () => {
    it('should send 429 with default message', () => {
      ErrorResponseBuilder.tooManyRequests(mockReply);

      expect(sentStatusCode).toBe(429);
      expect(sentResponse.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(sentResponse.error).toBe('Too many requests');
    });

    it('should send 429 with custom message', () => {
      ErrorResponseBuilder.tooManyRequests(mockReply, 'Rate limit exceeded, try again in 60 seconds');

      expect(sentResponse.error).toBe('Rate limit exceeded, try again in 60 seconds');
    });
  });

  // ==========================================================================
  // internal
  // ==========================================================================
  describe('internal', () => {
    it('should send 500 with default message', () => {
      ErrorResponseBuilder.internal(mockReply);

      expect(sentStatusCode).toBe(500);
      expect(sentResponse.code).toBe('INTERNAL_ERROR');
      expect(sentResponse.error).toBe('Internal server error');
    });

    it('should send 500 with custom message', () => {
      ErrorResponseBuilder.internal(mockReply, 'Database connection failed');

      expect(sentResponse.error).toBe('Database connection failed');
    });
  });
});

describe('ErrorCodes', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
    expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
    expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCodes.BAD_REQUEST).toBe('BAD_REQUEST');
    expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
  });
});
