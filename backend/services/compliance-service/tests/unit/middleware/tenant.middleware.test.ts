/**
 * Unit Tests for Tenant Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Tenant Middleware', () => {
  let tenantMiddleware: any;
  let requireTenantId: any;
  let getTenantId: any;
  let logger: any;

  let mockRequest: any;
  let mockReply: any;

  const validTenantId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  beforeEach(async () => {
    jest.clearAllMocks();

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/middleware/tenant.middleware');
    tenantMiddleware = module.tenantMiddleware;
    requireTenantId = module.requireTenantId;
    getTenantId = module.getTenantId;

    mockRequest = {
      method: 'GET',
      url: '/api/test',
      tenantId: undefined
    };

    mockReply = {
      code: jest.fn<(code: number) => any>().mockReturnThis(),
      send: jest.fn<(body: any) => any>().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tenantMiddleware', () => {
    it('should allow request with valid UUID tenant ID', async () => {
      mockRequest.tenantId = validTenantId;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(validTenantId)
      );
    });

    it('should reject request without tenant ID', async () => {
      mockRequest.tenantId = undefined;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Tenant context required'
      });
    });

    it('should reject request with null tenant ID', async () => {
      mockRequest.tenantId = null;

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized'
        })
      );
    });

    it('should reject request with empty string tenant ID', async () => {
      mockRequest.tenantId = '';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should reject request with invalid UUID format', async () => {
      mockRequest.tenantId = 'invalid-tenant-id';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid tenant ID format'
      });
    });

    it('should reject request with partial UUID', async () => {
      mockRequest.tenantId = 'a1b2c3d4-e5f6-7890';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid tenant ID format'
        })
      );
    });

    it('should reject request with UUID containing invalid characters', async () => {
      mockRequest.tenantId = 'g1b2c3d4-e5f6-7890-abcd-ef1234567890';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should accept uppercase UUID', async () => {
      mockRequest.tenantId = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should accept mixed case UUID', async () => {
      mockRequest.tenantId = 'A1b2C3d4-E5f6-7890-AbCd-Ef1234567890';

      await tenantMiddleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should log error when tenant ID is missing', async () => {
      mockRequest.tenantId = undefined;

      await tenantMiddleware(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Request missing tenant_id')
      );
    });

    it('should log error with request details when invalid format', async () => {
      mockRequest.tenantId = 'bad-format';
      mockRequest.method = 'POST';
      mockRequest.url = '/api/documents';

      await tenantMiddleware(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid tenant_id format')
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('POST')
      );
    });

    it('should log debug message on successful validation', async () => {
      mockRequest.tenantId = validTenantId;
      mockRequest.method = 'GET';
      mockRequest.url = '/api/users';

      await tenantMiddleware(mockRequest, mockReply);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Tenant context established')
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('GET')
      );
    });
  });

  describe('requireTenantId', () => {
    it('should return tenant ID when present', () => {
      mockRequest.tenantId = validTenantId;

      const result = requireTenantId(mockRequest);

      expect(result).toBe(validTenantId);
    });

    it('should throw error when tenant ID is missing', () => {
      mockRequest.tenantId = undefined;

      expect(() => requireTenantId(mockRequest)).toThrow(
        'Tenant ID is required but not found in request'
      );
    });

    it('should throw error when tenant ID is null', () => {
      mockRequest.tenantId = null;

      expect(() => requireTenantId(mockRequest)).toThrow();
    });

    it('should throw error when tenant ID is empty string', () => {
      mockRequest.tenantId = '';

      expect(() => requireTenantId(mockRequest)).toThrow();
    });
  });

  describe('getTenantId', () => {
    it('should return tenant ID when present', () => {
      mockRequest.tenantId = validTenantId;

      const result = getTenantId(mockRequest);

      expect(result).toBe(validTenantId);
    });

    it('should return undefined when tenant ID is missing', () => {
      mockRequest.tenantId = undefined;

      const result = getTenantId(mockRequest);

      expect(result).toBeUndefined();
    });

    it('should return null when tenant ID is null', () => {
      mockRequest.tenantId = null;

      const result = getTenantId(mockRequest);

      expect(result).toBeNull();
    });

    it('should return empty string when tenant ID is empty', () => {
      mockRequest.tenantId = '';

      const result = getTenantId(mockRequest);

      expect(result).toBe('');
    });
  });
});
