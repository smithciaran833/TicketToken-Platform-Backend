/**
 * Unit Tests for middleware/tenant-context.ts
 * 
 * Tests tenant context middleware, RLS setup, and platform admin checks.
 * Priority: 🔴 Critical (Security/multi-tenancy)
 */

import {
  tenantContextMiddleware,
  isPlatformAdmin,
  getTenantIdFromRequest,
  withTenantContext
} from '../../../src/middleware/tenant-context';

// =============================================================================
// Mock Setup
// =============================================================================

jest.mock('../../../src/utils/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock database
const mockRaw = jest.fn();
const mockTransaction = jest.fn((callback) => callback({ raw: mockRaw }));
jest.mock('../../../src/config/database', () => ({
  db: {
    transaction: mockTransaction,
    raw: mockRaw
  }
}));

const createMockRequest = (overrides: any = {}) => ({
  headers: {},
  ip: '127.0.0.1',
  url: '/test',
  user: undefined,
  query: {},
  ...overrides
});

const createMockReply = () => ({
  code: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis()
});

const validUUID = '123e4567-e89b-12d3-a456-426614174000';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// tenantContextMiddleware Tests
// =============================================================================

describe('tenantContextMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 without tenant', async () => {
    const request = createMockRequest({ user: undefined });
    const reply = createMockReply();

    await tenantContextMiddleware(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UNAUTHORIZED' })
    );
  });

  it('should return 401 when user has no tenant_id', async () => {
    const request = createMockRequest({ user: { id: validUUID } });
    const reply = createMockReply();

    await tenantContextMiddleware(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('should validate tenant_id is UUID format', async () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: 'not-a-uuid' }
    });
    const reply = createMockReply();

    await tenantContextMiddleware(request as any, reply as any);

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INVALID_TENANT' })
    );
  });

  it('should attach tenantId to request on success', async () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID }
    });
    const reply = createMockReply();

    await tenantContextMiddleware(request as any, reply as any);

    expect((request as any).tenantId).toBe(validUUID);
    expect(reply.code).not.toHaveBeenCalled();
  });
});

// =============================================================================
// isPlatformAdmin Tests
// =============================================================================

describe('isPlatformAdmin', () => {
  it('should return true for platform_admin role', () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'platform_admin' }
    });

    expect(isPlatformAdmin(request as any)).toBe(true);
  });

  it('should return true for super_admin role', () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'super_admin' }
    });

    expect(isPlatformAdmin(request as any)).toBe(true);
  });

  it('should return false for regular user', () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'user' }
    });

    expect(isPlatformAdmin(request as any)).toBe(false);
  });

  it('should return false for admin role', () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'admin' }
    });

    expect(isPlatformAdmin(request as any)).toBe(false);
  });

  it('should return false when no user', () => {
    const request = createMockRequest({ user: undefined });

    expect(isPlatformAdmin(request as any)).toBe(false);
  });
});

// =============================================================================
// getTenantIdFromRequest Tests
// =============================================================================

describe('getTenantIdFromRequest', () => {
  it('should return tenant_id for regular user', () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'user' }
    });

    expect(getTenantIdFromRequest(request as any)).toBe(validUUID);
  });

  it('should return null when no user', () => {
    const request = createMockRequest({ user: undefined });

    expect(getTenantIdFromRequest(request as any)).toBeNull();
  });

  it('should allow platform admin to specify different tenant via query', () => {
    const otherTenantId = '22222222-2222-4222-8222-222222222222';
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'platform_admin' },
      query: { tenant_id: otherTenantId }
    });

    expect(getTenantIdFromRequest(request as any, true)).toBe(otherTenantId);
  });

  it('should return null for platform admin without specific tenant (cross-tenant)', () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'platform_admin' },
      query: {}
    });

    expect(getTenantIdFromRequest(request as any, true)).toBeNull();
  });

  it('should ignore query param for non-platform-admin', () => {
    const otherTenantId = '22222222-2222-4222-8222-222222222222';
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'admin' },
      query: { tenant_id: otherTenantId }
    });

    expect(getTenantIdFromRequest(request as any, true)).toBe(validUUID);
  });

  it('should validate tenant_id format in query param', () => {
    const request = createMockRequest({
      user: { id: validUUID, tenant_id: validUUID, role: 'platform_admin' },
      query: { tenant_id: 'invalid-not-uuid' }
    });

    // Should return null since invalid UUID won't match regex
    expect(getTenantIdFromRequest(request as any, true)).toBeNull();
  });
});

// =============================================================================
// withTenantContext Tests
// =============================================================================

describe('withTenantContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRaw.mockResolvedValue(undefined);
  });

  it('should validate tenant ID format', async () => {
    await expect(
      withTenantContext('invalid-tenant', async () => 'result')
    ).rejects.toThrow('Invalid tenant ID format');
  });

  it('should accept valid UUID tenant ID', async () => {
    const result = await withTenantContext(validUUID, async () => 'success');

    expect(result).toBe('success');
  });

  it('should call SET LOCAL with tenant ID', async () => {
    await withTenantContext(validUUID, async (trx) => {
      return 'result';
    });

    expect(mockRaw).toHaveBeenCalledWith(
      'SET LOCAL app.current_tenant_id = ?',
      [validUUID]
    );
  });

  it('should pass transaction to callback', async () => {
    let receivedTrx: any = null;
    
    await withTenantContext(validUUID, async (trx) => {
      receivedTrx = trx;
      return 'result';
    });

    expect(receivedTrx).toBeDefined();
    expect(receivedTrx.raw).toBeDefined();
  });
});
