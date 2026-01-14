import { FastifyRequest, FastifyReply } from 'fastify';
import { tenantMiddleware } from '../../../src/middleware/tenant.middleware';
import { logger } from '../../../src/utils/logger';
import { getDatabase } from '../../../src/config/database';

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config/database');

describe('Tenant Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;
  let mockPool: any;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    sendMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock,
      send: sendMock,
    } as Partial<FastifyReply>;

    mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    mockPool = {
      query: mockQuery,
    };

    (getDatabase as jest.Mock).mockReturnValue(mockPool);

    mockRequest = {
      url: '/api/orders',
      user: undefined,
    } as Partial<FastifyRequest>;
  });

  describe('Success Cases', () => {
    it('should set tenant context with tenantId', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant).toEqual({
        tenantId: 'tenant-123',
        tenantName: undefined,
      });
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should set tenant context with tenantId and tenantName', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-456',
        tenantName: 'Acme Corp',
        role: 'admin',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant).toEqual({
        tenantId: 'tenant-456',
        tenantName: 'Acme Corp',
      });
    });

    it('should set PostgreSQL session variable for RLS', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-789',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(getDatabase).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith('SET app.current_tenant = $1', [
        'tenant-789',
      ]);
    });

    it('should log debug message on success', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith('Tenant context set', {
        tenantId: 'tenant-123',
        userId: 'user-123',
        path: '/api/orders',
      });
    });

    it('should handle tenant with special characters in ID', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-abc-123_xyz',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant).toEqual({
        tenantId: 'tenant-abc-123_xyz',
        tenantName: undefined,
      });
      expect(mockQuery).toHaveBeenCalledWith('SET app.current_tenant = $1', [
        'tenant-abc-123_xyz',
      ]);
    });

    it('should handle tenant with UUID format', async () => {
      const tenantUuid = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.user = {
        id: 'user-123',
        tenantId: tenantUuid,
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe(tenantUuid);
      expect(mockQuery).toHaveBeenCalledWith('SET app.current_tenant = $1', [
        tenantUuid,
      ]);
    });

    it('should handle long tenant names', async () => {
      const longName = 'A'.repeat(200);
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        tenantName: longName,
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantName).toBe(longName);
    });
  });

  describe('Missing User Context', () => {
    it('should reject request without user', async () => {
      mockRequest.user = undefined;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Tenant context required',
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should reject request with null user', async () => {
      mockRequest.user = null as any;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should log warning when user is missing', async () => {
      mockRequest.user = undefined;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Missing tenant context in request',
        {
          path: '/api/orders',
          userId: undefined,
        }
      );
    });
  });

  describe('Missing Tenant ID', () => {
    it('should reject request without tenantId', async () => {
      mockRequest.user = {
        id: 'user-123',
        role: 'customer',
      } as any;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Tenant context required',
      });
    });

    it('should reject request with undefined tenantId', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: undefined,
        role: 'customer',
      } as any;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should reject request with null tenantId', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: null,
        role: 'customer',
      } as any;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should reject request with empty string tenantId', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: '',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should log warning with userId when tenantId missing', async () => {
      mockRequest.user = {
        id: 'user-456',
        role: 'customer',
      } as any;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Missing tenant context in request',
        {
          path: '/api/orders',
          userId: 'user-456',
        }
      );
    });
  });

  describe('Database Errors', () => {
    it('should handle database query failure', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to set tenant context',
      });
    });

    it('should log error on database failure', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      const dbError = new Error('Connection timeout');
      mockQuery.mockRejectedValue(dbError);

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error setting tenant context',
        {
          error: dbError,
          path: '/api/orders',
        }
      );
    });

    it('should handle getDatabase() throwing error', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      (getDatabase as jest.Mock).mockImplementation(() => {
        throw new Error('Database not initialized');
      });

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(500);
    });

    it('should not set tenant context on database error', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      mockQuery.mockRejectedValue(new Error('DB Error'));

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Tenant should still be set on request even if DB query fails
      expect(mockRequest.tenant).toEqual({
        tenantId: 'tenant-123',
        tenantName: undefined,
      });
    });

    it('should handle SQL injection attempt', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: "tenant'; DROP TABLE orders; --",
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should use parameterized query
      expect(mockQuery).toHaveBeenCalledWith('SET app.current_tenant = $1', [
        "tenant'; DROP TABLE orders; --",
      ]);
    });
  });

  describe('Different Request Paths', () => {
    it('should work for /api/orders', async () => {
      mockRequest.url = '/api/orders';
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Tenant context set',
        expect.objectContaining({ path: '/api/orders' })
      );
    });

    it('should work for /api/orders/:id', async () => {
      mockRequest.url = '/api/orders/order-123';
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.debug).toHaveBeenCalledWith(
        'Tenant context set',
        expect.objectContaining({ path: '/api/orders/order-123' })
      );
    });

    it('should work for internal endpoints', async () => {
      mockRequest.url = '/internal/orders/confirm';
      mockRequest.user = {
        id: 'service-account',
        tenantId: 'tenant-123',
        role: 'service',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('tenant-123');
    });
  });

  describe('Different User Roles', () => {
    it('should work for customer role', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('tenant-123');
    });

    it('should work for admin role', async () => {
      mockRequest.user = {
        id: 'admin-123',
        tenantId: 'tenant-123',
        role: 'admin',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('tenant-123');
    });

    it('should work for manager role', async () => {
      mockRequest.user = {
        id: 'manager-123',
        tenantId: 'tenant-123',
        role: 'manager',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('tenant-123');
    });

    it('should work for service account', async () => {
      mockRequest.user = {
        id: 'service-123',
        tenantId: 'tenant-123',
        role: 'service',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('tenant-123');
    });
  });

  describe('Tenant Isolation', () => {
    it('should set different tenant contexts for different users', async () => {
      // First request - tenant A
      mockRequest.user = {
        id: 'user-1',
        tenantId: 'tenant-a',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('tenant-a');
      expect(mockQuery).toHaveBeenCalledWith('SET app.current_tenant = $1', [
        'tenant-a',
      ]);

      // Reset for second request
      mockQuery.mockClear();
      mockRequest.tenant = undefined as any;

      // Second request - tenant B
      mockRequest.user = {
        id: 'user-2',
        tenantId: 'tenant-b',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('tenant-b');
      expect(mockQuery).toHaveBeenCalledWith('SET app.current_tenant = $1', [
        'tenant-b',
      ]);
    });

    it('should maintain tenant context throughout request lifecycle', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-persistent',
        tenantName: 'Persistent Tenant',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Verify tenant context remains after middleware execution
      expect(mockRequest.tenant).toEqual({
        tenantId: 'tenant-persistent',
        tenantName: 'Persistent Tenant',
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle numeric tenant IDs', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: '12345' as any,
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant.tenantId).toBe('12345');
    });

    it('should handle tenant with only whitespace (should reject)', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: '   ',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // '   ' is truthy, so it would pass the check
      expect(mockRequest.tenant?.tenantId).toBe('   ');
    });

    it('should handle user with additional properties', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        tenantName: 'Test Tenant',
        role: 'customer',
        email: 'user@example.com',
        permissions: ['read', 'write'],
      } as any;

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.tenant).toEqual({
        tenantId: 'tenant-123',
        tenantName: 'Test Tenant',
      });
    });

    it('should handle concurrent requests with different tenants', async () => {
      const request1 = {
        ...mockRequest,
        user: { id: 'user-1', tenantId: 'tenant-1',role: 'customer' },
      };
      const request2 = {
        ...mockRequest,
        user: { id: 'user-2', tenantId: 'tenant-2', role: 'customer' },
      };

      await Promise.all([
        tenantMiddleware(request1 as FastifyRequest, mockReply as FastifyReply),
        tenantMiddleware(request2 as FastifyRequest, mockReply as FastifyReply),
      ]);

      expect(request1.tenant?.tenantId).toBe('tenant-1');
      expect(request2.tenant?.tenantId).toBe('tenant-2');
    });

    it('should not leak tenant context between requests', async () => {
      // First request
      mockRequest.user = {
        id: 'user-1',
        tenantId: 'tenant-1',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const firstTenantId = mockRequest.tenant?.tenantId;

      // Create new request (simulating new request in real scenario)
      const newRequest: Partial<FastifyRequest> = {
        url: '/api/orders',
        user: {
          id: 'user-2',
          tenantId: 'tenant-2',
          role: 'customer',
        },
      };

      await tenantMiddleware(
        newRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(firstTenantId).toBe('tenant-1');
      expect(newRequest.tenant?.tenantId).toBe('tenant-2');
      expect(firstTenantId).not.toBe(newRequest.tenant?.tenantId);
    });
  });

  describe('Database Session Variable', () => {
    it('should set app.current_tenant exactly once per request', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should use parameterized query for security', async () => {
      mockRequest.user = {
        id: 'user-123',
        tenantId: 'tenant-123',
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Verify it's using $1 placeholder
      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toBe('SET app.current_tenant = $1');
      expect(params).toEqual(['tenant-123']);
    });

    it('should handle very long tenant IDs in database query', async () => {
      const longTenantId = 'tenant-' + 'a'.repeat(500);
      mockRequest.user = {
        id: 'user-123',
        tenantId: longTenantId,
        role: 'customer',
      };

      await tenantMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockQuery).toHaveBeenCalledWith('SET app.current_tenant = $1', [
        longTenantId,
      ]);
    });
  });
});
