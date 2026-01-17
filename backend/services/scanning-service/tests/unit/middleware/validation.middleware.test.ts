// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/validation.middleware.ts
 */

describe('src/middleware/validation.middleware.ts - Comprehensive Unit Tests', () => {
  let validationMiddleware: any;
  let mockRequest: any;
  let mockReply: any;
  let mockSchema: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Import module under test
    validationMiddleware = require('../../../src/middleware/validation.middleware');

    // Mock request
    mockRequest = {
      body: {},
      params: {},
      query: {},
    };

    // Mock reply
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Mock Joi schema
    mockSchema = {
      validateAsync: jest.fn(),
    };
  });

  // =============================================================================
  // validateRequest()
  // =============================================================================

  describe('validateRequest()', () => {
    it('should validate request body successfully', async () => {
      const validatedData = { name: 'Test', age: 25 };
      mockSchema.validateAsync.mockResolvedValue(validatedData);
      mockRequest.body = { name: 'Test', age: 25, extra: 'field' };

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        mockRequest.body,
        { abortEarly: false, stripUnknown: true }
      );
      expect(mockRequest.body).toEqual(validatedData);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should replace request body with validated data', async () => {
      const validatedData = { email: 'test@example.com', password: 'hashed' };
      mockSchema.validateAsync.mockResolvedValue(validatedData);
      mockRequest.body = { email: 'test@example.com', password: 'plain', unknown: 'data' };

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockRequest.body).toEqual(validatedData);
      expect(mockRequest.body.unknown).toBeUndefined();
    });

    it('should return 400 on validation error', async () => {
      const validationError = {
        details: [
          { path: ['email'], message: '"email" is required' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [
          { field: 'email', message: '"email" is required' }
        ]
      });
    });

    it('should return all validation errors', async () => {
      const validationError = {
        details: [
          { path: ['email'], message: '"email" is required' },
          { path: ['password'], message: '"password" must be at least 8 characters' },
          { path: ['age'], message: '"age" must be a number' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: [
          { field: 'email', message: '"email" is required' },
          { field: 'password', message: '"password" must be at least 8 characters' },
          { field: 'age', message: '"age" must be a number' }
        ]
      }));
    });

    it('should handle nested field validation errors', async () => {
      const validationError = {
        details: [
          { path: ['user', 'address', 'city'], message: '"city" is required' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: [
          { field: 'user.address.city', message: '"city" is required' }
        ]
      }));
    });

    it('should handle error without details array', async () => {
      const validationError = { message: 'Generic error' };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: []
      }));
    });

    it('should use abortEarly: false option', async () => {
      mockSchema.validateAsync.mockResolvedValue({});

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ abortEarly: false })
      );
    });

    it('should use stripUnknown: true option', async () => {
      mockSchema.validateAsync.mockResolvedValue({});

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ stripUnknown: true })
      );
    });
  });

  // =============================================================================
  // validateParams()
  // =============================================================================

  describe('validateParams()', () => {
    it('should validate request params successfully', async () => {
      const validatedData = { id: '123', type: 'device' };
      mockSchema.validateAsync.mockResolvedValue(validatedData);
      mockRequest.params = { id: '123', type: 'device', extra: 'param' };

      const middleware = validationMiddleware.validateParams(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        mockRequest.params,
        { abortEarly: false, stripUnknown: true }
      );
      expect(mockRequest.params).toEqual(validatedData);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should replace request params with validated data', async () => {
      const validatedData = { ticketId: 'ticket-123' };
      mockSchema.validateAsync.mockResolvedValue(validatedData);
      mockRequest.params = { ticketId: 'ticket-123', unknown: 'value' };

      const middleware = validationMiddleware.validateParams(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockRequest.params).toEqual(validatedData);
      expect(mockRequest.params.unknown).toBeUndefined();
    });

    it('should return 400 on validation error', async () => {
      const validationError = {
        details: [
          { path: ['id'], message: '"id" must be a valid UUID' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateParams(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Parameter validation failed',
        details: [
          { field: 'id', message: '"id" must be a valid UUID' }
        ]
      });
    });

    it('should return all parameter validation errors', async () => {
      const validationError = {
        details: [
          { path: ['eventId'], message: '"eventId" is required' },
          { path: ['deviceId'], message: '"deviceId" must be a string' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateParams(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: [
          { field: 'eventId', message: '"eventId" is required' },
          { field: 'deviceId', message: '"deviceId" must be a string' }
        ]
      }));
    });

    it('should handle error without details array', async () => {
      const validationError = { message: 'Invalid params' };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateParams(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: []
      }));
    });

    it('should use abortEarly: false option', async () => {
      mockSchema.validateAsync.mockResolvedValue({});

      const middleware = validationMiddleware.validateParams(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ abortEarly: false })
      );
    });

    it('should use stripUnknown: true option', async () => {
      mockSchema.validateAsync.mockResolvedValue({});

      const middleware = validationMiddleware.validateParams(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ stripUnknown: true })
      );
    });
  });

  // =============================================================================
  // validateQuery()
  // =============================================================================

  describe('validateQuery()', () => {
    it('should validate request query successfully', async () => {
      const validatedData = { page: 1, limit: 10, sort: 'desc' };
      mockSchema.validateAsync.mockResolvedValue(validatedData);
      mockRequest.query = { page: '1', limit: '10', sort: 'desc', extra: 'param' };

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        mockRequest.query,
        { abortEarly: false, stripUnknown: true }
      );
      expect(mockRequest.query).toEqual(validatedData);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should replace request query with validated data', async () => {
      const validatedData = { status: 'active', tenantId: 'tenant-123' };
      mockSchema.validateAsync.mockResolvedValue(validatedData);
      mockRequest.query = { status: 'active', tenantId: 'tenant-123', unknown: 'field' };

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockRequest.query).toEqual(validatedData);
      expect(mockRequest.query.unknown).toBeUndefined();
    });

    it('should return 400 on validation error', async () => {
      const validationError = {
        details: [
          { path: ['limit'], message: '"limit" must be a positive number' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Query validation failed',
        details: [
          { field: 'limit', message: '"limit" must be a positive number' }
        ]
      });
    });

    it('should return all query validation errors', async () => {
      const validationError = {
        details: [
          { path: ['page'], message: '"page" must be greater than 0' },
          { path: ['limit'], message: '"limit" must be less than 100' },
          { path: ['sort'], message: '"sort" must be one of [asc, desc]' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: [
          { field: 'page', message: '"page" must be greater than 0' },
          { field: 'limit', message: '"limit" must be less than 100' },
          { field: 'sort', message: '"sort" must be one of [asc, desc]' }
        ]
      }));
    });

    it('should handle error without details array', async () => {
      const validationError = { message: 'Invalid query' };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: []
      }));
    });

    it('should use abortEarly: false option', async () => {
      mockSchema.validateAsync.mockResolvedValue({});

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ abortEarly: false })
      );
    });

    it('should use stripUnknown: true option', async () => {
      mockSchema.validateAsync.mockResolvedValue({});

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ stripUnknown: true })
      );
    });
  });

  // =============================================================================
  // Edge Cases and Integration
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty request body', async () => {
      mockSchema.validateAsync.mockResolvedValue({});
      mockRequest.body = {};

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockRequest.body).toEqual({});
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should handle null request body', async () => {
      mockSchema.validateAsync.mockResolvedValue({});
      mockRequest.body = null;

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockSchema.validateAsync).toHaveBeenCalledWith(null, expect.any(Object));
    });

    it('should handle validation error with empty path', async () => {
      const validationError = {
        details: [
          { path: [], message: 'Root level error' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: [
          { field: '', message: 'Root level error' }
        ]
      }));
    });

    it('should handle deeply nested paths', async () => {
      const validationError = {
        details: [
          { path: ['level1', 'level2', 'level3', 'level4'], message: 'Deep error' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateQuery(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: [
          { field: 'level1.level2.level3.level4', message: 'Deep error' }
        ]
      }));
    });

    it('should handle array index in path', async () => {
      const validationError = {
        details: [
          { path: ['items', '0', 'name'], message: 'Item name required' }
        ]
      };
      mockSchema.validateAsync.mockRejectedValue(validationError);

      const middleware = validationMiddleware.validateRequest(mockSchema);
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        details: [
          { field: 'items.0.name', message: 'Item name required' }
        ]
      }));
    });
  });
});
