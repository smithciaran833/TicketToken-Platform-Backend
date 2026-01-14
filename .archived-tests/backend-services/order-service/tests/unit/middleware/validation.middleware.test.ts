import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { validate, validateData } from '../../../src/middleware/validation.middleware';

describe('Validation Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    sendMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock,
      send: sendMock,
    } as Partial<FastifyReply>;

    mockRequest = {
      body: {},
      params: {},
      query: {},
      log: {
        error: jest.fn(),
      } as any,
    } as Partial<FastifyRequest>;
  });

  describe('Body Validation', () => {
    it('should pass validation with valid body', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      mockRequest.body = { name: 'John', age: 30 };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
      expect(mockRequest.body).toEqual({ name: 'John', age: 30 });
    });

    it('should reject invalid body', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      mockRequest.body = { name: 'John' }; // missing age

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Request body validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'age',
            message: expect.stringContaining('required'),
          }),
        ]),
      });
    });

    it('should sanitize and transform valid body', async () => {
      const schema = Joi.object({
        name: Joi.string().trim().required(),
        age: Joi.number().integer().required(),
      });

      mockRequest.body = { name: '  John  ', age: '30' };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.body).toEqual({ name: 'John', age: 30 });
    });

    it('should reject multiple validation errors with abortEarly false', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
        email: Joi.string().email().required(),
      });

      mockRequest.body = {}; // all missing

      const middleware = validate({ body: schema, abortEarly: false });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      const call = sendMock.mock.calls[0][0];
      expect(call.details).toHaveLength(3);
    });

    it('should reject first error with abortEarly true', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
        email: Joi.string().email().required(),
      });

      mockRequest.body = {}; // all missing

      const middleware = validate({ body: schema, abortEarly: true });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      const call = sendMock.mock.calls[0][0];
      expect(call.details).toHaveLength(1);
    });

    it('should handle nested object validation', async () => {
      const schema = Joi.object({
        user: Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required(),
        }).required(),
      });

      mockRequest.body = {
        user: {
          name: 'John',
          email: 'invalid-email',
        },
      };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.arrayContaining([
            expect.objectContaining({
              field: 'user.email',
            }),
          ]),
        })
      );
    });

    it('should handle array validation', async () => {
      const schema = Joi.object({
        items: Joi.array()
          .items(
            Joi.object({
              id: Joi.string().required(),
              quantity: Joi.number().min(1).required(),
            })
          )
          .min(1)
          .required(),
      });

      mockRequest.body = {
        items: [
          { id: 'item-1', quantity: 2 },
          { id: 'item-2', quantity: 0 }, // invalid
        ],
      };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should skip body validation if no schema provided', async () => {
      mockRequest.body = { anything: 'goes' };

      const middleware = validate({});
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should skip body validation if body is undefined', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      mockRequest.body = undefined;

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('Params Validation', () => {
    it('should pass validation with valid params', async () => {
      const schema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      mockRequest.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const middleware = validate({ params: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject invalid params', async () => {
      const schema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      mockRequest.params = { id: 'not-a-uuid' };

      const middleware = validate({ params: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Path parameters validation failed',
        details: expect.any(Array),
      });
    });

    it('should transform params', async () => {
      const schema = Joi.object({
        id: Joi.number().integer().required(),
      });

      mockRequest.params = { id: '123' };

      const middleware = validate({ params: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.params).toEqual({ id: 123 });
    });

    it('should handle multiple param errors', async () => {
      const schema = Joi.object({
        userId: Joi.string().uuid().required(),
        orderId: Joi.string().uuid().required(),
      });

      mockRequest.params = { userId: 'invalid', orderId: 'invalid' };

      const middleware = validate({ params: schema, abortEarly: false });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      const call = sendMock.mock.calls[0][0];
      expect(call.details).toHaveLength(2);
    });
  });

  describe('Query Validation', () => {
    it('should pass validation with valid query', async () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(10),
      });

      mockRequest.query = { page: '2', limit: '20' };

      const middleware = validate({ query: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
      expect(mockRequest.query).toEqual({ page: 2, limit: 20 });
    });

    it('should reject invalid query', async () => {
      const schema = Joi.object({
        page: Joi.number().integer().min(1).required(),
      });

      mockRequest.query = { page: 'invalid' };

      const middleware = validate({ query: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: 'Query parameters validation failed',
        details: expect.any(Array),
      });
    });

    it('should apply defaults for missing query params', async () => {
      const schema = Joi.object({
        page: Joi.number().integer().default(1),
        limit: Joi.number().integer().default(10),
      });

      mockRequest.query = {};

      const middleware = validate({ query: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.query).toEqual({ page: 1, limit: 10 });
    });

    it('should handle array query params', async () => {
      const schema = Joi.object({
        status: Joi.array().items(Joi.string().valid('pending', 'confirmed')),
      });

      mockRequest.query = { status: ['pending', 'confirmed'] };

      const middleware = validate({ query: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle boolean query params', async () => {
      const schema = Joi.object({
        includeDetails: Joi.boolean().default(false),
      });

      mockRequest.query = { includeDetails: 'true' };

      const middleware = validate({ query: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.query).toEqual({ includeDetails: true });
    });
  });

  describe('Combined Validation', () => {
    it('should validate all parts when schemas provided', async () => {
      const bodySchema = Joi.object({
        name: Joi.string().required(),
      });
      const paramsSchema = Joi.object({
        id: Joi.string().uuid().required(),
      });
      const querySchema = Joi.object({
        page: Joi.number().default(1),
      });

      mockRequest.body = { name: 'Test' };
      mockRequest.params = { id: '550e8400-e29b-41d4-a716-446655440000' };
      mockRequest.query = {};

      const middleware = validate({
        body: bodySchema,
        params: paramsSchema,
        query: querySchema,
      });

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
      expect(mockRequest.query).toEqual({ page: 1 });
    });

    it('should fail on first invalid part (body)', async () => {
      const bodySchema = Joi.object({
        name: Joi.string().required(),
      });
      const paramsSchema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      mockRequest.body = {}; // invalid
      mockRequest.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const middleware = validate({
        body: bodySchema,
        params: paramsSchema,
      });

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Request body validation failed',
        })
      );
    });

    it('should fail on params if body passes', async () => {
      const bodySchema = Joi.object({
        name: Joi.string().required(),
      });
      const paramsSchema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      mockRequest.body = { name: 'Test' };
      mockRequest.params = { id: 'invalid' }; // invalid

      const middleware = validate({
        body: bodySchema,
        params: paramsSchema,
      });

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Path parameters validation failed',
        })
      );
    });
  });

  describe('Error Details Format', () => {
    it('should format error details correctly', async () => {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        age: Joi.number().min(18).required(),
      });

      mockRequest.body = { email: 'invalid-email', age: 15 };

      const middleware = validate({ body: schema, abortEarly: false });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const call = sendMock.mock.calls[0][0];
      expect(call.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
            type: expect.any(String),
          }),
        ])
      );
    });

    it('should handle nested field paths in errors', async () => {
      const schema = Joi.object({
        address: Joi.object({
          street: Joi.string().required(),
          zip: Joi.string().pattern(/^\d{5}$/).required(),
        }).required(),
      });

      mockRequest.body = {
        address: {
          street: 'Main St',
          zip: 'invalid',
        },
      };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const call = sendMock.mock.calls[0][0];
      expect(call.details[0].field).toBe('address.zip');
    });
  });

  describe('Exception Handling', () => {
    it('should catch and handle unexpected errors', async () => {
      const badSchema = {
        validate: () => {
          throw new Error('Unexpected error');
        },
      } as any;

      mockRequest.body = { test: 'data' };

      const middleware = validate({ body: badSchema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An error occurred during validation',
      });
      expect(mockRequest.log.error).toHaveBeenCalled();
    });

    it('should log error details', async () => {
      const badSchema = {
        validate: () => {
          throw new Error('Schema error');
        },
      } as any;

      mockRequest.body = { test: 'data' };

      const middleware = validate({ body: badSchema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.log.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Validation middleware error'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty request parts', async () => {
      mockRequest.body = null;
      mockRequest.params = null;
      mockRequest.query = null;

      const middleware = validate({
        body: Joi.object({}),
        params: Joi.object({}),
        query: Joi.object({}),
      });

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle very large body', async () => {
      const schema = Joi.object({
        data: Joi.array().items(Joi.object({ id: Joi.string() })),
      });

      mockRequest.body = {
        data: Array.from({ length: 1000 }, (_, i) => ({ id: `item-${i}` })),
      };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle special characters in field names', async () => {
      const schema = Joi.object({
        'special-field': Joi.string().required(),
      });

      mockRequest.body = { 'special-field': 'value' };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});

describe('validateData Function', () => {
  it('should validate and return value on success', async () => {
    const schema = Joi.object({
      name: Joi.string().required(),
      age: Joi.number().required(),
    });

    const data = { name: 'John', age: 30 };

    const result = await validateData(data, schema);

    expect(result.error).toBeNull();
    expect(result.value).toEqual({ name: 'John', age: 30 });
  });

  it('should return error on validation failure', async () => {
    const schema = Joi.object({
      name: Joi.string().required(),
      age: Joi.number().required(),
    });

    const data = { name: 'John' }; // missing age

    const result = await validateData(data, schema);

    expect(result.value).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error).toBeInstanceOf(Joi.ValidationError);
  });

  it('should transform data on success', async () => {
    const schema = Joi.object({
      name: Joi.string().trim().required(),
      age: Joi.number().integer().required(),
    });

    const data = { name: '  John  ', age: '30' };

    const result = await validateData(data, schema);

    expect(result.error).toBeNull();
    expect(result.value).toEqual({ name: 'John', age: 30 });
  });

  it('should respect abortEarly option', async () => {
    const schema = Joi.object({
      name: Joi.string().required(),
      age: Joi.number().required(),
      email: Joi.string().email().required(),
    });

    const data = {}; // all missing

    const resultAbort = await validateData(data, schema, true);
    expect(resultAbort.error?.details).toHaveLength(1);

    const resultAll = await validateData(data, schema, false);
    expect(resultAll.error?.details).toHaveLength(3);
  });

  it('should handle nested validation', async () => {
    const schema = Joi.object({
      user: Joi.object({
        name: Joi.string().required(),
        contact: Joi.object({
          email: Joi.string().email().required(),
        }).required(),
      }).required(),
    });

    const data = {
      user: {
        name: 'John',
        contact: {
          email: 'john@example.com',
        },
      },
    };

    const result = await validateData(data, schema);

    expect(result.error).toBeNull();
    expect(result.value).toEqual(data);
  });

  it('should handle array validation', async () => {
    const schema = Joi.array().items(Joi.number()).min(1);

    const data = [1, 2, 3];

    const result = await validateData(data, schema);

    expect(result.error).toBeNull();
    expect(result.value).toEqual([1, 2, 3]);
  });

  it('should throw on unexpected validation error', async () => {
    const badSchema = {
      validate: () => {
        throw new Error('Simulated error');
      },
    } as any;

    await expect(validateData({ test: 'data' }, badSchema)).rejects.toThrow(
      'Unexpected validation error'
    );
  });

  it('should handle type coercion', async () => {
    const schema = Joi.object({
      id: Joi.number(),
      active: Joi.boolean(),
    });

    const data = { id: '123', active: 'true' };

    const result = await validateData(data, schema);

    expect(result.error).toBeNull();
    expect(result.value).toEqual({ id: 123, active: true });
  });

  it('should strip unknown fields when schema requires', async () => {
    const schema = Joi.object({
      name: Joi.string().required(),
    }).options({ stripUnknown: true });

    const data = { name: 'John', extra: 'field' };

    const result = await validateData(data, schema);

    expect(result.error).toBeNull();
    expect(result.value).toEqual({ name: 'John' });
  });
});
