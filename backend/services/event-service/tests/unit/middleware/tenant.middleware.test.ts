/**
 * Unit tests for tenant middleware
 * 
 * Tests:
 * - Tenant context extraction from JWT (tenantHook)
 * - Tenant validation against database
 * - RLS context setting
 * - Transaction context helpers (setTenantContext, withTenantContext)
 * - Optional tenant hook for public endpoints
 * - Strict tenant hook without DB validation
 */

import { createMockRequest, createMockReply, createMockUser } from '../../__mocks__/fastify.mock';

// Mock database
const mockDb = jest.fn() as jest.Mock & {
  raw: jest.Mock;
  transaction: jest.Mock;
};
mockDb.raw = jest.fn();
mockDb.transaction = jest.fn();

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

jest.mock('../../../src/schemas/common.schema', () => ({
  isValidUuid: jest.fn(),
}));

import { isValidUuid } from '../../../src/schemas/common.schema';
import {
  tenantHook,
  setTenantContext,
  withTenantContext,
  optionalTenantHook,
  strictTenantHook,
} from '../../../src/middleware/tenant';

const mockIsValidUuid = isValidUuid as jest.MockedFunction<typeof isValidUuid>;

describe('Tenant Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidUuid.mockReturnValue(true);
  });

  describe('tenantHook', () => {
    it('should return 401 if no user on request', async () => {
      const request = createMockRequest({ user: null });
      const reply = createMockReply();

      await tenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      }));
    });

    it('should return 400 if user has no tenant_id', async () => {
      const request = createMockRequest({
        user: { ...createMockUser(), tenant_id: undefined },
      });
      const reply = createMockReply();

      await tenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Tenant ID not found in authentication token',
        code: 'MISSING_TENANT_ID',
      }));
    });

    it('should return 400 for invalid UUID format', async () => {
      const request = createMockRequest({
        user: createMockUser({ tenant_id: 'invalid-uuid' }),
      });
      const reply = createMockReply();
      mockIsValidUuid.mockReturnValue(false);

      await tenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid tenant ID format',
        code: 'INVALID_TENANT_FORMAT',
      }));
    });

    it('should return 403 if tenant not found in database', async () => {
      const request = createMockRequest({
        user: createMockUser({ tenant_id: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const reply = createMockReply();

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      await tenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid tenant. The tenant does not exist.',
        code: 'INVALID_TENANT',
      }));
    });

    it('should return 403 if tenant is not active', async () => {
      const request = createMockRequest({
        user: createMockUser({ tenant_id: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const reply = createMockReply();

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            id: '550e8400-e29b-41d4-a716-446655440000',
            status: 'suspended',
          }),
        }),
      });

      await tenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Tenant account is not active',
        code: 'INACTIVE_TENANT',
      }));
    });

    it('should set RLS context and attach tenant to request for active tenant', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const tenant = {
        id: tenantId,
        status: 'active',
        name: 'Test Tenant',
      };
      const request = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      const reply = createMockReply();

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(tenant),
        }),
      });
      mockDb.raw.mockResolvedValue(undefined);

      await tenantHook(request as any, reply as any);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [tenantId]
      );
      expect((request as any).tenantId).toBe(tenantId);
      expect((request as any).tenant).toEqual(tenant);
    });

    it('should return 500 on database error', async () => {
      const request = createMockRequest({
        user: createMockUser({ tenant_id: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const reply = createMockReply();

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockRejectedValue(new Error('DB connection error')),
        }),
      });

      await tenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Failed to validate tenant',
        code: 'TENANT_VALIDATION_ERROR',
      }));
    });

    it('should log tenant validation with debug level', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const request = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      const reply = createMockReply();

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ id: tenantId, status: 'active' }),
        }),
      });
      mockDb.raw.mockResolvedValue(undefined);

      await tenantHook(request as any, reply as any);

      expect(request.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId }),
        expect.stringContaining('Tenant validated')
      );
    });
  });

  describe('setTenantContext', () => {
    it('should set tenant context in transaction', async () => {
      const trx = {
        raw: jest.fn().mockResolvedValue(undefined),
      };
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';

      await setTenantContext(trx, tenantId);

      expect(trx.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [tenantId]
      );
    });

    it('should throw error for invalid UUID', async () => {
      const trx = {
        raw: jest.fn(),
      };
      mockIsValidUuid.mockReturnValue(false);

      await expect(setTenantContext(trx, 'invalid')).rejects.toThrow(
        'Invalid tenant ID format'
      );
      expect(trx.raw).not.toHaveBeenCalled();
    });
  });

  describe('withTenantContext', () => {
    it('should execute callback within tenant context', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const mockCallback = jest.fn().mockResolvedValue('result');
      const mockTrx = {
        raw: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.transaction.mockImplementation(async (callback: Function) => {
        return callback(mockTrx);
      });

      const result = await withTenantContext(tenantId, mockCallback);

      expect(mockTrx.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [tenantId]
      );
      expect(mockCallback).toHaveBeenCalledWith(mockTrx);
      expect(result).toBe('result');
    });

    it('should propagate errors from callback', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const mockCallback = jest.fn().mockRejectedValue(new Error('Callback failed'));
      const mockTrx = {
        raw: jest.fn().mockResolvedValue(undefined),
      };

      mockDb.transaction.mockImplementation(async (callback: Function) => {
        return callback(mockTrx);
      });

      await expect(withTenantContext(tenantId, mockCallback)).rejects.toThrow('Callback failed');
    });
  });

  describe('optionalTenantHook', () => {
    it('should set tenant context for authenticated user', () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const request = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      const reply = createMockReply();
      const done = jest.fn();

      mockDb.raw.mockResolvedValue(undefined);

      optionalTenantHook(request as any, reply as any, done);

      expect((request as any).tenantId).toBe(tenantId);
      expect(done).toHaveBeenCalled();
    });

    it('should set null tenant for unauthenticated request', () => {
      const request = createMockRequest({ user: null });
      const reply = createMockReply();
      const done = jest.fn();

      optionalTenantHook(request as any, reply as any, done);

      expect((request as any).tenantId).toBeNull();
      expect(done).toHaveBeenCalled();
    });

    it('should set null tenant for user without tenant_id', () => {
      const request = createMockRequest({
        user: { ...createMockUser(), tenant_id: undefined },
      });
      const reply = createMockReply();
      const done = jest.fn();

      optionalTenantHook(request as any, reply as any, done);

      expect((request as any).tenantId).toBeNull();
      expect(done).toHaveBeenCalled();
    });

    it('should call done and continue even on RLS set error', () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const request = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      const reply = createMockReply();
      const done = jest.fn();

      mockDb.raw.mockRejectedValue(new Error('RLS error'));

      optionalTenantHook(request as any, reply as any, done);

      expect(done).toHaveBeenCalled();
      expect((request as any).tenantId).toBe(tenantId);
    });

    it('should handle unexpected errors', () => {
      const request = createMockRequest();
      // Force an error by making user getter throw
      Object.defineProperty(request, 'user', {
        get: () => { throw new Error('Unexpected error'); },
      });
      const reply = createMockReply();
      const done = jest.fn();

      optionalTenantHook(request as any, reply as any, done);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(done).toHaveBeenCalled();
    });
  });

  describe('strictTenantHook', () => {
    it('should return 401 if no user', async () => {
      const request = createMockRequest({ user: null });
      const reply = createMockReply();

      await strictTenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      }));
    });

    it('should return 400 if user has no tenant_id', async () => {
      const request = createMockRequest({
        user: { ...createMockUser(), tenant_id: undefined },
      });
      const reply = createMockReply();

      await strictTenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Tenant ID not found in authentication token',
        code: 'MISSING_TENANT_ID',
      }));
    });

    it('should return 400 for invalid UUID format', async () => {
      const request = createMockRequest({
        user: createMockUser({ tenant_id: 'invalid-uuid' }),
      });
      const reply = createMockReply();
      mockIsValidUuid.mockReturnValue(false);

      await strictTenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid tenant ID format',
        code: 'INVALID_TENANT_FORMAT',
      }));
    });

    it('should set RLS context without DB validation for valid tenant', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const request = createMockRequest({
        user: createMockUser({ tenant_id: tenantId }),
      });
      const reply = createMockReply();
      mockDb.raw.mockResolvedValue(undefined);

      await strictTenantHook(request as any, reply as any);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant_id = ?',
        [tenantId]
      );
      expect((request as any).tenantId).toBe(tenantId);
      // Note: strict hook does NOT look up tenant in DB, so tenant object is not set
      expect((request as any).tenant).toBeUndefined();
    });

    it('should return 500 on RLS set error', async () => {
      const request = createMockRequest({
        user: createMockUser({ tenant_id: '550e8400-e29b-41d4-a716-446655440000' }),
      });
      const reply = createMockReply();
      mockDb.raw.mockRejectedValue(new Error('RLS error'));

      await strictTenantHook(request as any, reply as any);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      }));
    });

    it('should log tenant context with debug level', async () => {
      const tenantId = '550e8400-e29b-41d4-a716-446655440000';
      const request = createMockRequest({
        user: createMockUser({ tenant_id: tenantId, id: 'user-123' }),
      });
      const reply = createMockReply();
      mockDb.raw.mockResolvedValue(undefined);

      await strictTenantHook(request as any, reply as any);

      expect(request.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId }),
        expect.stringContaining('Strict tenant context set')
      );
    });
  });
});
