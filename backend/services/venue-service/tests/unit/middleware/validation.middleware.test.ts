import { validate } from '../../../src/middleware/validation.middleware';
import { FastifyRequest, FastifyReply } from 'fastify';
import * as Joi from 'joi';

describe('Validation Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      body: {},
      query: {},
      params: {}
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      request: {
        id: 'test-request-id-123'
      } as any
    } as any;
  });

  // =============================================================================
  // Request Body Validation Tests
  // =============================================================================

  describe('Request Body Validation', () => {
    it('should pass valid request bodies', async () => {
      const schema = {
        body: Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required()
        })
      };

      mockRequest.body = {
        name: 'Test Venue',
        email: 'test@example.com'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should reject invalid request bodies with 422', async () => {
      const schema = {
        body: Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required()
        })
      };

      mockRequest.body = {
        name: 'Test Venue'
        // missing email
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Validation Error'
      }));
    });

    it('should reject missing required fields', async () => {
      const schema = {
        body: Joi.object({
          name: Joi.string().required(),
          capacity: Joi.number().required()
        })
      };

      mockRequest.body = {
        name: 'Test'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should strip extra fields with stripUnknown', async () => {
      const schema = {
        body: Joi.object({
          name: Joi.string().required()
        }).options({ stripUnknown: true })
      };

      mockRequest.body = {
        name: 'Test',
        extraField: 'should be removed'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.body).not.toHaveProperty('extraField');
    });

    it('should return all validation errors when abortEarly is false', async () => {
      const schema = {
        body: Joi.object({
          name: Joi.string().required(),
          email: Joi.string().email().required(),
          capacity: Joi.number().required()
        })
      };

      mockRequest.body = {};

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.errors).toHaveLength(3);
    });
  });

  // =============================================================================
  // Query Parameter Validation Tests
  // =============================================================================

  describe('Query Parameter Validation', () => {
    it('should validate query parameters', async () => {
      const schema = {
        querystring: Joi.object({
          page: Joi.number().integer().min(1).default(1),
          limit: Joi.number().integer().min(1).max(100).default(20)
        })
      };

      mockRequest.query = {
        page: '2',
        limit: '50'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.query.page).toBe(2);
      expect(mockRequest.query.limit).toBe(50);
    });

    it('should reject invalid query parameter types', async () => {
      const schema = {
        querystring: Joi.object({
          page: Joi.number().integer()
        })
      };

      mockRequest.query = {
        page: 'invalid'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should validate pagination params', async () => {
      const schema = {
        querystring: Joi.object({
          page: Joi.number().integer().min(1),
          limit: Joi.number().integer().min(1).max(100)
        })
      };

      mockRequest.query = {
        page: '0' // invalid: less than min
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should validate search params', async () => {
      const schema = {
        querystring: Joi.object({
          search: Joi.string().min(2).max(100)
        })
      };

      mockRequest.query = {
        search: 'a' // too short
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });
  });

  // =============================================================================
  // Path Parameter Validation Tests
  // =============================================================================

  describe('Path Parameter Validation', () => {
    it('should validate UUID path parameters', async () => {
      const schema = {
        params: Joi.object({
          venueId: Joi.string().uuid().required()
        })
      };

      mockRequest.params = {
        venueId: '550e8400-e29b-41d4-a716-446655440000'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject invalid UUIDs', async () => {
      const schema = {
        params: Joi.object({
          venueId: Joi.string().uuid().required()
        })
      };

      mockRequest.params = {
        venueId: 'not-a-uuid'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should validate venueId parameter', async () => {
      const schema = {
        params: Joi.object({
          venueId: Joi.string().required()
        })
      };

      mockRequest.params = {};

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should validate staffId parameter', async () => {
      const schema = {
        params: Joi.object({
          staffId: Joi.string().uuid().required()
        })
      };

      mockRequest.params = {
        staffId: '123' // not a UUID
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });
  });

  // =============================================================================
  // Error Response Format Tests
  // =============================================================================

  describe('Error Response Format', () => {
    it('should return validation errors in standard format', async () => {
      const schema = {
        body: Joi.object({
          name: Joi.string().required()
        })
      };

      mockRequest.body = {};

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData).toHaveProperty('error');
      expect(sentData).toHaveProperty('errors');
    });

    it('should include field names in errors', async () => {
      const schema = {
        body: Joi.object({
          email: Joi.string().email().required()
        })
      };

      mockRequest.body = {
        email: 'invalid-email'
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.errors[0]).toHaveProperty('field', 'email');
    });

    it('should provide helpful error messages', async () => {
      const schema = {
        body: Joi.object({
          capacity: Joi.number().min(1).required()
        })
      };

      mockRequest.body = {
        capacity: -5
      };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.errors[0].message).toContain('must be greater');
    });
  });

  // =============================================================================
  // Combined Validation Tests
  // =============================================================================

  describe('Combined Validation', () => {
    it('should validate body, query, and params together', async () => {
      const schema = {
        params: Joi.object({
          venueId: Joi.string().uuid().required()
        }),
        querystring: Joi.object({
          includeStats: Joi.boolean().default(false)
        }),
        body: Joi.object({
          name: Joi.string().required()
        })
      };

      mockRequest.params = { venueId: '550e8400-e29b-41d4-a716-446655440000' };
      mockRequest.query = { includeStats: 'true' };
      mockRequest.body = { name: 'Updated Venue' };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle internal validation errors gracefully', async () => {
      const schema = {
        body: {
          validate: jest.fn(() => {
            throw new Error('Internal error');
          })
        }
      };

      mockRequest.body = { test: 'data' };

      const middleware = validate(schema);
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});
