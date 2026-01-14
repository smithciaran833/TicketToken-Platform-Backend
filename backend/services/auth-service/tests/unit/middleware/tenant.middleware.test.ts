// Mock database
const mockPool = {
  query: jest.fn(),
};

jest.mock('../../../src/config/database', () => ({
  pool: mockPool,
}));

// Import after mocks
import {
  validateTenant,
  validateResourceTenant,
  addTenantFilter,
  TenantIsolationError,
} from '../../../src/middleware/tenant.middleware';

describe('tenant.middleware', () => {
  // Both must be valid UUIDs per the regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const validUserId = '123e4567-e89b-12d3-a456-426614174000';
  const validTenantId = '550e8400-e29b-41d4-a716-446655440000';

  const createMockRequest = (user?: any) => ({
    user,
    log: {
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
    },
  });

  const createMockReply = () => {
    const reply: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return reply;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTenant', () => {
    it('passes with valid user and tenant', async () => {
      const request = createMockRequest({
        id: validUserId,
        tenant_id: validTenantId,
        email: 'test@example.com',
      });
      const reply = createMockReply();
      mockPool.query.mockResolvedValue({});

      await validateTenant(request as any, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('sets RLS context for tenant_id', async () => {
      const request = createMockRequest({
        id: validUserId,
        tenant_id: validTenantId,
      });
      const reply = createMockReply();
      mockPool.query.mockResolvedValue({});

      await validateTenant(request as any, reply);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT set_config($1, $2, true)',
        ['app.current_tenant_id', validTenantId]
      );
    });

    it('sets RLS context for user_id', async () => {
      const request = createMockRequest({
        id: validUserId,
        tenant_id: validTenantId,
      });
      const reply = createMockReply();
      mockPool.query.mockResolvedValue({});

      await validateTenant(request as any, reply);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT set_config($1, $2, true)',
        ['app.current_user_id', validUserId]
      );
    });

    it('returns 401 when user not authenticated', async () => {
      const request = createMockRequest(undefined);
      const reply = createMockReply();

      await validateTenant(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
    });

    it('returns 403 when tenant_id missing', async () => {
      const request = createMockRequest({
        id: validUserId,
        email: 'test@example.com',
        // tenant_id missing
      });
      const reply = createMockReply();

      await validateTenant(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'MISSING_TENANT_ID' })
      );
    });

    it('returns 403 when tenant_id is invalid UUID', async () => {
      const request = createMockRequest({
        id: validUserId,
        tenant_id: 'not-a-uuid',
      });
      const reply = createMockReply();

      await validateTenant(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'INVALID_TENANT_ID_FORMAT' })
      );
    });

    it('returns 403 when user_id is invalid UUID', async () => {
      const request = createMockRequest({
        id: 'invalid-user-id',
        tenant_id: validTenantId,
      });
      const reply = createMockReply();

      await validateTenant(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'INVALID_USER_ID_FORMAT' })
      );
    });

    it('returns 500 when RLS context fails', async () => {
      const request = createMockRequest({
        id: validUserId,
        tenant_id: validTenantId,
      });
      const reply = createMockReply();
      mockPool.query.mockRejectedValue(new Error('DB error'));

      await validateTenant(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'RLS_CONTEXT_ERROR' })
      );
    });

    it('logs debug message on success', async () => {
      const request = createMockRequest({
        id: validUserId,
        tenant_id: validTenantId,
      });
      const reply = createMockReply();
      mockPool.query.mockResolvedValue({});

      await validateTenant(request as any, reply);

      expect(request.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: validUserId,
          tenantId: validTenantId,
        }),
        expect.stringContaining('Tenant validation passed')
      );
    });

    it('accepts various valid UUID formats', async () => {
      const uuids = [
        '123e4567-e89b-12d3-a456-426614174000', // v1
        '550e8400-e29b-41d4-a716-446655440000', // v4
        'f47ac10b-58cc-4372-a567-0e02b2c3d479', // v4
      ];

      for (const uuid of uuids) {
        jest.clearAllMocks();
        const request = createMockRequest({
          id: uuid,
          tenant_id: uuid,
        });
        const reply = createMockReply();
        mockPool.query.mockResolvedValue({});

        await validateTenant(request as any, reply);

        expect(reply.status).not.toHaveBeenCalled();
      }
    });

    it('rejects UUID with invalid variant digit', async () => {
      // The regex requires [89ab] in position 19
      const invalidVariantUUID = '550e8400-e29b-41d4-0716-446655440000'; // 0 instead of 8/9/a/b
      const request = createMockRequest({
        id: invalidVariantUUID,
        tenant_id: validTenantId,
      });
      const reply = createMockReply();

      await validateTenant(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('validateResourceTenant', () => {
    it('returns true when tenants match', () => {
      const result = validateResourceTenant(validTenantId, validTenantId);
      expect(result).toBe(true);
    });

    it('returns false when tenants do not match', () => {
      const result = validateResourceTenant(validTenantId, validUserId);
      expect(result).toBe(false);
    });

    it('is case sensitive', () => {
      const result = validateResourceTenant(
        validTenantId.toLowerCase(),
        validTenantId.toUpperCase()
      );
      expect(result).toBe(false);
    });
  });

  describe('addTenantFilter', () => {
    it('returns object with tenant_id', () => {
      const filter = addTenantFilter(validTenantId);
      expect(filter).toEqual({ tenant_id: validTenantId });
    });
  });

  describe('TenantIsolationError', () => {
    it('has correct default message', () => {
      const error = new TenantIsolationError();
      expect(error.message).toBe('Cross-tenant access denied');
    });

    it('accepts custom message', () => {
      const error = new TenantIsolationError('Custom message');
      expect(error.message).toBe('Custom message');
    });

    it('has statusCode 403', () => {
      const error = new TenantIsolationError();
      expect(error.statusCode).toBe(403);
    });

    it('has correct code', () => {
      const error = new TenantIsolationError();
      expect(error.code).toBe('TENANT_ISOLATION_VIOLATION');
    });

    it('has correct name', () => {
      const error = new TenantIsolationError();
      expect(error.name).toBe('TenantIsolationError');
    });

    it('extends Error', () => {
      const error = new TenantIsolationError();
      expect(error).toBeInstanceOf(Error);
    });
  });
});
