/**
 * COMPONENT TEST: MaintenanceMiddleware
 *
 * Tests MaintenanceMiddleware with MOCKED Redis
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Redis data store
const mockRedisData: Map<string, string> = new Map();
let mockRedisError: Error | null = null;

// Mock Redis
jest.mock('../../../src/config/redis', () => ({
  getRedis: () => ({
    get: jest.fn(async (key: string) => {
      if (mockRedisError) {
        throw mockRedisError;
      }
      return mockRedisData.get(key) || null;
    }),
    set: jest.fn(async (key: string, value: string) => {
      if (mockRedisError) {
        throw mockRedisError;
      }
      mockRedisData.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      if (mockRedisError) {
        throw mockRedisError;
      }
      mockRedisData.delete(key);
      return 1;
    }),
  }),
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

import { maintenanceMiddleware } from '../../../src/middleware/maintenance.middleware';

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): FastifyRequest {
  return {
    url: '/api/v1/payments',
    method: 'POST',
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): { reply: FastifyReply; getSentStatus: () => number; getSentResponse: () => any } {
  let sentStatus = 200;
  let sentResponse: any = null;

  const reply = {
    status: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    send: jest.fn().mockImplementation((response: any) => {
      sentResponse = response;
      return reply;
    }),
  } as unknown as FastifyReply;

  return {
    reply,
    getSentStatus: () => sentStatus,
    getSentResponse: () => sentResponse,
  };
}

describe('MaintenanceMiddleware Component Tests', () => {
  let tenantId: string;
  let userId: string;

  beforeEach(() => {
    tenantId = uuidv4();
    userId = uuidv4();

    // Clear mock Redis data and error state
    mockRedisData.clear();
    mockRedisError = null;
  });

  afterEach(() => {
    mockRedisData.clear();
    mockRedisError = null;
    jest.clearAllMocks();
  });

  // ===========================================================================
  // MAINTENANCE MODE OFF
  // ===========================================================================
  describe('maintenance mode off', () => {
    it('should allow request when maintenance mode is not set', async () => {
      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should allow request when maintenance mode is false', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'false');

      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // MAINTENANCE MODE ON
  // ===========================================================================
  describe('maintenance mode on', () => {
    it('should block non-admin request when maintenance mode is on', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');

      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply, getSentResponse } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(503);
      expect(getSentResponse()).toMatchObject({
        status: 503,
        maintenance: true,
        retryAfter: 300,
      });
    });

    it('should allow admin request when maintenance mode is on', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');

      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: ['admin'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should allow admin with is_admin flag', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');

      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: [], is_admin: true },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SKIP CONDITIONS
  // ===========================================================================
  describe('skip conditions', () => {
    it('should skip check when no tenant context', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');

      const mockRequest = createMockRequest({
        // No tenantId
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should skip check for /health endpoint', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');

      const mockRequest = createMockRequest({
        url: '/health',
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should skip check for /health/live endpoint', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');

      const mockRequest = createMockRequest({
        url: '/health/live',
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should skip check for /ready endpoint', async () => {
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');

      const mockRequest = createMockRequest({
        url: '/ready',
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // TENANT ISOLATION
  // ===========================================================================
  describe('tenant isolation', () => {
    it('should only check maintenance for specific tenant', async () => {
      const otherTenantId = uuidv4();
      
      // Set maintenance for OTHER tenant, not our tenant
      mockRedisData.set(`maintenance:payment-service:${otherTenantId}`, 'true');

      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      // Our tenant should not be blocked
      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should block only the tenant in maintenance mode', async () => {
      const otherTenantId = uuidv4();
      
      // Set maintenance for our tenant
      mockRedisData.set(`maintenance:payment-service:${tenantId}`, 'true');
      // Other tenant is NOT in maintenance
      mockRedisData.set(`maintenance:payment-service:${otherTenantId}`, 'false');

      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      // Our tenant should be blocked
      expect(reply.status).toHaveBeenCalledWith(503);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should fail open when Redis throws error', async () => {
      // Set error state for mock Redis
      mockRedisError = new Error('Redis connection failed');

      const mockRequest = createMockRequest({
        tenantId,
        user: { id: userId, roles: ['user'] },
      });
      const { reply } = createMockReply();

      await maintenanceMiddleware(mockRequest, reply);

      // Should allow request through (fail open)
      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });
});
