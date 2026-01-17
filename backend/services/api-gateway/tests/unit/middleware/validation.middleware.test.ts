import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import {
  setupValidationMiddleware,
  validateBody,
  validateQuery,
  validateUuidParam,
} from '../../../src/middleware/validation.middleware';

// Mock schemas module
const mockSchemas = new Map();
jest.mock('../../../src/schemas', () => ({
  getSchema: jest.fn((name: string) => mockSchemas.get(name)),
}));

jest.mock('../../../src/utils/logger', () => ({
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('validation.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSchemas.clear();

    mockServer = {
      setValidatorCompiler: jest.fn(),
      setSerializerCompiler: jest.fn(),
    };

    mockRequest = {
      id: 'req-123',
      url: '/api/test',
      ip: '127.0.0.1',
      body: {},
      query: {},
      params: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('setupValidationMiddleware', () => {
    it('configures validator compiler', async () => {
      await setupValidationMiddleware(mockServer);

      expect(mockServer.setValidatorCompiler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('configures serializer compiler', async () => {
      await setupValidationMiddleware(mockServer);

      expect(mockServer.setSerializerCompiler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('validator compiler returns pass-through function', async () => {
      await setupValidationMiddleware(mockServer);

      const compilerFn = mockServer.setValidatorCompiler.mock.calls[0][0];
      const validatorFn = compilerFn({ schema: {} });
      const data = { test: 'data' };

      const result = validatorFn(data);

      expect(result).toEqual({ value: data });
    });

    it('serializer compiler returns JSON stringifier', async () => {
      await setupValidationMiddleware(mockServer);

      const compilerFn = mockServer.setSerializerCompiler.mock.calls[0][0];
      const serializerFn = compilerFn({ schema: {} });
      const data = { test: 'data' };

      const result = serializerFn(data);

      expect(result).toBe(JSON.stringify(data));
    });
  });

  describe('validateBody', () => {
    it('passes through when schema not found', async () => {
      const middleware = validateBody('nonexistent-schema');

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('validates valid request body successfully', async () => {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
      });
      mockSchemas.set('login', schema);

      mockRequest.body = {
        email: 'test@example.com',
        password: 'password123',
      };

      const middleware = validateBody('login');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('rejects invalid request body with detailed errors', async () => {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(8).required(),
      });
      mockSchemas.set('login', schema);

      mockRequest.body = {
        email: 'invalid-email',
        password: 'short',
      };

      const middleware = validateBody('login');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          code: 'GATEWAY_VALIDATION_ERROR',
          details: expect.arrayContaining([
            expect.objectContaining({
              field: 'email',
              message: expect.any(String),
            }),
            expect.objectContaining({
              field: 'password',
              message: expect.any(String),
            }),
          ]),
          requestId: 'req-123',
          timestamp: expect.any(String),
        })
      );
    });

    it('returns all validation errors when abortEarly is false', async () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().required(),
        email: Joi.string().email().required(),
      });
      mockSchemas.set('user', schema);

      mockRequest.body = {};

      const middleware = validateBody('user');
      await middleware(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.details).toHaveLength(3);
    });

    it('includes request ID and timestamp in error response', async () => {
      const schema = Joi.object({
        email: Joi.string().email().required(),
      });
      mockSchemas.set('test', schema);

      mockRequest.body = { email: 'bad' };

      const middleware = validateBody('test');
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        })
      );
    });

    it('handles nested object validation', async () => {
      const schema = Joi.object({
        user: Joi.object({
          profile: Joi.object({
            name: Joi.string().required(),
          }).required(),
        }).required(),
      });
      mockSchemas.set('nested', schema);

      mockRequest.body = {
        user: {
          profile: {},
        },
      };

      const middleware = validateBody('nested');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.details[0].field).toBe('user.profile.name');
    });

    it('does not strip unknown fields', async () => {
      const schema = Joi.object({
        email: Joi.string().email().required(),
      });
      mockSchemas.set('test', schema);

      mockRequest.body = {
        email: 'test@example.com',
        extraField: 'should-remain',
      };

      const middleware = validateBody('test');
      await middleware(mockRequest, mockReply);

      expect(mockRequest.body.extraField).toBe('should-remain');
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('includes error type in validation details', async () => {
      const schema = Joi.object({
        age: Joi.number().min(18).required(),
      });
      mockSchemas.set('test', schema);

      mockRequest.body = { age: 15 };

      const middleware = validateBody('test');
      await middleware(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.details[0]).toHaveProperty('type');
    });
  });

  describe('validateQuery', () => {
    it('validates valid query parameters', async () => {
      const schema = Joi.object({
        page: Joi.number().min(1),
        limit: Joi.number().min(1).max(100),
      });

      mockRequest.query = { page: '1', limit: '10' };

      const middleware = validateQuery(schema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('rejects invalid query parameters', async () => {
      const schema = Joi.object({
        page: Joi.number().min(1),
        limit: Joi.number().min(1).max(100),
      });

      mockRequest.query = { page: '0', limit: '200' };

      const middleware = validateQuery(schema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid query parameters',
          code: 'GATEWAY_QUERY_VALIDATION_ERROR',
          details: expect.any(Array),
        })
      );
    });

    it('returns all query validation errors', async () => {
      const schema = Joi.object({
        startDate: Joi.date().required(),
        endDate: Joi.date().required(),
        status: Joi.string().valid('active', 'inactive').required(),
      });

      mockRequest.query = {};

      const middleware = validateQuery(schema);
      await middleware(mockRequest, mockReply);

      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.details).toHaveLength(3);
    });

    it('includes request ID in query error response', async () => {
      const schema = Joi.object({
        filter: Joi.string().required(),
      });

      mockRequest.query = {};

      const middleware = validateQuery(schema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
        })
      );
    });

    it('does not strip unknown query parameters', async () => {
      const schema = Joi.object({
        page: Joi.number(),
      });

      mockRequest.query = { page: '1', debug: 'true' };

      const middleware = validateQuery(schema);
      await middleware(mockRequest, mockReply);

      expect(mockRequest.query.debug).toBe('true');
    });
  });

  describe('validateUuidParam', () => {
    it('allows valid UUID v4', async () => {
      mockRequest.params = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const middleware = validateUuidParam('userId');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('allows valid UUID v1', async () => {
      mockRequest.params = {
        id: 'c73bcdcc-2669-11e8-b467-0ed5f89f718b',
      };

      const middleware = validateUuidParam('id');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('rejects invalid UUID format', async () => {
      mockRequest.params = {
        userId: 'not-a-uuid',
      };

      const middleware = validateUuidParam('userId');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid parameter',
          code: 'INVALID_UUID',
          message: "Parameter 'userId' must be a valid UUID",
        })
      );
    });

    it('rejects UUID with invalid characters', async () => {
      mockRequest.params = {
        id: '550e8400-e29b-41d4-a716-44665544000g',
      };

      const middleware = validateUuidParam('id');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('rejects UUID with wrong format', async () => {
      mockRequest.params = {
        id: '550e8400e29b41d4a716446655440000',
      };

      const middleware = validateUuidParam('id');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('allows missing UUID parameter', async () => {
      mockRequest.params = {};

      const middleware = validateUuidParam('userId');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('rejects empty string as UUID', async () => {
      mockRequest.params = {
        userId: '',
      };

      const middleware = validateUuidParam('userId');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('is case insensitive for UUID validation', async () => {
      mockRequest.params = {
        id: '550E8400-E29B-41D4-A716-446655440000',
      };

      const middleware = validateUuidParam('id');
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('includes request ID in UUID error response', async () => {
      mockRequest.params = {
        venueId: 'invalid',
      };

      const middleware = validateUuidParam('venueId');
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          timestamp: expect.any(String),
        })
      );
    });
  });
});
