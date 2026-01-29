/**
 * COMPONENT TEST: TenantMiddleware
 *
 * Tests tenant validation, isolation, and RLS context setting
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.JWT_ALLOWED_ISSUERS = 'tickettoken,auth-service';
process.env.JWT_ALLOWED_AUDIENCES = 'payment-service,internal';

// Mock database queries
const mockDbQueries: Array<{ text: string; values?: any[] }> = [];
let mockDbError: Error | null = null;

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => ({
      query: jest.fn(async (text: string, values?: any[]) => {
        if (mockDbError) throw mockDbError;
        mockDbQueries.push({ text, values });
        return { rows: [] };
      }),
      connect: jest.fn(async () => ({
        query: jest.fn(async (text: string, values?: any[]) => {
          if (mockDbError) throw mockDbError;
          mockDbQueries.push({ text, values });
          return { rows: [] };
        }),
        release: jest.fn(),
      })),
    }),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  tenantMiddleware,
  setRlsContext,
  requireTenant,
  getTenantId,
  getUserId,
  requireTenantId,
  isValidUUID,
  withTenantContext,
  withTenantReadContext,
  tenantQuery,
} from '../../../src/middleware/tenant.middleware';

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): FastifyRequest {
  return {
    url: '/api/v1/payments',
    method: 'POST',
    headers: {},
    params: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): {
  reply: FastifyReply;
  getSentStatus: () => number;
  getSentResponse: () => any;
  isSent: () => boolean;
} {
  let sentStatus = 200;
  let sentResponse: any = null;
  let sent = false;

  const reply = {
    status: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    send: jest.fn().mockImplementation((response: any) => {
      sentResponse = response;
      sent = true;
      return reply;
    }),
    sent: false,
  } as unknown as FastifyReply;

  Object.defineProperty(reply, 'sent', {
    get: () => sent,
  });

  return {
    reply,
    getSentStatus: () => sentStatus,
    getSentResponse: () => sentResponse,
    isSent: () => sent,
  };
}

describe('TenantMiddleware Component Tests', () => {
  let tenantId: string;
  let userId: string;

  beforeEach(() => {
    tenantId = uuidv4();
    userId = uuidv4();
    mockDbQueries.length = 0;
    mockDbError = null;
  });

  afterEach(() => {
    mockDbQueries.length = 0;
    mockDbError = null;
    jest.clearAllMocks();
  });

  // ===========================================================================
  // PUBLIC ROUTES
  // ===========================================================================
  describe('public routes', () => {
    it('should skip /health endpoint', async () => {
      const mockRequest = createMockRequest({ url: '/health' });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should skip /health/live endpoint', async () => {
      const mockRequest = createMockRequest({ url: '/health/live' });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should skip /health/ready endpoint', async () => {
      const mockRequest = createMockRequest({ url: '/health/ready' });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should skip /metrics endpoint', async () => {
      const mockRequest = createMockRequest({ url: '/metrics' });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should skip /stripe/webhook endpoint', async () => {
      const mockRequest = createMockRequest({ url: '/stripe/webhook' });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // JWT VALIDATION
  // ===========================================================================
  describe('JWT validation', () => {
    it('should reject request with invalid issuer', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          tenantId,
          iss: 'invalid-issuer',
          aud: 'payment-service',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().code).toBe('INVALID_ISSUER');
    });

    it('should reject request with invalid audience', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          tenantId,
          iss: 'tickettoken',
          aud: 'invalid-audience',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().code).toBe('INVALID_AUDIENCE');
    });

    it('should accept valid issuer and audience', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          tenantId,
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalledWith(401);
      expect((mockRequest as any).tenantId).toBe(tenantId);
    });

    it('should accept array audience', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          tenantId,
          iss: 'tickettoken',
          aud: ['other-service', 'payment-service'],
        },
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalledWith(401);
    });
  });

  // ===========================================================================
  // TENANT ID VALIDATION
  // ===========================================================================
  describe('tenant ID validation', () => {
    it('should reject missing tenant ID in JWT', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          // No tenantId
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().code).toBe('TENANT_REQUIRED');
    });

    it('should reject invalid UUID format for tenant ID', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          tenantId: 'not-a-valid-uuid',
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().code).toBe('INVALID_TENANT_FORMAT');
    });

    it('should accept tenant_id field (alternative)', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          tenant_id: tenantId, // Alternative field name
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect((mockRequest as any).tenantId).toBe(tenantId);
    });

    it('should accept organizationId field (alternative)', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          organizationId: tenantId, // Alternative field name
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect((mockRequest as any).tenantId).toBe(tenantId);
    });
  });

  // ===========================================================================
  // URL TENANT MATCHING
  // ===========================================================================
  describe('URL tenant matching', () => {
    it('should reject mismatched URL tenant ID', async () => {
      const urlTenantId = uuidv4();
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        params: { tenantId: urlTenantId },
        user: {
          sub: userId,
          tenantId, // Different from URL
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply, getSentResponse } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(getSentResponse().code).toBe('TENANT_MISMATCH');
    });

    it('should allow matching URL tenant ID', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        params: { tenantId },
        user: {
          sub: userId,
          tenantId,
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalledWith(403);
    });
  });

  // ===========================================================================
  // SERVICE-TO-SERVICE CALLS
  // ===========================================================================
  describe('service-to-service calls', () => {
    it('should accept X-Tenant-ID header for service calls without user', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        headers: { 'x-tenant-id': tenantId },
        // No user
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect((mockRequest as any).tenantId).toBe(tenantId);
    });

    it('should reject invalid X-Tenant-ID format', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        headers: { 'x-tenant-id': 'invalid-uuid' },
        // No user
      });
      const { reply, getSentResponse } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().code).toBe('TENANT_REQUIRED');
    });
  });

  // ===========================================================================
  // BODY TENANT REJECTION
  // ===========================================================================
  describe('body tenant rejection', () => {
    it('should remove tenantId from request body', async () => {
      const bodyTenantId = uuidv4();
      const body = { tenantId: bodyTenantId, amount: 1000 };
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        body,
        user: {
          sub: userId,
          tenantId,
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(body.tenantId).toBeUndefined();
      expect(body.amount).toBe(1000);
    });

    it('should remove tenant_id from request body', async () => {
      const body = { tenant_id: uuidv4(), amount: 1000 };
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        body,
        user: {
          sub: userId,
          tenantId,
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply } = createMockReply();

      await tenantMiddleware(mockRequest, reply);

      expect(body.tenant_id).toBeUndefined();
    });
  });

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================
  describe('utility functions', () => {
    describe('isValidUUID()', () => {
      it('should accept valid UUID v4', () => {
        expect(isValidUUID(uuidv4())).toBe(true);
      });

      it('should reject invalid UUID', () => {
        expect(isValidUUID('not-a-uuid')).toBe(false);
        expect(isValidUUID('12345678-1234-1234-1234-123456789012')).toBe(false); // Wrong version
        expect(isValidUUID('')).toBe(false);
      });
    });

    describe('getTenantId()', () => {
      it('should return tenant ID from request', () => {
        const mockRequest = createMockRequest({ tenantId });
        expect(getTenantId(mockRequest)).toBe(tenantId);
      });

      it('should return undefined when not set', () => {
        const mockRequest = createMockRequest({});
        expect(getTenantId(mockRequest)).toBeUndefined();
      });
    });

    describe('getUserId()', () => {
      it('should return user ID from request', () => {
        const mockRequest = createMockRequest({ userId });
        expect(getUserId(mockRequest)).toBe(userId);
      });

      it('should return undefined when not set', () => {
        const mockRequest = createMockRequest({});
        expect(getUserId(mockRequest)).toBeUndefined();
      });
    });

    describe('requireTenantId()', () => {
      it('should return tenant ID when present', () => {
        const mockRequest = createMockRequest({ tenantId });
        expect(requireTenantId(mockRequest)).toBe(tenantId);
      });

      it('should throw when tenant ID not present', () => {
        const mockRequest = createMockRequest({});
        expect(() => requireTenantId(mockRequest)).toThrow('Tenant ID required');
      });
    });
  });

  // ===========================================================================
  // RLS CONTEXT
  // ===========================================================================
  describe('setRlsContext()', () => {
    it('should set RLS context in database', async () => {
      const mockRequest = createMockRequest({ tenantId });
      const { reply } = createMockReply();

      await setRlsContext(mockRequest, reply);

      // Should have called set_config
      const setConfigQuery = mockDbQueries.find(q => 
        q.text.includes('set_config') && q.values?.includes(tenantId)
      );
      expect(setConfigQuery).toBeDefined();
    });

    it('should skip when no tenant ID', async () => {
      const mockRequest = createMockRequest({});
      const { reply } = createMockReply();

      await setRlsContext(mockRequest, reply);

      expect(mockDbQueries).toHaveLength(0);
    });
  });

  // ===========================================================================
  // REQUIRE TENANT
  // ===========================================================================
  describe('requireTenant()', () => {
    it('should validate tenant and set RLS context', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          tenantId,
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply, isSent } = createMockReply();

      await requireTenant(mockRequest, reply);

      expect(isSent()).toBe(false);
      expect((mockRequest as any).tenantId).toBe(tenantId);
    });

    it('should not set RLS if validation fails', async () => {
      const mockRequest = createMockRequest({
        url: '/api/v1/payments',
        user: {
          sub: userId,
          // No tenantId
          iss: 'tickettoken',
          aud: 'payment-service',
        },
      });
      const { reply, isSent } = createMockReply();

      await requireTenant(mockRequest, reply);

      expect(isSent()).toBe(true);
      expect(mockDbQueries).toHaveLength(0);
    });
  });

  // ===========================================================================
  // WITH TENANT CONTEXT
  // ===========================================================================
  describe('withTenantContext()', () => {
    it('should execute function within tenant context', async () => {
      let executedQuery: string | null = null;

      const result = await withTenantContext(tenantId, async (client) => {
        executedQuery = 'SELECT 1';
        return { success: true };
      });

      expect(result).toEqual({ success: true });
      // Should have set tenant context
      const setConfigQuery = mockDbQueries.find(q => 
        q.text.includes('set_config')
      );
      expect(setConfigQuery).toBeDefined();
    });

    it('should reject invalid tenant ID', async () => {
      await expect(
        withTenantContext('invalid-uuid', async () => ({ success: true }))
      ).rejects.toThrow('Valid tenant ID required');
    });

    it('should reject empty tenant ID', async () => {
      await expect(
        withTenantContext('', async () => ({ success: true }))
      ).rejects.toThrow('Valid tenant ID required');
    });
  });

  // ===========================================================================
  // WITH TENANT READ CONTEXT
  // ===========================================================================
  describe('withTenantReadContext()', () => {
    it('should execute read-only function within tenant context', async () => {
      const result = await withTenantReadContext(tenantId, async (client) => {
        return { data: 'test' };
      });

      expect(result).toEqual({ data: 'test' });
      // Should have started read-only transaction
      const beginQuery = mockDbQueries.find(q => 
        q.text.includes('BEGIN READ ONLY')
      );
      expect(beginQuery).toBeDefined();
    });

    it('should reject invalid tenant ID', async () => {
      await expect(
        withTenantReadContext('invalid', async () => ({}))
      ).rejects.toThrow('Valid tenant ID required');
    });
  });

  // ===========================================================================
  // TENANT QUERY
  // ===========================================================================
  describe('tenantQuery()', () => {
    it('should execute query within tenant context', async () => {
      await tenantQuery(tenantId, 'SELECT * FROM test WHERE id = $1', ['123']);

      // Should have set tenant context and executed query
      expect(mockDbQueries.length).toBeGreaterThan(0);
    });

    it('should reject invalid tenant ID', async () => {
      await expect(
        tenantQuery('invalid', 'SELECT 1')
      ).rejects.toThrow('Valid tenant ID required');
    });
  });
});
