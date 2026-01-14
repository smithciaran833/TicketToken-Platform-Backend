/**
 * Unit Tests: Validation Middleware
 * Tests Joi schema validation
 */

import { validate, validateData } from '../../../src/middleware/validation.middleware';
import Joi from 'joi';

describe('validate middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      body: {},
      params: {},
      query: {},
      log: { error: jest.fn() },
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('Body validation', () => {
    const bodySchema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      age: Joi.number().min(0).max(120),
    });

    it('should pass valid body', async () => {
      mockRequest.body = { name: 'John', email: 'john@example.com', age: 30 };
      const middleware = validate({ body: bodySchema });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockRequest.body).toEqual({ name: 'John', email: 'john@example.com', age: 30 });
    });

    it('should reject invalid body', async () => {
      mockRequest.body = { name: 'John', email: 'invalid-email' };
      const middleware = validate({ body: bodySchema });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Validation Error',
        message: 'Request body validation failed',
      }));
    });

    it('should return all errors when abortEarly is false', async () => {
      mockRequest.body = { email: 'invalid' };
      const middleware = validate({ body: bodySchema, abortEarly: false });

      await middleware(mockRequest, mockReply);

      const response = mockReply.send.mock.calls[0][0];
      expect(response.details.length).toBeGreaterThan(1);
    });

    it('should sanitize body with defaults', async () => {
      const schemaWithDefault = Joi.object({
        name: Joi.string().required(),
        role: Joi.string().default('user'),
      });
      mockRequest.body = { name: 'John' };
      const middleware = validate({ body: schemaWithDefault });

      await middleware(mockRequest, mockReply);

      expect(mockRequest.body.role).toBe('user');
    });
  });

  describe('Params validation', () => {
    const paramsSchema = Joi.object({
      id: Joi.string().uuid().required(),
    });

    it('should pass valid params', async () => {
      mockRequest.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const middleware = validate({ params: paramsSchema });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject invalid params', async () => {
      mockRequest.params = { id: 'not-a-uuid' };
      const middleware = validate({ params: paramsSchema });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Path parameters validation failed',
      }));
    });
  });

  describe('Query validation', () => {
    const querySchema = Joi.object({
      page: Joi.number().min(1).default(1),
      limit: Joi.number().min(1).max(100).default(10),
      status: Joi.string().valid('PENDING', 'CONFIRMED', 'CANCELLED'),
    });

    it('should pass valid query', async () => {
      mockRequest.query = { page: '2', limit: '20', status: 'CONFIRMED' };
      const middleware = validate({ query: querySchema });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject invalid query', async () => {
      mockRequest.query = { status: 'INVALID_STATUS' };
      const middleware = validate({ query: querySchema });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Query parameters validation failed',
      }));
    });

    it('should apply defaults to query', async () => {
      mockRequest.query = {};
      const middleware = validate({ query: querySchema });

      await middleware(mockRequest, mockReply);

      expect(mockRequest.query.page).toBe(1);
      expect(mockRequest.query.limit).toBe(10);
    });
  });

  describe('Combined validation', () => {
    it('should validate body, params, and query together', async () => {
      mockRequest.body = { name: 'Test' };
      mockRequest.params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      mockRequest.query = { page: '1' };

      const middleware = validate({
        body: Joi.object({ name: Joi.string().required() }),
        params: Joi.object({ id: Joi.string().uuid().required() }),
        query: Joi.object({ page: Joi.number().min(1) }),
      });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle unexpected errors', async () => {
      mockRequest.body = { name: 'Test' };
      const brokenSchema = {
        validate: () => { throw new Error('Unexpected'); },
      } as any;
      const middleware = validate({ body: brokenSchema });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});

describe('validateData', () => {
  const schema = Joi.object({
    name: Joi.string().required(),
    age: Joi.number().min(0),
  });

  it('should return value on valid data', async () => {
    const result = await validateData({ name: 'John', age: 30 }, schema);

    expect(result.error).toBeNull();
    expect(result.value).toEqual({ name: 'John', age: 30 });
  });

  it('should return error on invalid data', async () => {
    const result = await validateData({ age: -5 }, schema);

    expect(result.value).toBeNull();
    expect(result.error).toBeDefined();
  });
});
