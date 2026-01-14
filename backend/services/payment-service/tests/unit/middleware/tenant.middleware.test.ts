/**
 * Tenant Middleware Unit Tests
 * 
 * Tests for:
 * - JWT issuer/audience validation
 * - Tenant ID UUID validation
 * - URL vs JWT tenant matching
 * - Body tenant rejection (security)
 * - RLS context setting
 * - Public route bypassing
 * - withTenantContext wrapper
 */

import {
  tenantMiddleware,
  setRlsContext,
  requireTenant,
  withTenantContext,
  withTenantReadContext,
  tenantQuery,
  getTenantId,
  getUserId,
  requireTenantId,
  isValidUUID,
} from '../../../src/middleware/tenant.middleware';
import { DatabaseService } from '../../../src/services/databaseService';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/services/databaseService');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('Tenant Middleware', () => {
  let mockPool: any;
  let mockClient: any;
  let mockRequest: any;
  let mockReply: any;

  const validTenantId = 'a1b2c3d4-e5f6-4789-abcd-123456789012';

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (DatabaseService.getPool as jest.Mock).mockReturnValue(mockPool);

    mockRequest = {
      url: '/api/payments',
      headers: {},
      params: {},
      body: {},
      user: null,
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      sent: false,
    };
  });

  // ===========================================================================
  // PUBLIC ROUTES
  // ===========================================================================

  describe('public routes', () => {
    it('should skip tenant validation for /health', async () => {
      mockRequest.url = '/health';

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should skip tenant validation for /health/live', async () => {
      mockRequest.url = '/health/live';

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should skip tenant validation for /health/ready', async () => {
      mockRequest.url = '/health/ready';

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should skip tenant validation for /metrics', async () => {
      mockRequest.url = '/metrics';

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should skip tenant validation for /stripe/webhook', async () => {
      mockRequest.url = '/stripe/webhook';

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should strip query params when checking public routes', async () => {
      mockRequest.url = '/health?timestamp=12345';

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SERVICE-TO-SERVICE CALLS
  // ===========================================================================

  describe('service-to-service calls', () => {
    it('should accept valid tenant ID from X-Tenant-ID header', async () => {
      mockRequest.headers['x-tenant-id'] = validTenantId;
      mockRequest.user = null;

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject invalid tenant ID format from header', async () => {
      mockRequest.headers['x-tenant-id'] = 'invalid-uuid';
      mockRequest.user = null;

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_REQUIRED',
        })
      );
    });

    it('should require tenant when no user and no header', async () => {
      mockRequest.user = null;

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Missing Tenant Context',
        })
      );
    });
  });

  // ===========================================================================
  // JWT ISSUER VALIDATION
  // ===========================================================================

  describe('JWT issuer validation', () => {
    it('should accept valid issuer "tickettoken"', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should accept valid issuer "auth-service"', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'auth-service',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should reject invalid issuer', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'malicious-issuer',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_ISSUER',
        })
      );
    });

    it('should reject missing issuer', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_ISSUER',
        })
      );
    });
  });

  // ===========================================================================
  // JWT AUDIENCE VALIDATION
  // ===========================================================================

  describe('JWT audience validation', () => {
    it('should accept valid audience "payment-service"', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should accept valid audience "internal"', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'internal',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should accept array audience with valid value', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: ['other-service', 'payment-service'],
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should reject invalid audience', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'wrong-audience',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_AUDIENCE',
        })
      );
    });

    it('should reject missing audience', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_AUDIENCE',
        })
      );
    });
  });

  // ===========================================================================
  // TENANT ID EXTRACTION
  // ===========================================================================

  describe('tenant ID extraction from JWT', () => {
    it('should extract tenantId from JWT', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should extract tenant_id (snake_case) from JWT', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenant_id: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should extract organizationId from JWT', async () => {
      mockRequest.user = {
        sub: 'user-123',
        organizationId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should reject missing tenant ID in JWT', async () => {
      mockRequest.user = {
        sub: 'user-123',
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_REQUIRED',
        })
      );
    });

    it('should set userId from JWT sub claim', async () => {
      mockRequest.user = {
        sub: 'user-456',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.userId).toBe('user-456');
    });
  });

  // ===========================================================================
  // TENANT ID UUID VALIDATION
  // ===========================================================================

  describe('tenant ID UUID validation', () => {
    it('should accept valid UUID v4 format', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: 'a1b2c3d4-e5f6-4789-abcd-123456789012',
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe('a1b2c3d4-e5f6-4789-abcd-123456789012');
    });

    it('should reject invalid UUID format', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: 'not-a-valid-uuid',
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'INVALID_TENANT_FORMAT',
        })
      );
    });

    it('should reject UUID v1 format (not v4)', async () => {
      // UUID v1 has version 1 in position 13
      mockRequest.user = {
        sub: 'user-123',
        tenantId: 'a1b2c3d4-e5f6-1789-abcd-123456789012',
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  // ===========================================================================
  // URL TENANT MATCHING
  // ===========================================================================

  describe('URL tenant matching', () => {
    it('should reject mismatched URL and JWT tenant IDs', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };
      mockRequest.params.tenantId = 'b2c3d4e5-f6a7-4890-bcde-234567890123';

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TENANT_MISMATCH',
        })
      );
    });

    it('should accept matching URL and JWT tenant IDs', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };
      mockRequest.params.tenantId = validTenantId;

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should allow when no URL tenant specified', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };
      // No tenantId in params

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
    });
  });

  // ===========================================================================
  // BODY TENANT REJECTION (SECURITY)
  // ===========================================================================

  describe('body tenant rejection', () => {
    it('should strip tenantId from request body', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };
      mockRequest.body = {
        amount: 1000,
        tenantId: 'attacker-tenant-id',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.body.tenantId).toBeUndefined();
      expect(mockRequest.tenantId).toBe(validTenantId);
    });

    it('should strip tenant_id from request body', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };
      mockRequest.body = {
        amount: 1000,
        tenant_id: 'attacker-tenant-id',
      };

      await tenantMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.body.tenant_id).toBeUndefined();
      expect(mockRequest.tenantId).toBe(validTenantId);
    });
  });

  // ===========================================================================
  // RLS CONTEXT
  // ===========================================================================

  describe('setRlsContext', () => {
    it('should set RLS context when tenant ID present', async () => {
      mockRequest.tenantId = validTenantId;

      await setRlsContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("set_config('app.current_tenant_id'"),
        [validTenantId]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("set_config('app.tenant_id'"),
        [validTenantId]
      );
    });

    it('should skip RLS setup when no tenant ID', async () => {
      mockRequest.tenantId = undefined;

      await setRlsContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.tenantId = validTenantId;
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await setRlsContext(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw
      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // withTenantContext
  // ===========================================================================

  describe('withTenantContext', () => {
    it('should execute function with tenant context', async () => {
      const callback = jest.fn().mockResolvedValue('result');

      const result = await withTenantContext(validTenantId, callback);

      expect(result).toBe('result');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("set_config('app.tenant_id'"),
        [validTenantId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('Query failed'));

      await expect(withTenantContext(validTenantId, callback)).rejects.toThrow('Query failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject invalid tenant ID', async () => {
      const callback = jest.fn();

      await expect(withTenantContext('invalid', callback)).rejects.toThrow(
        'Valid tenant ID required'
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('should reject empty tenant ID', async () => {
      const callback = jest.fn();

      await expect(withTenantContext('', callback)).rejects.toThrow(
        'Valid tenant ID required'
      );
    });

    it('should set statement timeout when provided', async () => {
      const callback = jest.fn().mockResolvedValue('result');

      await withTenantContext(validTenantId, callback, { statementTimeoutMs: 5000 });

      expect(mockClient.query).toHaveBeenCalledWith(
        'SET LOCAL statement_timeout = $1',
        [5000]
      );
    });

    it('should set lock timeout when provided', async () => {
      const callback = jest.fn().mockResolvedValue('result');

      await withTenantContext(validTenantId, callback, { lockTimeoutMs: 3000 });

      expect(mockClient.query).toHaveBeenCalledWith(
        'SET LOCAL lock_timeout = $1',
        [3000]
      );
    });
  });

  // ===========================================================================
  // withTenantReadContext
  // ===========================================================================

  describe('withTenantReadContext', () => {
    it('should use READ ONLY transaction', async () => {
      const callback = jest.fn().mockResolvedValue('result');

      await withTenantReadContext(validTenantId, callback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN READ ONLY');
    });

    it('should reject invalid tenant ID', async () => {
      await expect(withTenantReadContext('invalid', jest.fn())).rejects.toThrow();
    });
  });

  // ===========================================================================
  // tenantQuery
  // ===========================================================================

  describe('tenantQuery', () => {
    it('should execute query with tenant context', async () => {
      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql === 'SELECT * FROM payments WHERE id = $1') {
          return { rows: [{ id: 'payment-123', amount: 1000 }] };
        }
        return { rows: [] };
      });

      const result = await tenantQuery(
        validTenantId,
        'SELECT * FROM payments WHERE id = $1',
        ['payment-123']
      );

      expect(result).toEqual([{ id: 'payment-123', amount: 1000 }]);
    });
  });

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================

  describe('utility functions', () => {
    describe('getTenantId', () => {
      it('should return tenant ID from request', () => {
        mockRequest.tenantId = validTenantId;

        const result = getTenantId(mockRequest as FastifyRequest);

        expect(result).toBe(validTenantId);
      });

      it('should return undefined if not set', () => {
        const result = getTenantId(mockRequest as FastifyRequest);

        expect(result).toBeUndefined();
      });
    });

    describe('getUserId', () => {
      it('should return user ID from request', () => {
        mockRequest.userId = 'user-123';

        const result = getUserId(mockRequest as FastifyRequest);

        expect(result).toBe('user-123');
      });
    });

    describe('requireTenantId', () => {
      it('should return tenant ID when present', () => {
        mockRequest.tenantId = validTenantId;

        const result = requireTenantId(mockRequest as FastifyRequest);

        expect(result).toBe(validTenantId);
      });

      it('should throw when tenant ID missing', () => {
        expect(() => requireTenantId(mockRequest as FastifyRequest)).toThrow(
          'Tenant ID required but not present'
        );
      });
    });

    describe('isValidUUID', () => {
      it('should return true for valid UUID v4', () => {
        expect(isValidUUID('a1b2c3d4-e5f6-4789-abcd-123456789012')).toBe(true);
      });

      it('should return false for invalid UUID', () => {
        expect(isValidUUID('not-a-uuid')).toBe(false);
      });

      it('should return false for UUID v1', () => {
        expect(isValidUUID('a1b2c3d4-e5f6-1789-abcd-123456789012')).toBe(false);
      });

      it('should be case insensitive', () => {
        expect(isValidUUID('A1B2C3D4-E5F6-4789-ABCD-123456789012')).toBe(true);
      });
    });
  });

  // ===========================================================================
  // requireTenant (combined middleware)
  // ===========================================================================

  describe('requireTenant', () => {
    it('should validate tenant and set RLS context', async () => {
      mockRequest.user = {
        sub: 'user-123',
        tenantId: validTenantId,
        iss: 'tickettoken',
        aud: 'payment-service',
      };

      await requireTenant(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.tenantId).toBe(validTenantId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("set_config('app.current_tenant_id'"),
        [validTenantId]
      );
    });

    it('should not set RLS if validation fails', async () => {
      mockRequest.user = {
        sub: 'user-123',
        iss: 'invalid-issuer',
        aud: 'payment-service',
      };
      mockReply.sent = true; // Simulate reply already sent

      await requireTenant(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // RLS should not be set since reply was already sent due to error
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });
});
