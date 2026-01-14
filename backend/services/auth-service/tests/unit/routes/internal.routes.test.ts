// Mocks
const mockPool = {
  query: jest.fn(),
};

const mockVerifyServiceToken = jest.fn().mockImplementation(async () => {});

jest.mock('../../../src/config/database', () => ({
  pool: mockPool,
}));

jest.mock('../../../src/middleware/s2s.middleware', () => ({
  verifyServiceToken: mockVerifyServiceToken,
}));

// Mock zod-to-json-schema with permissive schema
jest.mock('zod-to-json-schema', () => ({
  zodToJsonSchema: jest.fn(() => ({ type: 'object', additionalProperties: true })),
}));

import Fastify from 'fastify';
import { internalRoutes } from '../../../src/routes/internal.routes';

describe('internal.routes', () => {
  let app: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = Fastify();
    await app.register(internalRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /validate-permissions', () => {
    it('should return valid=true when user has permissions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          role: 'admin',
          permissions: ['read', 'write'],
          tenant_id: 'tenant-123',
        }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['read'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.userId).toBe('user-123');
    });

    it('should return valid=false when user not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'nonexistent',
          permissions: ['read'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.reason).toBe('User not found');
    });

    it('should check venue roles when venueId provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-123',
            role: 'user',
            permissions: ['read'],
            tenant_id: 'tenant-123',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ role: 'manager' }],
        });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['read'],
          venueId: 'venue-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.venueRole).toBe('manager');
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['read'],
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.reason).toBe('Internal error');
    });

    it('should grant access to admin users', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          role: 'admin',
          permissions: [],
          tenant_id: 'tenant-123',
        }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['any:permission'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
    });

    it('should grant access to superadmin users', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          role: 'superadmin',
          permissions: [],
          tenant_id: 'tenant-123',
        }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['any:permission'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
    });

    it('should handle wildcard permissions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          role: 'user',
          permissions: ['*'],
          tenant_id: 'tenant-123',
        }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['any:permission'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
    });

    it('should return null venueRole when no venue roles exist', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-123',
            role: 'user',
            permissions: ['read'],
            tenant_id: 'tenant-123',
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['read'],
          venueId: 'venue-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.venueRole).toBeNull();
    });

    it('should return valid=false when user lacks required permissions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          role: 'user',
          permissions: ['read'],
          tenant_id: 'tenant-123',
        }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: {
          userId: 'user-123',
          permissions: ['write', 'delete'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
    });
  });

  describe('POST /validate-users', () => {
    it('should return users for valid IDs', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'user-1', email: 'user1@test.com', role: 'user' },
          { id: 'user-2', email: 'user2@test.com', role: 'admin' },
        ],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/validate-users',
        payload: {
          userIds: ['user-1', 'user-2'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users).toHaveLength(2);
      expect(body.found).toBe(2);
      expect(body.requested).toBe(2);
    });

    it('should return empty array for empty userIds', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validate-users',
        payload: {
          userIds: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users).toEqual([]);
    });

    it('should return empty array for undefined userIds', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/validate-users',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users).toEqual([]);
    });

    it('should reject more than 100 users', async () => {
      const userIds = Array.from({ length: 101 }, (_, i) => `user-${i}`);

      const response = await app.inject({
        method: 'POST',
        url: '/validate-users',
        payload: { userIds },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Maximum 100');
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/validate-users',
        payload: {
          userIds: ['user-1'],
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });

  describe('GET /user-tenant/:userId', () => {
    it('should return user tenant info', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          tenant_id: 'tenant-123',
          tenant_name: 'Test Tenant',
          tenant_slug: 'test-tenant',
        }],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/user-tenant/user-123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.tenant_id).toBe('tenant-123');
      expect(body.tenant_name).toBe('Test Tenant');
    });

    it('should return 404 for nonexistent user', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/user-tenant/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('User not found');
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));

      const response = await app.inject({
        method: 'GET',
        url: '/user-tenant/user-123',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('auth-service');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('S2S middleware', () => {
    it('should apply verifyServiceToken to all routes', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await app.inject({
        method: 'POST',
        url: '/validate-permissions',
        payload: { userId: 'test', permissions: [] },
      });

      expect(mockVerifyServiceToken).toHaveBeenCalled();
    });
  });
});
