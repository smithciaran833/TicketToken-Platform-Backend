/**
 * Unit Tests for Tenant Context Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  tenantContextMiddleware,
  requireTenant,
  requireSystemAdmin,
  requirePermission,
  getTenantId,
  getUserId,
  getTenantContext,
  isTenant,
  isSystemAdminRequest,
  getTenantStorageKey,
  extractTenantFromStorageKey,
} from '../../../src/middleware/tenant-context';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/errors', () => ({
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string, public code: string, public details?: any) {
      super(message);
      this.name = 'ForbiddenError';
    }
  },
  TenantMismatchError: class TenantMismatchError extends Error {
    constructor() {
      super('Tenant ID mismatch');
      this.name = 'TenantMismatchError';
    }
  },
  TenantRequiredError: class TenantRequiredError extends Error {
    constructor(message?: string) {
      super(message || 'Tenant ID is required');
      this.name = 'TenantRequiredError';
    }
  },
}));

// Valid test UUIDs
const TEST_TENANT_ID = '11111111-1111-4111-a111-111111111111';
const TEST_TENANT_ID_2 = '22222222-2222-4222-a222-222222222222';
const TEST_ORG_ID = '33333333-3333-4333-a333-333333333333';
const TEST_USER_ID = '44444444-4444-4444-a444-444444444444';

describe('middleware/tenant-context', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      headers: {},
      tenantContext: undefined,
    };

    mockReply = {} as FastifyReply;
  });

  describe('tenantContextMiddleware', () => {
    it('should extract tenant context from JWT user', async () => {
      (mockRequest as any).user = {
        id: TEST_USER_ID,
        tenant_id: TEST_TENANT_ID,
        organization_id: TEST_ORG_ID,
        permissions: ['read', 'write'],
      };

      await tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext).toEqual({
        tenantId: TEST_TENANT_ID,
        organizationId: TEST_ORG_ID,
        venueId: undefined,
        userId: TEST_USER_ID,
        permissions: ['read', 'write'],
        isSystemAdmin: false,
      });
    });

    it('should support camelCase tenant ID field', async () => {
      (mockRequest as any).user = {
        id: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      };

      await tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext?.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should extract tenant from headers when no JWT user', async () => {
      mockRequest.headers = {
        'x-tenant-id': TEST_TENANT_ID,
        'x-organization-id': TEST_ORG_ID,
      };

      await tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext).toEqual({
        tenantId: TEST_TENANT_ID,
        organizationId: TEST_ORG_ID,
        venueId: undefined,
        userId: undefined,
        permissions: [],
        isSystemAdmin: false,
      });
    });

    it('should prioritize JWT tenant over header tenant', async () => {
      (mockRequest as any).user = {
        tenant_id: TEST_TENANT_ID,
      };

      mockRequest.headers = {
        'x-tenant-id': TEST_TENANT_ID,
      };

      await tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext?.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should throw TenantMismatchError when JWT and header tenants differ', async () => {
      (mockRequest as any).user = {
        tenant_id: TEST_TENANT_ID,
      };

      mockRequest.headers = {
        'x-tenant-id': TEST_TENANT_ID_2,
      };

      await expect(
        tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Tenant ID mismatch');
    });

    it('should validate tenant ID format', async () => {
      (mockRequest as any).user = {
        tenant_id: 'invalid-format',
      };

      await expect(
        tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('should accept valid UUID v4 tenant ID', async () => {
      const validUUID = '123e4567-e89b-42d3-a456-426614174000';
      (mockRequest as any).user = {
        tenant_id: validUUID,
      };

      await expect(
        tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();

      expect(mockRequest.tenantContext?.tenantId).toBe(validUUID);
    });

    it('should accept system tenant ID', async () => {
      (mockRequest as any).user = {
        tenant_id: '__system__',
        is_system_admin: true,
      };

      await expect(
        tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();

      expect(mockRequest.tenantContext?.tenantId).toBe('__system__');
    });

    it('should set isSystemAdmin flag', async () => {
      (mockRequest as any).user = {
        tenant_id: TEST_TENANT_ID,
        is_system_admin: true,
      };

      await tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext?.isSystemAdmin).toBe(true);
    });

    it('should support isSystemAdmin camelCase', async () => {
      (mockRequest as any).user = {
        tenant_id: TEST_TENANT_ID,
        isSystemAdmin: true,
      };

      await tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext?.isSystemAdmin).toBe(true);
    });

    it('should leave context undefined when no tenant found', async () => {
      await tenantContextMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantContext).toBeUndefined();
    });
  });

  describe('requireTenant', () => {
    it('should pass when tenant context is set', async () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      await expect(
        requireTenant(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should throw TenantRequiredError when no tenant context', async () => {
      await expect(
        requireTenant(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Tenant ID is required');
    });

    it('should run middleware if context not set', async () => {
      (mockRequest as any).user = {
        tenant_id: TEST_TENANT_ID,
      };

      await expect(
        requireTenant(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();

      expect(mockRequest.tenantContext?.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe('requireSystemAdmin', () => {
    it('should pass when user is system admin', async () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: [],
        isSystemAdmin: true,
      };

      await expect(
        requireSystemAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should throw ForbiddenError when user is not system admin', async () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      await expect(
        requireSystemAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('System administrator access required');
    });

    it('should throw when no tenant context', async () => {
      await expect(
        requireSystemAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow();
    });
  });

  describe('requirePermission', () => {
    it('should pass when user has the permission', async () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: ['file:read', 'file:write'],
        isSystemAdmin: false,
      };

      const middleware = requirePermission('file:read');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should throw when user lacks permission', async () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: ['file:read'],
        isSystemAdmin: false,
      };

      const middleware = requirePermission('file:delete');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow("Permission 'file:delete' is required");
    });

    it('should pass for system admins regardless of permissions', async () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: [],
        isSystemAdmin: true,
      };

      const middleware = requirePermission('file:delete');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).resolves.not.toThrow();
    });

    it('should throw when no tenant context', async () => {
      const middleware = requirePermission('file:read');
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow();
    });
  });

  describe('getTenantId', () => {
    it('should return tenant ID from context', () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      const result = getTenantId(mockRequest as FastifyRequest);
      expect(result).toBe(TEST_TENANT_ID);
    });

    it('should throw TenantRequiredError when no context', () => {
      expect(() => getTenantId(mockRequest as FastifyRequest)).toThrow('Tenant ID is required');
    });
  });

  describe('getUserId', () => {
    it('should return user ID from context', () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      const result = getUserId(mockRequest as FastifyRequest);
      expect(result).toBe(TEST_USER_ID);
    });

    it('should return undefined when no user ID', () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      const result = getUserId(mockRequest as FastifyRequest);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no context', () => {
      const result = getUserId(mockRequest as FastifyRequest);
      expect(result).toBeUndefined();
    });
  });

  describe('getTenantContext', () => {
    it('should return tenant context', () => {
      const context = {
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        permissions: ['read'],
        isSystemAdmin: false,
      };
      mockRequest.tenantContext = context;

      const result = getTenantContext(mockRequest as FastifyRequest);
      expect(result).toEqual(context);
    });

    it('should return undefined when no context', () => {
      const result = getTenantContext(mockRequest as FastifyRequest);
      expect(result).toBeUndefined();
    });
  });

  describe('isTenant', () => {
    it('should return true when tenant IDs match', () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      const result = isTenant(mockRequest as FastifyRequest, TEST_TENANT_ID);
      expect(result).toBe(true);
    });

    it('should return false when tenant IDs do not match', () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      const result = isTenant(mockRequest as FastifyRequest, TEST_TENANT_ID_2);
      expect(result).toBe(false);
    });

    it('should return false when no context', () => {
      const result = isTenant(mockRequest as FastifyRequest, TEST_TENANT_ID);
      expect(result).toBe(false);
    });
  });

  describe('isSystemAdminRequest', () => {
    it('should return true when user is system admin', () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        permissions: [],
        isSystemAdmin: true,
      };

      const result = isSystemAdminRequest(mockRequest as FastifyRequest);
      expect(result).toBe(true);
    });

    it('should return false when user is not system admin', () => {
      mockRequest.tenantContext = {
        tenantId: TEST_TENANT_ID,
        permissions: [],
        isSystemAdmin: false,
      };

      const result = isSystemAdminRequest(mockRequest as FastifyRequest);
      expect(result).toBe(false);
    });

    it('should return false when no context', () => {
      const result = isSystemAdminRequest(mockRequest as FastifyRequest);
      expect(result).toBe(false);
    });
  });

  describe('getTenantStorageKey', () => {
    it('should generate tenant-prefixed storage key', () => {
      const result = getTenantStorageKey(TEST_TENANT_ID, 'files/image.jpg');
      expect(result).toBe(`tenants/${TEST_TENANT_ID}/files/image.jpg`);
    });

    it('should handle leading slash in key', () => {
      const result = getTenantStorageKey(TEST_TENANT_ID, '/files/image.jpg');
      expect(result).toBe(`tenants/${TEST_TENANT_ID}/files/image.jpg`);
    });

    it('should throw when tenant ID is missing', () => {
      expect(() => getTenantStorageKey('', 'files/image.jpg')).toThrow('Tenant ID is required');
    });
  });

  describe('extractTenantFromStorageKey', () => {
    it('should extract tenant ID from storage key', () => {
      const result = extractTenantFromStorageKey(`tenants/${TEST_TENANT_ID}/files/image.jpg`);
      expect(result).toBe(TEST_TENANT_ID);
    });

    it('should return null for invalid key format', () => {
      const result = extractTenantFromStorageKey('invalid/key/format');
      expect(result).toBeNull();
    });

    it('should return null for empty key', () => {
      const result = extractTenantFromStorageKey('');
      expect(result).toBeNull();
    });
  });
});
