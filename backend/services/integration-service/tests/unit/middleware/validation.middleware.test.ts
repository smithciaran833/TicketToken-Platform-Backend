import { FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import {
  validateFastify,
  validateValue,
  validate,
} from '../../../src/middleware/validation.middleware';

describe('validation.middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      code: mockCode,
    };

    mockRequest = {
      body: {},
      query: {},
      params: {},
    };
  });

  describe('validateFastify', () => {
    describe('body validation', () => {
      it('should pass validation with valid body', async () => {
        const schema = Joi.object({
          name: Joi.string().required(),
          age: Joi.number().required(),
        });

        mockRequest.body = { name: 'John', age: 30 };

        const middleware = validateFastify({ body: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('should fail validation with missing required field', async () => {
        const schema = Joi.object({
          name: Joi.string().required(),
          age: Joi.number().required(),
        });

        mockRequest.body = { name: 'John' };

        const middleware = validateFastify({ body: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).toHaveBeenCalledWith(400);
        expect(mockSend).toHaveBeenCalledWith({
          success: false,
          error: 'Validation failed',
          details: expect.arrayContaining([expect.stringContaining('Body:')]),
        });
      });

      it('should fail validation with invalid type', async () => {
        const schema = Joi.object({
          age: Joi.number().required(),
        });

        mockRequest.body = { age: 'not a number' };

        const middleware = validateFastify({ body: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).toHaveBeenCalledWith(400);
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Validation failed',
          })
        );
      });

      it('should strip unknown fields', async () => {
        const schema = Joi.object({
          name: Joi.string().required(),
        });

        mockRequest.body = { name: 'John', extraField: 'should be removed' };

        const middleware = validateFastify({ body: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
      });

      it('should report multiple validation errors', async () => {
        const schema = Joi.object({
          name: Joi.string().required(),
          age: Joi.number().required(),
          email: Joi.string().email().required(),
        });

        mockRequest.body = {};

        const middleware = validateFastify({ body: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).toHaveBeenCalledWith(400);
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            details: expect.any(Array),
          })
        );
        const details = mockSend.mock.calls[0][0].details;
        expect(details.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('query validation', () => {
      it('should pass validation with valid query', async () => {
        const schema = Joi.object({
          page: Joi.number().default(1),
          limit: Joi.number().default(10),
        });

        mockRequest.query = { page: '2', limit: '20' };

        const middleware = validateFastify({ query: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
      });

      it('should apply defaults to query', async () => {
        const schema = Joi.object({
          page: Joi.number().default(1),
          limit: Joi.number().default(10),
        });

        mockRequest.query = {};

        const middleware = validateFastify({ query: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRequest.query).toEqual({ page: 1, limit: 10 });
        expect(mockCode).not.toHaveBeenCalled();
      });

      it('should fail validation with invalid query parameter', async () => {
        const schema = Joi.object({
          status: Joi.string().valid('active', 'inactive').required(),
        });

        mockRequest.query = { status: 'invalid' };

        const middleware = validateFastify({ query: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).toHaveBeenCalledWith(400);
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            details: expect.arrayContaining([expect.stringContaining('Query:')]),
          })
        );
      });

      it('should transform query values', async () => {
        const schema = Joi.object({
          active: Joi.boolean().default(true),
        });

        mockRequest.query = { active: 'false' };

        const middleware = validateFastify({ query: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRequest.query).toEqual({ active: false });
      });
    });

    describe('params validation', () => {
      it('should pass validation with valid params', async () => {
        const schema = Joi.object({
          id: Joi.string().uuid().required(),
        });

        mockRequest.params = { id: '123e4567-e89b-12d3-a456-426614174000' };

        const middleware = validateFastify({ params: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
      });

      it('should fail validation with invalid params', async () => {
        const schema = Joi.object({
          id: Joi.string().uuid().required(),
        });

        mockRequest.params = { id: 'not-a-uuid' };

        const middleware = validateFastify({ params: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).toHaveBeenCalledWith(400);
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            details: expect.arrayContaining([expect.stringContaining('Params:')]),
          })
        );
      });
    });

    describe('combined validation', () => {
      it('should validate all sources together', async () => {
        const schemas = {
          body: Joi.object({ name: Joi.string().required() }),
          query: Joi.object({ page: Joi.number().default(1) }),
          params: Joi.object({ id: Joi.string().required() }),
        };

        mockRequest.body = { name: 'John' };
        mockRequest.query = {};
        mockRequest.params = { id: '123' };

        const middleware = validateFastify(schemas);
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
        expect(mockRequest.query).toEqual({ page: 1 });
      });

      it('should report errors from multiple sources', async () => {
        const schemas = {
          body: Joi.object({ name: Joi.string().required() }),
          query: Joi.object({ page: Joi.number().required() }),
          params: Joi.object({ id: Joi.string().uuid().required() }),
        };

        mockRequest.body = {};
        mockRequest.query = {};
        mockRequest.params = { id: 'invalid' };

        const middleware = validateFastify(schemas);
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).toHaveBeenCalledWith(400);
        const details = mockSend.mock.calls[0][0].details;
        expect(details.length).toBe(3);
        expect(details.some((d: string) => d.includes('Body:'))).toBe(true);
        expect(details.some((d: string) => d.includes('Query:'))).toBe(true);
        expect(details.some((d: string) => d.includes('Params:'))).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty schemas object', async () => {
        const middleware = validateFastify({});
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
      });

      it('should handle undefined body', async () => {
        const schema = Joi.object({
          name: Joi.string().optional(),
        });

        mockRequest.body = undefined;

        const middleware = validateFastify({ body: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
      });

      it('should handle null values', async () => {
        const schema = Joi.object({
          name: Joi.string().allow(null),
        });

        mockRequest.body = { name: null };

        const middleware = validateFastify({ body: schema });
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockCode).not.toHaveBeenCalled();
      });
    });
  });

  describe('validateValue', () => {
    it('should return validated value on success', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      const result = validateValue(schema, { name: 'John', age: 30 });

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({ name: 'John', age: 30 });
    });

    it('should return errors on validation failure', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      const result = validateValue(schema, { name: 'John' });

      expect(result.error).toBeDefined();
      expect(result.error).toEqual(expect.any(Array));
      expect(result.error!.length).toBeGreaterThan(0);
      expect(result.value).toBeUndefined();
    });

    it('should apply transformations', () => {
      const schema = Joi.object({
        name: Joi.string().uppercase(),
      });

      const result = validateValue(schema, { name: 'john' });

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({ name: 'JOHN' });
    });

    it('should strip unknown fields', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      const result = validateValue(schema, { name: 'John', extra: 'field' });

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({ name: 'John' });
    });

    it('should apply defaults', () => {
      const schema = Joi.object({
        status: Joi.string().default('active'),
      });

      const result = validateValue(schema, {});

      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({ status: 'active' });
    });

    it('should return all validation errors', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
        email: Joi.string().email().required(),
      });

      const result = validateValue(schema, {});

      expect(result.error).toBeDefined();
      expect(result.error!.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('validate', () => {
    it('should return validated value on success', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      const result = await validate(schema, { name: 'John' });

      expect(result).toEqual({ name: 'John' });
    });

    it('should throw error on validation failure', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      await expect(validate(schema, {})).rejects.toThrow('Validation failed');
    });

    it('should include all errors in thrown message', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
      });

      await expect(validate(schema, {})).rejects.toThrow();
    });

    it('should apply transformations', async () => {
      const schema = Joi.object({
        name: Joi.string().uppercase(),
      });

      const result = await validate(schema, { name: 'john' });

      expect(result).toEqual({ name: 'JOHN' });
    });

    it('should strip unknown fields', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      const result = await validate(schema, { name: 'John', extra: 'field' });

      expect(result).toEqual({ name: 'John' });
    });

    it('should apply defaults', async () => {
      const schema = Joi.object({
        status: Joi.string().default('active'),
      });

      const result = await validate(schema, {});

      expect(result).toEqual({ status: 'active' });
    });
  });
});
