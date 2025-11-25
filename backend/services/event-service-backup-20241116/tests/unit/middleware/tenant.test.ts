import { tenantHook, optionalTenantHook } from '../../../src/middleware/tenant';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('Tenant Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockDone: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      log: {
        error: jest.fn(),
        debug: jest.fn(),
      },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    mockDone = jest.fn();
  });

  describe('tenantHook', () => {
    it('should extract tenant_id from user', () => {
      mockRequest.user = {
        id: 'user-123',
        tenant_id: 'tenant-456',
      };

      tenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(mockDone).toHaveBeenCalled();
    });

    it('should return 401 if no user', () => {
      mockRequest.user = undefined;

      tenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    });

    it('should return 400 if no tenant_id in user', () => {
      mockRequest.user = {
        id: 'user-123',
      };

      tenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Tenant ID not found in authentication token',
        code: 'MISSING_TENANT_ID',
      });
    });

    it('should handle errors gracefully', () => {
      mockRequest.user = { tenant_id: 'tenant-123' };
      mockRequest.log.debug.mockImplementation(() => {
        throw new Error('Test error');
      });

      tenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockDone).toHaveBeenCalled();
    });
  });

  describe('optionalTenantHook', () => {
    it('should use user tenant_id if available', () => {
      mockRequest.user = {
        tenant_id: 'user-tenant-123',
      };

      optionalTenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockRequest.tenantId).toBe('user-tenant-123');
      expect(mockDone).toHaveBeenCalled();
    });

    it('should use default tenant if no user', () => {
      mockRequest.user = undefined;
      process.env.DEFAULT_TENANT_ID = 'default-tenant';

      optionalTenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockRequest.tenantId).toBe('default-tenant');
      expect(mockDone).toHaveBeenCalled();
    });

    it('should use fallback default tenant', () => {
      mockRequest.user = null;
      delete process.env.DEFAULT_TENANT_ID;

      optionalTenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockRequest.tenantId).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('should handle errors gracefully', () => {
      mockRequest.log.debug.mockImplementation(() => {
        throw new Error('Test error');
      });

      optionalTenantHook(mockRequest as FastifyRequest, mockReply as FastifyReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});
