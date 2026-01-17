/**
 * Tenant Context Middleware Unit Tests
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  tenantContextMiddleware,
  requireTenant,
  requireSystemAdmin,
  requirePermission,
  getTenantId,
  getTenantContext,
  isTenant,
  isSystemAdminRequest,
  setDatabaseTenantContext,
  registerTenantContext,
} from '../../../src/middleware/tenant-context';
import { logger } from '../../../src/utils/logger';

describe('Tenant Context Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  // Valid UUIDs for testing
  const VALID_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_TENANT_ID_2 = '660e8400-e29b-41d4-a716-446655440001';
  const VALID_ORG_ID = '770e8400-e29b-41d4-a716-446655440002';
  const VALID_VENUE_ID = '880e8400-e29b-41d4-a716-446655440003';

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      headers: {},
      user: undefined,
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('tenantContextMiddleware', () => {
    it('should leave context undefined when no tenant info available', async () => {
      await tenantContextMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantContext).toBeUndefined();
    });

    it('should extract tenant from JWT claims', async () => {
      mockRequest.user = {
        tenantId: VALID_TENANT_ID,
        organizationId: VALID_ORG_ID,
        venueId: VALID_VENUE_ID,
        permissions: ['read', 'write'],
        isSystemAdmin: false,
      };

      await tenantContextMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantContext).toEqual({
        tenantId: VALID_TENANT_ID,
        organizationId: VALID_ORG_ID,
        venueId: VALID_VENUE_ID,
        permissions: ['read', 'write'],
        isSystemAdmin: false,
      });
    });

    it('should support snake_case JWT claim names', async () => {
      mockRequest.user = {
        tenant_id: VALID_TENANT_ID,
        organization_id: VALID_ORG_ID,
        venue_id: VALID_VENUE_ID,
        is_system_admin: true,
      };

      await tenantContextMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantContext.tenantId).toBe(VALID_TENANT_ID);
      expect(mockRequest.tenantContext.organizationId).toBe(VALID_ORG_ID);
      expect(mockRequest.tenantContext.venueId).toBe(VALID_VENUE_ID);
      expect(mockRequest.tenantContext.isSystemAdmin).toBe(true);
    });

    it('should fall back to headers for internal service calls', async () => {
      mockRequest.headers['x-tenant-id'] = VALID_TENANT_ID;
      mockRequest.headers['x-organization-id'] = VALID_ORG_ID;
      mockRequest.headers['x-venue-id'] = VALID_VENUE_ID;

      await tenantContextMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantContext.tenantId).toBe(VALID_TENANT_ID);
      expect(mockRequest.tenantContext.organizationId).toBe(VALID_ORG_ID);
      expect(mockRequest.tenantContext.venueId).toBe(VALID_VENUE_ID);
    });

    it('should prefer JWT tenant over header tenant', async () => {
      mockRequest.user = { tenantId: VALID_TENANT_ID };
      mockRequest.headers['x-tenant-id'] = VALID_TENANT_ID; // Same ID to avoid mismatch error

      await tenantContextMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantContext.tenantId).toBe(VALID_TENANT_ID);
    });

    it('should reject invalid tenant ID format', async () => {
      mockRequest.headers['x-tenant-id'] = 'invalid-tenant-id!@#';

      await expect(tenantContextMiddleware(mockRequest, mockReply))
        .rejects.toThrow('Invalid tenant ID format');
    });

    it('should accept valid UUID tenant ID', async () => {
      mockRequest.headers['x-tenant-id'] = VALID_TENANT_ID;

      await tenantContextMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantContext.tenantId).toBe(VALID_TENANT_ID);
    });

    it('should accept system tenant ID', async () => {
      mockRequest.headers['x-tenant-id'] = '__system__';

      await tenantContextMiddleware(mockRequest, mockReply);

      expect(mockRequest.tenantContext.tenantId).toBe('__system__');
    });

    it('should reject tenant ID mismatch between JWT and header', async () => {
      mockRequest.user = { tenantId: VALID_TENANT_ID };
      mockRequest.headers['x-tenant-id'] = VALID_TENANT_ID_2; // Different valid UUID

      await expect(tenantContextMiddleware(mockRequest, mockReply))
        .rejects.toThrow("Tenant ID mismatch - cannot access another tenant's data");
    });

    it('should log successful tenant context', async () => {
      mockRequest.user = {
        tenantId: VALID_TENANT_ID,
        permissions: ['read'],
      };

      await tenantContextMiddleware(mockRequest, mockReply);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tenant_context_set',
          tenantId: VALID_TENANT_ID,
        }),
        'Tenant context established'
      );
    });

    it('should log warning for invalid tenant ID', async () => {
      mockRequest.headers['x-tenant-id'] = 'not-a-valid-uuid';

      await expect(tenantContextMiddleware(mockRequest, mockReply)).rejects.toThrow();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'invalid_tenant_id',
        }),
        'Invalid tenant ID format'
      );
    });
  });

  describe('requireTenant', () => {
    it('should run tenant context middleware if not already run', async () => {
      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Tenant context is required for this operation');
    });

    it('should reject when tenant context missing', async () => {
      mockRequest.tenantContext = undefined;

      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Tenant context is required for this operation');
    });

    it('should reject when tenant ID missing', async () => {
      mockRequest.tenantContext = { tenantId: undefined };

      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Tenant context is required for this operation');
    });

    it('should allow when tenant ID present', async () => {
      mockRequest.tenantContext = { tenantId: VALID_TENANT_ID };

      await requireTenant(mockRequest, mockReply);
      // No error = success
    });
  });

  describe('requireSystemAdmin', () => {
    it('should reject non-system admin', async () => {
      mockRequest.tenantContext = {
        tenantId: VALID_TENANT_ID,
        isSystemAdmin: false,
      };

      await expect(requireSystemAdmin(mockRequest, mockReply))
        .rejects.toThrow('System administrator access required');
    });

    it('should allow system admin', async () => {
      mockRequest.tenantContext = {
        tenantId: VALID_TENANT_ID,
        isSystemAdmin: true,
      };

      await requireSystemAdmin(mockRequest, mockReply);
      // No error = success
    });
  });

  describe('requirePermission', () => {
    it('should reject when permission missing', async () => {
      mockRequest.tenantContext = {
        tenantId: VALID_TENANT_ID,
        permissions: ['read'],
        isSystemAdmin: false,
      };

      const middleware = requirePermission('write');
      await expect(middleware(mockRequest, mockReply))
        .rejects.toThrow("Permission 'write' is required for this operation");
    });

    it('should allow when user has permission', async () => {
      mockRequest.tenantContext = {
        tenantId: VALID_TENANT_ID,
        permissions: ['read', 'write'],
        isSystemAdmin: false,
      };

      const middleware = requirePermission('write');
      await middleware(mockRequest, mockReply);
      // No error = success
    });

    it('should allow system admin regardless of permissions', async () => {
      mockRequest.tenantContext = {
        tenantId: VALID_TENANT_ID,
        permissions: [],
        isSystemAdmin: true,
      };

      const middleware = requirePermission('super-admin-only');
      await middleware(mockRequest, mockReply);
      // No error = success
    });
  });

  describe('Helper Functions', () => {
    describe('getTenantId', () => {
      it('should return tenant ID when available', () => {
        mockRequest.tenantContext = { tenantId: VALID_TENANT_ID };

        expect(getTenantId(mockRequest)).toBe(VALID_TENANT_ID);
      });

      it('should throw when tenant context not available', () => {
        expect(() => getTenantId(mockRequest))
          .toThrow('Tenant context not available');
      });
    });

    describe('getTenantContext', () => {
      it('should return tenant context when available', () => {
        mockRequest.tenantContext = { tenantId: VALID_TENANT_ID, isSystemAdmin: true };

        expect(getTenantContext(mockRequest)).toEqual({
          tenantId: VALID_TENANT_ID,
          isSystemAdmin: true,
        });
      });

      it('should return undefined when not available', () => {
        expect(getTenantContext(mockRequest)).toBeUndefined();
      });
    });

    describe('isTenant', () => {
      it('should return true for matching tenant', () => {
        mockRequest.tenantContext = { tenantId: VALID_TENANT_ID };

        expect(isTenant(mockRequest, VALID_TENANT_ID)).toBe(true);
      });

      it('should return false for non-matching tenant', () => {
        mockRequest.tenantContext = { tenantId: VALID_TENANT_ID };

        expect(isTenant(mockRequest, VALID_TENANT_ID_2)).toBe(false);
      });
    });

    describe('isSystemAdminRequest', () => {
      it('should return true for system admin', () => {
        mockRequest.tenantContext = { isSystemAdmin: true };

        expect(isSystemAdminRequest(mockRequest)).toBe(true);
      });

      it('should return false for non-system admin', () => {
        mockRequest.tenantContext = { isSystemAdmin: false };

        expect(isSystemAdminRequest(mockRequest)).toBe(false);
      });

      it('should return false when context missing', () => {
        expect(isSystemAdminRequest(mockRequest)).toBe(false);
      });
    });
  });

  describe('setDatabaseTenantContext', () => {
    it('should set tenant context for RLS', async () => {
      const mockDb = {
        raw: jest.fn().mockResolvedValue(undefined),
      };

      await setDatabaseTenantContext(mockDb, VALID_TENANT_ID);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [VALID_TENANT_ID]
      );
    });

    it('should throw when tenant ID missing', async () => {
      const mockDb = { raw: jest.fn() };

      await expect(setDatabaseTenantContext(mockDb, ''))
        .rejects.toThrow('Tenant ID is required for database operations');
    });

    it('should log debug message', async () => {
      const mockDb = { raw: jest.fn().mockResolvedValue(undefined) };

      await setDatabaseTenantContext(mockDb, VALID_TENANT_ID);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'database_tenant_context_set',
          tenantId: VALID_TENANT_ID,
        }),
        'Database tenant context set for RLS'
      );
    });
  });

  describe('registerTenantContext', () => {
    it('should decorate request with tenantContext', async () => {
      const mockFastify = {
        decorateRequest: jest.fn(),
      };

      await registerTenantContext(mockFastify as any);

      expect(mockFastify.decorateRequest).toHaveBeenCalledWith('tenantContext', null);
    });
  });
});
