/**
 * Error Response Utility Integration Tests
 */

import { ErrorResponseBuilder, ErrorCodes } from '../../../src/utils/error-response';

describe('Error Response Utility Integration Tests', () => {
  // Mock FastifyReply
  const createMockReply = () => {
    const reply: any = {
      statusCode: 200,
      status: jest.fn().mockImplementation((code) => {
        reply.statusCode = code;
        return reply;
      }),
      send: jest.fn().mockImplementation((body) => {
        reply.body = body;
        return reply;
      }),
      request: { id: 'test-request-id' }
    };
    return reply;
  };

  describe('ErrorResponseBuilder', () => {
    it('should send generic error response', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.send(reply, 400, 'Bad request', 'BAD_REQUEST', { field: 'test' });
      
      expect(reply.statusCode).toBe(400);
      expect(reply.body.success).toBe(false);
      expect(reply.body.error).toBe('Bad request');
      expect(reply.body.code).toBe('BAD_REQUEST');
      expect(reply.body.details).toEqual({ field: 'test' });
      expect(reply.body.requestId).toBe('test-request-id');
    });

    it('should send validation error', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.validation(reply, { email: 'Invalid email' });
      
      expect(reply.statusCode).toBe(422);
      expect(reply.body.code).toBe('VALIDATION_ERROR');
    });

    it('should send unauthorized error', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.unauthorized(reply);
      
      expect(reply.statusCode).toBe(401);
      expect(reply.body.code).toBe('UNAUTHORIZED');
    });

    it('should send forbidden error', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.forbidden(reply, 'Access denied');
      
      expect(reply.statusCode).toBe(403);
      expect(reply.body.error).toBe('Access denied');
    });

    it('should send not found error', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.notFound(reply, 'Venue');
      
      expect(reply.statusCode).toBe(404);
      expect(reply.body.error).toBe('Venue not found');
    });

    it('should send conflict error', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.conflict(reply, 'Already exists');
      
      expect(reply.statusCode).toBe(409);
      expect(reply.body.code).toBe('CONFLICT');
    });

    it('should send rate limit error', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.tooManyRequests(reply);
      
      expect(reply.statusCode).toBe(429);
      expect(reply.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should send internal error', () => {
      const reply = createMockReply();
      ErrorResponseBuilder.internal(reply);
      
      expect(reply.statusCode).toBe(500);
      expect(reply.body.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('ErrorCodes', () => {
    it('should have all error codes defined', () => {
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
});
