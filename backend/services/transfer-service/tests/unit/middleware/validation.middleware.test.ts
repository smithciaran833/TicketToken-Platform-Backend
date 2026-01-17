import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import {
  formatZodError,
  validateBody,
  validateQuery,
  validateParams,
  validate,
  setupValidationErrorHandler
} from '../../../src/middleware/validation.middleware';

// Mock logger
jest.mock('../../../src/utils/logger');

describe('Validation Middleware - Unit Tests', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let sendMock: jest.Mock;
  let codeMock: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock reply
    sendMock = jest.fn().mockReturnThis();
    codeMock = jest.fn().mockReturnThis();

    mockReply = {
      code: codeMock,
      send: sendMock
    };

    // Setup mock request
    mockRequest = {
      url: '/test',
      method: 'POST',
      body: {},
      query: {},
      params: {}
    };
  });

  describe('formatZodError', () => {
    it('should format Zod error with single field error', () => {
      const schema = z.object({
        email: z.string().email()
      });

      try {
        schema.parse({ email: 'invalid' });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);

        expect(formatted.statusCode).toBe(400);
        expect(formatted.error).toBe('Validation Error');
        expect(formatted.message).toBe('Request validation failed');
        expect(formatted.details).toHaveLength(1);
        expect(formatted.details[0].field).toBe('email');
        expect(formatted.details[0].message).toContain('Invalid email');
      }
    });

    it('should format Zod error with multiple field errors', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
        name: z.string().min(2)
      });

      try {
        schema.parse({ email: 'invalid', age: 10, name: 'a' });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);

        expect(formatted.details).toHaveLength(3);
        expect(formatted.details.map((d: any) => d.field)).toContain('email');
        expect(formatted.details.map((d: any) => d.field)).toContain('age');
        expect(formatted.details.map((d: any) => d.field)).toContain('name');
      }
    });

    it('should format nested field errors', () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            email: z.string().email()
          })
        })
      });

      try {
        schema.parse({ user: { profile: { email: 'invalid' } } });
      } catch (error) {
        const formatted = formatZodError(error as ZodError);

        expect(formatted.details[0].field).toBe('user.profile.email');
      }
    });

    it('should include error codes', () => {
      const schema = z.string().email();

      try {
        schema.parse('invalid');
      } catch (error) {
        const formatted = formatZodError(error as ZodError);

        expect(formatted.details[0].code).toBeDefined();
      }
    });
  });

  describe('validateBody', () => {
    it('should pass validation with valid body', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number()
      });

      const validBody = { email: 'test@example.com', age: 25 };
      mockRequest.body = validBody;

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.body).toEqual(validBody);
      expect(codeMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('should reject invalid body and return 400', async () => {
      const schema = z.object({
        email: z.string().email()
      });

      mockRequest.body = { email: 'invalid-email' };

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          error: 'Validation Error',
          details: expect.any(Array)
        })
      );
    });

    it('should transform body with schema transforms', async () => {
      const schema = z.object({
        email: z.string().email().toLowerCase()
      });

      mockRequest.body = { email: 'TEST@EXAMPLE.COM' };

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.body).toEqual({ email: 'test@example.com' });
    });

    it('should handle missing required fields', async () => {
      const schema = z.object({
        email: z.string(),
        password: z.string()
      });

      mockRequest.body = { email: 'test@example.com' };

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).toHaveBeenCalledWith(400);
      const sentError = sendMock.mock.calls[0][0];
      expect(sentError.details[0].field).toBe('password');
    });

    it('should rethrow non-Zod errors', async () => {
      const schema = z.object({
        email: z.string()
      });

      // Create a schema that throws a non-Zod error
      const badSchema = {
        parse: () => {
          throw new Error('Not a Zod error');
        }
      } as any;

      const middleware = validateBody(badSchema);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Not a Zod error');
    });
  });

  describe('validateQuery', () => {
    it('should pass validation with valid query params', async () => {
      const schema = z.object({
        page: z.string().regex(/^\d+$/).transform(Number),
        limit: z.string().regex(/^\d+$/).transform(Number)
      });

      mockRequest.query = { page: '1', limit: '10' };

      const middleware = validateQuery(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.query).toEqual({ page: 1, limit: 10 });
      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should reject invalid query params', async () => {
      const schema = z.object({
        page: z.string().regex(/^\d+$/)
      });

      mockRequest.query = { page: 'invalid' };

      const middleware = validateQuery(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).toHaveBeenCalledWith(400);
    });

    it('should handle optional query params', async () => {
      const schema = z.object({
        search: z.string().optional()
      });

      mockRequest.query = {};

      const middleware = validateQuery(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });
  });

  describe('validateParams', () => {
    it('should pass validation with valid URL params', async () => {
      const schema = z.object({
        id: z.string().uuid()
      });

      mockRequest.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

      const middleware = validateParams(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should reject invalid URL params', async () => {
      const schema = z.object({
        id: z.string().uuid()
      });

      mockRequest.params = { id: 'not-a-uuid' };

      const middleware = validateParams(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).toHaveBeenCalledWith(400);
    });

    it('should validate numeric params', async () => {
      const schema = z.object({
        userId: z.string().regex(/^\d+$/).transform(Number)
      });

      mockRequest.params = { userId: '123' };

      const middleware = validateParams(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.params).toEqual({ userId: 123 });
    });
  });

  describe('validate (combined)', () => {
    it('should validate all three: body, query, and params', async () => {
      const schemas = {
        body: z.object({ email: z.string().email() }),
        query: z.object({ page: z.string() }),
        params: z.object({ id: z.string() })
      };

      mockRequest.body = { email: 'test@example.com' };
      mockRequest.query = { page: '1' };
      mockRequest.params = { id: 'abc123' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should fail if body validation fails', async () => {
      const schemas = {
        body: z.object({ email: z.string().email() }),
        query: z.object({ page: z.string() })
      };

      mockRequest.body = { email: 'invalid' };
      mockRequest.query = { page: '1' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).toHaveBeenCalledWith(400);
    });

    it('should fail if query validation fails', async () => {
      const schemas = {
        body: z.object({ email: z.string().email() }),
        query: z.object({ page: z.string().regex(/^\d+$/) })
      };

      mockRequest.body = { email: 'test@example.com' };
      mockRequest.query = { page: 'invalid' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).toHaveBeenCalledWith(400);
    });

    it('should fail if params validation fails', async () => {
      const schemas = {
        params: z.object({ id: z.string().uuid() })
      };

      mockRequest.params = { id: 'not-a-uuid' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).toHaveBeenCalledWith(400);
    });

    it('should work with only body schema', async () => {
      const schemas = {
        body: z.object({ name: z.string() })
      };

      mockRequest.body = { name: 'test' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should work with only query schema', async () => {
      const schemas = {
        query: z.object({ search: z.string() })
      };

      mockRequest.query = { search: 'test' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should work with only params schema', async () => {
      const schemas = {
        params: z.object({ id: z.string() })
      };

      mockRequest.params = { id: 'test' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should validate in order: body, query, then params', async () => {
      const validationOrder: string[] = [];

      const schemas = {
        body: z.object({ name: z.string() }).transform(val => {
          validationOrder.push('body');
          return val;
        }),
        query: z.object({ page: z.string() }).transform(val => {
          validationOrder.push('query');
          return val;
        }),
        params: z.object({ id: z.string() }).transform(val => {
          validationOrder.push('params');
          return val;
        })
      };

      mockRequest.body = { name: 'test' };
      mockRequest.query = { page: '1' };
      mockRequest.params = { id: 'abc' };

      const middleware = validate(schemas);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(validationOrder).toEqual(['body', 'query', 'params']);
    });
  });

  describe('setupValidationErrorHandler', () => {
    it('should register error handler that catches ZodError', async () => {
      const mockApp = {
        setErrorHandler: jest.fn()
      };

      setupValidationErrorHandler(mockApp);

      expect(mockApp.setErrorHandler).toHaveBeenCalledWith(expect.any(Function));

      // Get the registered error handler
      const errorHandler = mockApp.setErrorHandler.mock.calls[0][0];

      // Create a ZodError
      const schema = z.object({ email: z.string().email() });
      let zodError: ZodError;
      try {
        schema.parse({ email: 'invalid' });
      } catch (error) {
        zodError = error as ZodError;
      }

      // Call the error handler
      await errorHandler(zodError!, mockRequest, mockReply);

      expect(codeMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          error: 'Validation Error'
        })
      );
    });

    it('should rethrow non-ZodError errors', () => {
      const mockApp = {
        setErrorHandler: jest.fn()
      };

      setupValidationErrorHandler(mockApp);

      const errorHandler = mockApp.setErrorHandler.mock.calls[0][0];
      const normalError = new Error('Not a validation error');

      expect(() => {
        errorHandler(normalError, mockRequest, mockReply);
      }).toThrow('Not a validation error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty body object', async () => {
      const schema = z.object({}).strict();

      mockRequest.body = {};

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should handle null body', async () => {
      const schema = z.null();

      mockRequest.body = null;

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should handle undefined in optional fields', async () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional()
      });

      mockRequest.body = { required: 'test' };

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should handle array validation', async () => {
      const schema = z.object({
        tags: z.array(z.string())
      });

      mockRequest.body = { tags: ['tag1', 'tag2', 'tag3'] };

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });

    it('should handle deeply nested objects', async () => {
      const schema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              value: z.string()
            })
          })
        })
      });

      mockRequest.body = {
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      };

      const middleware = validateBody(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeMock).not.toHaveBeenCalled();
    });
  });
});
