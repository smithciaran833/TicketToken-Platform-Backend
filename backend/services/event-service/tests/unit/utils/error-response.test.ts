/**
 * Unit tests for src/utils/error-response.ts
 * Tests HTTP error response formatting utilities
 */

import { ErrorResponseBuilder, ErrorCodes, ErrorResponse } from '../../../src/utils/error-response';
import { createMockReply, createMockRequest } from '../../__mocks__/fastify.mock';

describe('utils/error-response', () => {
  let mockReply: ReturnType<typeof createMockReply>;
  let mockRequest: ReturnType<typeof createMockRequest>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockReply.request = mockRequest;
  });

  describe('ErrorResponseBuilder', () => {
    describe('send()', () => {
      it('should send error response with correct structure', () => {
        ErrorResponseBuilder.send(mockReply as any, 400, 'Bad request', 'BAD_REQUEST');

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Bad request',
            code: 'BAD_REQUEST',
          })
        );
      });

      it('should include request ID in response', () => {
        mockRequest.id = 'req-test-123';
        mockReply.request = mockRequest;

        ErrorResponseBuilder.send(mockReply as any, 500, 'Error', 'ERROR');

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            requestId: 'req-test-123',
          })
        );
      });

      it('should include details when provided', () => {
        const details = { field: 'name', issue: 'required' };
        ErrorResponseBuilder.send(mockReply as any, 422, 'Validation error', 'VALIDATION', details);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            details: { field: 'name', issue: 'required' },
          })
        );
      });

      it('should handle missing details', () => {
        ErrorResponseBuilder.send(mockReply as any, 400, 'Error', 'ERROR');

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            details: undefined,
          })
        );
      });
    });

    describe('validation()', () => {
      it('should send 422 validation error', () => {
        const validationDetails = {
          errors: [
            { field: 'name', message: 'is required' },
            { field: 'date', message: 'must be in future' },
          ],
        };

        ErrorResponseBuilder.validation(mockReply as any, validationDetails);

        expect(mockReply.status).toHaveBeenCalledWith(422);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: validationDetails,
          })
        );
      });
    });

    describe('unauthorized()', () => {
      it('should send 401 unauthorized error with default message', () => {
        ErrorResponseBuilder.unauthorized(mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(401);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Unauthorized',
            code: 'UNAUTHORIZED',
          })
        );
      });

      it('should send 401 with custom message', () => {
        ErrorResponseBuilder.unauthorized(mockReply as any, 'Invalid token');

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Invalid token',
          })
        );
      });
    });

    describe('forbidden()', () => {
      it('should send 403 forbidden error with default message', () => {
        ErrorResponseBuilder.forbidden(mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(403);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Forbidden',
            code: 'FORBIDDEN',
          })
        );
      });

      it('should send 403 with custom message', () => {
        ErrorResponseBuilder.forbidden(mockReply as any, 'Access denied to this resource');

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Access denied to this resource',
          })
        );
      });
    });

    describe('notFound()', () => {
      it('should send 404 not found error', () => {
        ErrorResponseBuilder.notFound(mockReply as any, 'Event');

        expect(mockReply.status).toHaveBeenCalledWith(404);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Event not found',
            code: 'NOT_FOUND',
          })
        );
      });

      it('should format resource name in message', () => {
        ErrorResponseBuilder.notFound(mockReply as any, 'Ticket Tier');

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Ticket Tier not found',
          })
        );
      });
    });

    describe('conflict()', () => {
      it('should send 409 conflict error', () => {
        ErrorResponseBuilder.conflict(mockReply as any, 'Event already exists');

        expect(mockReply.status).toHaveBeenCalledWith(409);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Event already exists',
            code: 'CONFLICT',
          })
        );
      });
    });

    describe('tooManyRequests()', () => {
      it('should send 429 rate limit error with default message', () => {
        ErrorResponseBuilder.tooManyRequests(mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
          })
        );
      });

      it('should send 429 with custom message', () => {
        ErrorResponseBuilder.tooManyRequests(mockReply as any, 'Rate limit exceeded, try again in 60 seconds');

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Rate limit exceeded, try again in 60 seconds',
          })
        );
      });
    });

    describe('internal()', () => {
      it('should send 500 internal error with default message', () => {
        ErrorResponseBuilder.internal(mockReply as any);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
          })
        );
      });

      it('should send 500 with custom message', () => {
        ErrorResponseBuilder.internal(mockReply as any, 'Database connection failed');

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Database connection failed',
          })
        );
      });
    });
  });

  describe('ErrorCodes enum', () => {
    it('should have VALIDATION_ERROR code', () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    });

    it('should have UNAUTHORIZED code', () => {
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
    });

    it('should have FORBIDDEN code', () => {
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
    });

    it('should have NOT_FOUND code', () => {
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
    });

    it('should have CONFLICT code', () => {
      expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
    });

    it('should have RATE_LIMIT_EXCEEDED code', () => {
      expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should have INTERNAL_ERROR code', () => {
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    it('should have BAD_REQUEST code', () => {
      expect(ErrorCodes.BAD_REQUEST).toBe('BAD_REQUEST');
    });

    it('should have SERVICE_UNAVAILABLE code', () => {
      expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });

    it('should have all expected codes', () => {
      const expectedCodes = [
        'VALIDATION_ERROR',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'CONFLICT',
        'RATE_LIMIT_EXCEEDED',
        'INTERNAL_ERROR',
        'BAD_REQUEST',
        'SERVICE_UNAVAILABLE',
      ];
      expect(Object.values(ErrorCodes)).toEqual(expect.arrayContaining(expectedCodes));
    });
  });

  describe('ErrorResponse interface', () => {
    it('should define correct response structure', () => {
      const response: ErrorResponse = {
        success: false,
        error: 'Test error',
        code: 'TEST_ERROR',
        details: { extra: 'info' },
        requestId: 'req-123',
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Test error');
      expect(response.code).toBe('TEST_ERROR');
      expect(response.details).toEqual({ extra: 'info' });
      expect(response.requestId).toBe('req-123');
    });

    it('should allow optional details and requestId', () => {
      const response: ErrorResponse = {
        success: false,
        error: 'Minimal error',
        code: 'MINIMAL',
      };

      expect(response.details).toBeUndefined();
      expect(response.requestId).toBeUndefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete error flow', () => {
      mockRequest.id = 'flow-test-123';
      mockReply.request = mockRequest;

      // Simulate validation error
      ErrorResponseBuilder.validation(mockReply as any, {
        errors: [{ path: 'name', message: 'required' }],
      });

      const sentResponse = (mockReply.send as jest.Mock).mock.calls[0][0];
      expect(sentResponse.success).toBe(false);
      expect(sentResponse.code).toBe('VALIDATION_ERROR');
      expect(sentResponse.requestId).toBe('flow-test-123');
      expect(sentResponse.details.errors).toHaveLength(1);
    });

    it('should be usable in middleware error handling', () => {
      // Simulate middleware catching different error types
      const scenarios = [
        { method: 'unauthorized', statusCode: 401 },
        { method: 'forbidden', statusCode: 403 },
        { method: 'internal', statusCode: 500 },
      ];

      scenarios.forEach(({ method, statusCode }) => {
        jest.clearAllMocks();
        (ErrorResponseBuilder as any)[method](mockReply);
        expect(mockReply.status).toHaveBeenCalledWith(statusCode);
      });
    });
  });
});
