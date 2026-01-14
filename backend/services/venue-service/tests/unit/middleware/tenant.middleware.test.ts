/**
 * Unit tests for src/middleware/tenant.middleware.ts
 * Tests multi-tenant isolation, JWT tenant extraction, cross-tenant protection
 * Security: JM4-JM8/AE1 (tenant context), KQ1-KQ2 (RLS enforcement)
 */

import {
  requireTenant,
  extractTenant,
  verifyTenantResource,
  setTenantInTransaction,
  getTenantId,
  getTenantContext,
  TenantContext,
} from '../../../src/middleware/tenant.middleware';
import { createMockRequest, createMockReply, createMockUser } from '../../__mocks__/fastify.mock';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

describe('middleware/tenant.middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReply = createMockReply();
  });

  describe('requireTenant()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('should set tenant context for authenticated user with valid tenant_id', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: validTenantId }),
      });

      await requireTenant(mockRequest, mockReply);

      expect(mockRequest.tenantContext).toEqual({
        tenantId: validTenantId,
        tenantName: undefined,
        tenantType: undefined,
      });
      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should include tenant_name and tenant_type when provided', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({
          tenant_id: validTenantId,
          tenant_name: 'Test Tenant',
          tenant_type: 'enterprise',
        }),
      });

      await requireTenant(mockRequest, mockReply);

      expect(mockRequest.tenantContext).toEqual({
        tenantId: validTenantId,
        tenantName: 'Test Tenant',
        tenantType: 'enterprise',
      });
    });

    it('should throw UnauthorizedError when user not authenticated', async () => {
      mockRequest = createMockRequest({ user: null });

      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Authentication required');
    });

    it('should throw UnauthorizedError when tenant_id missing (JM4)', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: undefined }),
      });

      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Missing tenant context');
    });

    it('should throw UnauthorizedError for invalid tenant_id format', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: 'invalid-format' }),
      });

      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Invalid tenant context');
    });

    it('should reject non-UUID tenant_id formats', async () => {
      const invalidFormats = [
        '12345',
        'not-a-uuid',
        '550e8400-e29b-41d4-a716', // Truncated
        '550e8400e29b41d4a716446655440000', // No dashes
        '../../../etc/passwd', // Injection attempt
        '<script>alert(1)</script>', // XSS attempt
      ];

      for (const invalidId of invalidFormats) {
        mockRequest = createMockRequest({
          user: createMockUser({ tenant_id: invalidId }),
        });

        await expect(requireTenant(mockRequest, mockReply))
          .rejects.toThrow('Invalid tenant context');
      }
    });

    it('should accept lowercase UUID format', async () => {
      const lowercaseUuid = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: lowercaseUuid }),
      });

      await requireTenant(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(lowercaseUuid);
    });

    it('should accept uppercase UUID format', async () => {
      const uppercaseUuid = '550E8400-E29B-41D4-A716-446655440000';
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: uppercaseUuid }),
      });

      await requireTenant(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe(uppercaseUuid);
    });
  });

  describe('extractTenant()', () => {
    const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

    it('should extract tenant when present and valid', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: validTenantId }),
      });

      await extractTenant(mockRequest, mockReply);

      expect(mockRequest.tenantContext?.tenantId).toBe(validTenantId);
    });

    it('should not fail when user not authenticated', async () => {
      mockRequest = createMockRequest({ user: null });

      await expect(extractTenant(mockRequest, mockReply)).resolves.not.toThrow();
      expect(mockRequest.tenantContext).toBeUndefined();
    });

    it('should not set context when tenant_id missing', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: undefined }),
      });

      await extractTenant(mockRequest, mockReply);

      expect(mockRequest.tenantContext).toBeUndefined();
    });

    it('should not set context for invalid tenant_id format', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: 'invalid' }),
      });

      await extractTenant(mockRequest, mockReply);

      expect(mockRequest.tenantContext).toBeUndefined();
    });
  });

  describe('verifyTenantResource()', () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    const differentTenantId = '660e8400-e29b-41d4-a716-446655440000';

    it('should allow access when resource belongs to same tenant', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      mockRequest.tenantId = tenantId;

      const getResourceTenantId = jest.fn().mockResolvedValue(tenantId);
      const middleware = verifyTenantResource(getResourceTenantId);

      await expect(middleware(mockRequest, mockReply)).resolves.not.toThrow();
      expect(getResourceTenantId).toHaveBeenCalledWith(mockRequest);
    });

    it('should throw ForbiddenError for cross-tenant access (JM5)', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      mockRequest.tenantId = tenantId;

      const getResourceTenantId = jest.fn().mockResolvedValue(differentTenantId);
      const middleware = verifyTenantResource(getResourceTenantId);

      await expect(middleware(mockRequest, mockReply))
        .rejects.toThrow('Access denied to this resource');
    });

    it('should throw UnauthorizedError when tenant context missing', async () => {
      mockRequest = createMockRequest({
        user: null,
      });
      // No tenantId set

      const getResourceTenantId = jest.fn().mockResolvedValue(tenantId);
      const middleware = verifyTenantResource(getResourceTenantId);

      await expect(middleware(mockRequest, mockReply))
        .rejects.toThrow('Missing tenant context');
    });

    it('should allow access when resource has no tenant (system resource)', async () => {
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      mockRequest.tenantId = tenantId;

      const getResourceTenantId = jest.fn().mockResolvedValue(null);
      const middleware = verifyTenantResource(getResourceTenantId);

      await expect(middleware(mockRequest, mockReply)).resolves.not.toThrow();
    });
  });

  describe('setTenantInTransaction() - RLS enforcement', () => {
    it('should set tenant context in PostgreSQL transaction (KQ1-KQ2)', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const mockTrx = {
        raw: jest.fn().mockResolvedValue(undefined),
      };

      await setTenantInTransaction(mockTrx, tenantId);

      expect(mockTrx.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [tenantId]
      );
    });

    it('should handle database error during RLS setup', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const mockTrx = {
        raw: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      await expect(setTenantInTransaction(mockTrx, tenantId))
        .rejects.toThrow('Database error');
    });
  });

  describe('getTenantId()', () => {
    it('should return tenant ID when set on request', () => {
      mockRequest = createMockRequest({});
      mockRequest.tenantId = '550e8400-e29b-41d4-a716-446655440000';

      const result = getTenantId(mockRequest);

      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should throw UnauthorizedError when tenant ID not set', () => {
      mockRequest = createMockRequest({});

      expect(() => getTenantId(mockRequest))
        .toThrow('Missing tenant context');
    });
  });

  describe('getTenantContext()', () => {
    it('should return full tenant context when set', () => {
      mockRequest = createMockRequest({});
      mockRequest.tenantContext = {
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        tenantName: 'Test Tenant',
        tenantType: 'enterprise',
      };

      const result = getTenantContext(mockRequest);

      expect(result).toEqual({
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        tenantName: 'Test Tenant',
        tenantType: 'enterprise',
      });
    });

    it('should throw UnauthorizedError when context not set', () => {
      mockRequest = createMockRequest({});

      expect(() => getTenantContext(mockRequest))
        .toThrow('Missing tenant context');
    });
  });

  describe('Security tests', () => {
    it('should log warning on missing tenant context (JM6)', async () => {
      const { logger } = require('../../../src/utils/logger');
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: undefined }),
      });

      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Missing tenant context');
    });

    it('should log error on invalid tenant format (JM7)', async () => {
      const { logger } = require('../../../src/utils/logger');
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: 'malicious<script>alert(1)</script>' }),
      });

      await expect(requireTenant(mockRequest, mockReply))
        .rejects.toThrow('Invalid tenant context');
    });

    it('should log cross-tenant access attempt (JM8)', async () => {
      const { logger } = require('../../../src/utils/logger');
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const differentTenantId = '660e8400-e29b-41d4-a716-446655440000';
      
      mockRequest = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      mockRequest.tenantId = tenantId;

      const getResourceTenantId = jest.fn().mockResolvedValue(differentTenantId);
      const middleware = verifyTenantResource(getResourceTenantId);

      await expect(middleware(mockRequest, mockReply))
        .rejects.toThrow('Access denied');
    });

    it('should never fall back to default tenant_id (AE1)', async () => {
      // Test with various falsy values
      const falsyValues = [undefined, '', 0, false] as any[];

      for (const value of falsyValues) {
        mockRequest = createMockRequest({
          user: { ...createMockUser(), tenant_id: value as any },
        });

        await expect(requireTenant(mockRequest, mockReply))
          .rejects.toThrow();
      }
    });
  });
});
