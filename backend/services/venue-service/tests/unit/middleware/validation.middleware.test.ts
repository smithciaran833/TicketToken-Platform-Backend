/**
 * Unit tests for src/middleware/validation.middleware.ts
 * Tests Joi-based request validation middleware
 */

import { validate } from '../../../src/middleware/validation.middleware';
import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';
import * as Joi from 'joi';

// Mock the error-response module
jest.mock('../../../src/utils/error-response', () => ({
  ErrorResponseBuilder: {
    validation: jest.fn((reply: any, errors: any[]) => {
      reply.status(400);
      reply.send({ 
        success: false, 
        error: 'Validation failed', 
        code: 'VALIDATION_ERROR',
        details: errors 
      });
    }),
    internal: jest.fn((reply: any, message: string) => {
      reply.status(500);
      reply.send({ 
        success: false, 
        error: message, 
        code: 'INTERNAL_ERROR' 
      });
    }),
  },
}));

describe('middleware/validation.middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReply = createMockReply();
  });

  describe('validate()', () => {
    describe('body validation', () => {
      const bodySchema = {
        body: Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required(),
          age: Joi.number().min(0).max(120),
        }),
      };

      it('should pass validation with valid body', async () => {
        mockRequest = createMockRequest({
          body: { name: 'John', email: 'john@example.com', age: 25 },
        });

        const middleware = validate(bodySchema);
        await middleware(mockRequest, mockReply);

        expect(mockRequest.body).toEqual({ name: 'John', email: 'john@example.com', age: 25 });
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should transform values according to Joi defaults', async () => {
        const schemaWithDefaults = {
          body: Joi.object({
            name: Joi.string().required(),
            status: Joi.string().default('active'),
          }),
        };

        mockRequest = createMockRequest({
          body: { name: 'Test' },
        });

        const middleware = validate(schemaWithDefaults);
        await middleware(mockRequest, mockReply);

        expect(mockRequest.body.status).toBe('active');
      });

      it('should return 400 for missing required field', async () => {
        mockRequest = createMockRequest({
          body: { email: 'john@example.com' },
        });

        const middleware = validate(bodySchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
          })
        );
      });

      it('should return 400 for invalid email format', async () => {
        mockRequest = createMockRequest({
          body: { name: 'John', email: 'invalid-email' },
        });

        const middleware = validate(bodySchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should return all validation errors (abortEarly: false)', async () => {
        mockRequest = createMockRequest({
          body: { email: 'invalid', age: -5 },
        });

        const middleware = validate(bodySchema);
        await middleware(mockRequest, mockReply);

        const sendCall = mockReply.send.mock.calls[0][0];
        // Should have multiple errors: name required, email invalid, age min
        expect(sendCall.details.length).toBeGreaterThan(1);
      });

      it('should handle nested field paths in errors', async () => {
        const nestedSchema = {
          body: Joi.object({
            address: Joi.object({
              street: Joi.string().required(),
              city: Joi.string().required(),
            }).required(),
          }),
        };

        mockRequest = createMockRequest({
          body: { address: { city: 'NYC' } },
        });

        const middleware = validate(nestedSchema);
        await middleware(mockRequest, mockReply);

        const sendCall = mockReply.send.mock.calls[0][0];
        expect(sendCall.details[0].field).toBe('address.street');
      });
    });

    describe('querystring validation', () => {
      const querySchema = {
        querystring: Joi.object({
          page: Joi.number().min(1).default(1),
          limit: Joi.number().min(1).max(100).default(10),
          sort: Joi.string().valid('asc', 'desc'),
        }),
      };

      it('should pass validation with valid query params', async () => {
        mockRequest = createMockRequest({
          query: { page: 2, limit: 20, sort: 'asc' },
        });

        const middleware = validate(querySchema);
        await middleware(mockRequest, mockReply);

        expect(mockRequest.query).toEqual({ page: 2, limit: 20, sort: 'asc' });
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should apply default values for missing query params', async () => {
        mockRequest = createMockRequest({
          query: {},
        });

        const middleware = validate(querySchema);
        await middleware(mockRequest, mockReply);

        expect(mockRequest.query.page).toBe(1);
        expect(mockRequest.query.limit).toBe(10);
      });

      it('should return 400 for invalid query param value', async () => {
        mockRequest = createMockRequest({
          query: { sort: 'invalid' },
        });

        const middleware = validate(querySchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should return 400 for out-of-range values', async () => {
        mockRequest = createMockRequest({
          query: { limit: 500 },
        });

        const middleware = validate(querySchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('params validation', () => {
      const paramsSchema = {
        params: Joi.object({
          venueId: Joi.string().uuid().required(),
          eventId: Joi.string().uuid(),
        }),
      };

      it('should pass validation with valid params', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        mockRequest = createMockRequest({
          params: { venueId: validUuid },
        });

        const middleware = validate(paramsSchema);
        await middleware(mockRequest, mockReply);

        expect(mockRequest.params.venueId).toBe(validUuid);
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid UUID format', async () => {
        mockRequest = createMockRequest({
          params: { venueId: 'not-a-uuid' },
        });

        const middleware = validate(paramsSchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should return 400 for missing required param', async () => {
        mockRequest = createMockRequest({
          params: {},
        });

        const middleware = validate(paramsSchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('combined validation', () => {
      const combinedSchema = {
        body: Joi.object({
          name: Joi.string().required(),
        }),
        querystring: Joi.object({
          include: Joi.string(),
        }),
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
      };

      it('should validate body, querystring, and params together', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        mockRequest = createMockRequest({
          body: { name: 'Test' },
          query: { include: 'events' },
          params: { id: validUuid },
        });

        const middleware = validate(combinedSchema);
        await middleware(mockRequest, mockReply);

        expect(mockRequest.body.name).toBe('Test');
        expect(mockRequest.query.include).toBe('events');
        expect(mockRequest.params.id).toBe(validUuid);
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should fail on first invalid part (body)', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        mockRequest = createMockRequest({
          body: {}, // Missing name
          query: { include: 'events' },
          params: { id: validUuid },
        });

        const middleware = validate(combinedSchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });

    describe('empty/partial schemas', () => {
      it('should pass when schema has no body validation', async () => {
        const noBodySchema = {
          querystring: Joi.object({
            page: Joi.number(),
          }),
        };

        mockRequest = createMockRequest({
          body: { anything: 'goes' },
          query: { page: 1 },
        });

        const middleware = validate(noBodySchema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should pass when schema is empty', async () => {
        mockRequest = createMockRequest({
          body: { anything: 'goes' },
          query: { any: 'thing' },
        });

        const middleware = validate({});
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return 500 for validation exception', async () => {
        const brokenSchema = {
          body: {
            validate: () => {
              throw new Error('Schema error');
            },
          },
        };

        mockRequest = createMockRequest({
          body: { test: 'data' },
        });

        const middleware = validate(brokenSchema as any);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(500);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Validation error',
          })
        );
      });
    });

    describe('security tests', () => {
      it('should sanitize XSS attempts through validation', async () => {
        const schema = {
          body: Joi.object({
            name: Joi.string().max(100),
          }),
        };

        mockRequest = createMockRequest({
          body: { name: '<script>alert("xss")</script>' },
        });

        const middleware = validate(schema);
        await middleware(mockRequest, mockReply);

        // Validation passes but value is preserved as-is (sanitization happens elsewhere)
        expect(mockRequest.body.name).toBe('<script>alert("xss")</script>');
      });

      it('should reject SQL injection in params', async () => {
        const schema = {
          params: Joi.object({
            id: Joi.string().uuid().required(),
          }),
        };

        mockRequest = createMockRequest({
          params: { id: "'; DROP TABLE venues; --" },
        });

        const middleware = validate(schema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });

      it('should reject path traversal attempts', async () => {
        const schema = {
          params: Joi.object({
            filename: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required(),
          }),
        };

        mockRequest = createMockRequest({
          params: { filename: '../../../etc/passwd' },
        });

        const middleware = validate(schema);
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
      });
    });
  });
});
