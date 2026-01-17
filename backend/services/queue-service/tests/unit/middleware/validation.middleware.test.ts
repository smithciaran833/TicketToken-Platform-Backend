// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../../../src/middleware/validation.middleware';
import { logger } from '../../../src/utils/logger';

describe('Validation Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('validateBody', () => {
    const schema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      age: Joi.number().integer().min(0),
    });

    it('should pass validation with valid body', async () => {
      mockRequest.body = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      };

      const middleware = validateBody(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should update request.body with validated data', async () => {
      mockRequest.body = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        extraField: 'should be stripped',
      };

      const middleware = validateBody(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.body).toEqual({
        name: 'Jane Doe',
        email: 'jane@example.com',
      });
      expect((mockRequest.body as any).extraField).toBeUndefined();
    });

    it('should return 400 when required field is missing', async () => {
      mockRequest.body = {
        email: 'john@example.com',
      };

      const middleware = validateBody(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('required'),
          }),
        ]),
      });
    });

    it('should return all validation errors (abortEarly: false)', async () => {
      mockRequest.body = {};

      const middleware = validateBody(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'email' }),
        ]),
      });
    });

    it('should return 400 for invalid email format', async () => {
      mockRequest.body = {
        name: 'John',
        email: 'invalid-email',
      };

      const middleware = validateBody(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.stringContaining('email'),
          }),
        ]),
      });
    });

    it('should log validation errors', async () => {
      mockRequest.body = { name: 123 };

      const middleware = validateBody(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Validation error:',
        expect.any(Array)
      );
    });

    it('should handle nested field paths', async () => {
      const nestedSchema = Joi.object({
        user: Joi.object({
          profile: Joi.object({
            name: Joi.string().required(),
          }),
        }),
      });

      mockRequest.body = {
        user: {
          profile: {},
        },
      };

      const middleware = validateBody(nestedSchema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'user.profile.name',
          }),
        ]),
      });
    });

    it('should rethrow non-Joi errors', async () => {
      const badSchema = {
        validateAsync: jest.fn().mockRejectedValue(new Error('Unexpected error')),
      };

      const middleware = validateBody(badSchema as unknown as Joi.Schema);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Unexpected error');
    });
  });

  describe('validateQuery', () => {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      sort: Joi.string().valid('asc', 'desc'),
    });

    it('should pass validation with valid query', async () => {
      mockRequest.query = {
        page: 2,
        limit: 20,
        sort: 'asc',
      };

      const middleware = validateQuery(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should update request.query with validated/defaulted data', async () => {
      mockRequest.query = {};

      const middleware = validateQuery(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.query).toEqual({
        page: 1,
        limit: 10,
      });
    });

    it('should return 400 for invalid query params', async () => {
      mockRequest.query = {
        page: -1,
      };

      const middleware = validateQuery(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid query parameters',
        details: expect.any(Array),
      });
    });

    it('should return 400 for invalid enum value', async () => {
      mockRequest.query = {
        sort: 'invalid',
      };

      const middleware = validateQuery(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should return all query validation errors', async () => {
      mockRequest.query = {
        page: -1,
        limit: 500,
      };

      const middleware = validateQuery(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid query parameters',
        details: expect.arrayContaining([
          expect.objectContaining({ path: ['page'] }),
          expect.objectContaining({ path: ['limit'] }),
        ]),
      });
    });

    it('should rethrow non-Joi errors', async () => {
      const badSchema = {
        validateAsync: jest.fn().mockRejectedValue(new Error('DB error')),
      };

      const middleware = validateQuery(badSchema as unknown as Joi.Schema);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('DB error');
    });
  });

  describe('validateParams', () => {
    const schema = Joi.object({
      id: Joi.string().uuid().required(),
      queueName: Joi.string().alphanum().min(1).max(50),
    });

    it('should pass validation with valid params', async () => {
      mockRequest.params = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        queueName: 'payments',
      };

      const middleware = validateParams(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should update request.params with validated data', async () => {
      mockRequest.params = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const middleware = validateParams(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.params).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('should return 400 for missing required param', async () => {
      mockRequest.params = {};

      const middleware = validateParams(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid parameters',
        details: expect.any(Array),
      });
    });

    it('should return 400 for invalid UUID format', async () => {
      mockRequest.params = {
        id: 'not-a-valid-uuid',
      };

      const middleware = validateParams(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should return 400 for param exceeding max length', async () => {
      mockRequest.params = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        queueName: 'a'.repeat(51),
      };

      const middleware = validateParams(schema);
      await middleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should rethrow non-Joi errors', async () => {
      const badSchema = {
        validateAsync: jest.fn().mockRejectedValue(new TypeError('Type error')),
      };

      const middleware = validateParams(badSchema as unknown as Joi.Schema);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Type error');
    });
  });
});
