import {
  validateTenant,
  validateResourceTenant,
  addTenantFilter,
  TenantIsolationError
} from '../../src/middleware/tenant.middleware';

/**
 * INTEGRATION TESTS FOR TENANT MIDDLEWARE
 * 
 * These tests verify tenant isolation functionality:
 * - Tenant validation middleware
 * - Resource tenant matching
 * - Query filter helpers
 * - TenantIsolationError class
 * - No mocks (tests actual middleware logic)
 */

describe('Tenant Middleware Integration Tests', () => {
  describe('validateTenant()', () => {
    it('should return 401 when request.user is undefined', async () => {
      const request: any = {
        log: {
          error: jest.fn(),
          debug: jest.fn()
        }
      };
      const reply: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await validateTenant(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    });

    it('should return 403 when user.tenant_id is null', async () => {
      const request: any = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: null
        },
        log: {
          error: jest.fn(),
          debug: jest.fn()
        }
      };
      const reply: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await validateTenant(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid tenant context',
        code: 'MISSING_TENANT_ID'
      });
    });

    it('should return 403 when user.tenant_id is undefined', async () => {
      const request: any = {
        user: {
          id: 'user-123',
          email: 'test@example.com'
        },
        log: {
          error: jest.fn(),
          debug: jest.fn()
        }
      };
      const reply: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await validateTenant(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid tenant context',
        code: 'MISSING_TENANT_ID'
      });
    });

    it('should log error when tenant_id is missing', async () => {
      const request: any = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: null
        },
        log: {
          error: jest.fn(),
          debug: jest.fn()
        }
      };
      const reply: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await validateTenant(request, reply);

      expect(request.log.error).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          email: 'test@example.com'
        },
        'User missing tenant_id in JWT'
      );
    });

    it('should log debug when validation passes', async () => {
      const request: any = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: 'tenant-456'
        },
        log: {
          error: jest.fn(),
          debug: jest.fn()
        }
      };
      const reply: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await validateTenant(request, reply);

      expect(request.log.debug).toHaveBeenCalledWith(
        {
          userId: 'user-123',
          tenantId: 'tenant-456'
        },
        'Tenant validation passed'
      );
    });

    it('should not send reply when validation passes', async () => {
      const request: any = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: 'tenant-456'
        },
        log: {
          error: jest.fn(),
          debug: jest.fn()
        }
      };
      const reply: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await validateTenant(request, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should allow request to proceed silently when tenant is valid', async () => {
      const request: any = {
        user: {
          id: 'user-789',
          email: 'valid@example.com',
          tenant_id: 'tenant-valid'
        },
        log: {
          error: jest.fn(),
          debug: jest.fn()
        }
      };
      const reply: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      const result = await validateTenant(request, reply);

      expect(result).toBeUndefined();
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('validateResourceTenant()', () => {
    it('should return true when tenant IDs match', () => {
      const userTenantId = 'tenant-123';
      const resourceTenantId = 'tenant-123';

      const result = validateResourceTenant(userTenantId, resourceTenantId);

      expect(result).toBe(true);
    });

    it('should return false when tenant IDs differ', () => {
      const userTenantId = 'tenant-123';
      const resourceTenantId = 'tenant-456';

      const result = validateResourceTenant(userTenantId, resourceTenantId);

      expect(result).toBe(false);
    });

    it('should be case-sensitive', () => {
      const userTenantId = 'Tenant-123';
      const resourceTenantId = 'tenant-123';

      const result = validateResourceTenant(userTenantId, resourceTenantId);

      expect(result).toBe(false);
    });

    it('should handle UUIDs correctly', () => {
      const userTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const resourceTenantId = '550e8400-e29b-41d4-a716-446655440000';

      const result = validateResourceTenant(userTenantId, resourceTenantId);

      expect(result).toBe(true);
    });

    it('should reject different UUIDs', () => {
      const userTenantId = '550e8400-e29b-41d4-a716-446655440000';
      const resourceTenantId = '550e8400-e29b-41d4-a716-446655440001';

      const result = validateResourceTenant(userTenantId, resourceTenantId);

      expect(result).toBe(false);
    });
  });

  describe('addTenantFilter()', () => {
    it('should return object with tenant_id property', () => {
      const tenantId = 'tenant-123';

      const filter = addTenantFilter(tenantId);

      expect(filter).toEqual({ tenant_id: 'tenant-123' });
    });

    it('should work with UUID tenant IDs', () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';

      const filter = addTenantFilter(tenantId);

      expect(filter).toEqual({ tenant_id: '550e8400-e29b-41d4-a716-446655440000' });
    });

    it('should return new object each time', () => {
      const tenantId = 'tenant-123';

      const filter1 = addTenantFilter(tenantId);
      const filter2 = addTenantFilter(tenantId);

      expect(filter1).not.toBe(filter2);
      expect(filter1).toEqual(filter2);
    });

    it('should be usable in database queries', () => {
      const tenantId = 'tenant-456';
      const filter = addTenantFilter(tenantId);

      // Simulate query usage
      const mockQuery = { where: jest.fn() };
      mockQuery.where(filter);

      expect(mockQuery.where).toHaveBeenCalledWith({ tenant_id: 'tenant-456' });
    });
  });

  describe('TenantIsolationError', () => {
    it('should have statusCode 403', () => {
      const error = new TenantIsolationError();

      expect(error.statusCode).toBe(403);
    });

    it('should have code TENANT_ISOLATION_VIOLATION', () => {
      const error = new TenantIsolationError();

      expect(error.code).toBe('TENANT_ISOLATION_VIOLATION');
    });

    it('should use default message when none provided', () => {
      const error = new TenantIsolationError();

      expect(error.message).toBe('Cross-tenant access denied');
    });

    it('should use custom message when provided', () => {
      const error = new TenantIsolationError('Custom isolation error');

      expect(error.message).toBe('Custom isolation error');
    });

    it('should have name TenantIsolationError', () => {
      const error = new TenantIsolationError();

      expect(error.name).toBe('TenantIsolationError');
    });

    it('should be instanceof Error', () => {
      const error = new TenantIsolationError();

      expect(error).toBeInstanceOf(Error);
    });

    it('should be instanceof TenantIsolationError', () => {
      const error = new TenantIsolationError();

      expect(error).toBeInstanceOf(TenantIsolationError);
    });

    it('should have stack trace', () => {
      const error = new TenantIsolationError();

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TenantIsolationError');
    });
  });

  describe('Cross-tenant protection scenarios', () => {
    it('should prevent user from different tenant accessing resource', () => {
      const userTenantId = 'tenant-user';
      const resourceTenantId = 'tenant-other';

      const canAccess = validateResourceTenant(userTenantId, resourceTenantId);

      expect(canAccess).toBe(false);
    });

    it('should allow user from same tenant accessing resource', () => {
      const userTenantId = 'tenant-shared';
      const resourceTenantId = 'tenant-shared';

      const canAccess = validateResourceTenant(userTenantId, resourceTenantId);

      expect(canAccess).toBe(true);
    });

    it('should create proper filter for multi-tenant queries', () => {
      const tenantId = 'tenant-multi';
      const filter = addTenantFilter(tenantId);

      // Simulate usage in a query
      const whereClause = {
        ...filter,
        status: 'active'
      };

      expect(whereClause).toEqual({
        tenant_id: 'tenant-multi',
        status: 'active'
      });
    });
  });
});
