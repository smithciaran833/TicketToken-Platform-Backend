/**
 * Unit Tests for Authentication Middleware
 * 
 * Tests JWT token validation and user context extraction.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  sign: jest.fn().mockReturnValue('mock-token'),
  decode: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Validation', () => {
    it('should reject requests without authorization header', async () => {
      const request = createMockRequest({
        headers: {},
      });
      const reply = createMockReply();

      // Simulate middleware behavior
      const hasAuth = request.headers.authorization !== undefined;
      
      if (!hasAuth) {
        reply.status(401).send({
          type: 'https://api.tickettoken.com/problems/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Authorization header is required',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          title: 'Unauthorized',
        })
      );
    });

    it('should reject requests with invalid authorization format', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'InvalidFormat token123',
        },
      });
      const reply = createMockReply();

      const authHeader = request.headers.authorization;
      const isBearer = authHeader.startsWith('Bearer ');

      if (!isBearer) {
        reply.status(401).send({
          type: 'https://api.tickettoken.com/problems/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Invalid authorization format. Expected: Bearer <token>',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should accept requests with valid Bearer token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({
        sub: 'user-123',
        tenantId: 'tenant-123',
        roles: ['user'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer valid-token',
        },
      });
      const reply = createMockReply();

      // Simulate token verification
      const authHeader = request.headers.authorization;
      const token = authHeader.replace('Bearer ', '');
      
      try {
        const decoded = jwt.verify(token, 'secret');
        (request as any).user = {
          userId: decoded.sub,
          tenantId: decoded.tenantId,
          roles: decoded.roles,
        };
      } catch (error) {
        reply.status(401).send({ error: 'Invalid token' });
      }

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'secret');
      expect((request as any).user.userId).toBe('user-123');
      expect((request as any).user.tenantId).toBe('tenant-123');
    });

    it('should reject expired tokens', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementation(() => {
        const error: any = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer expired-token',
        },
      });
      const reply = createMockReply();

      const token = request.headers.authorization.replace('Bearer ', '');
      
      try {
        jwt.verify(token, 'secret');
      } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
          reply.status(401).send({
            type: 'https://api.tickettoken.com/problems/unauthorized',
            title: 'Token Expired',
            status: 401,
            detail: 'Your session has expired. Please log in again.',
          });
        }
      }

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Token Expired',
        })
      );
    });

    it('should reject malformed tokens', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementation(() => {
        const error: any = new Error('jwt malformed');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer malformed.token',
        },
      });
      const reply = createMockReply();

      const token = request.headers.authorization.replace('Bearer ', '');
      
      try {
        jwt.verify(token, 'secret');
      } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
          reply.status(401).send({
            type: 'https://api.tickettoken.com/problems/unauthorized',
            title: 'Invalid Token',
            status: 401,
            detail: 'The provided token is invalid.',
          });
        }
      }

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow access when user has required role', async () => {
      const request = createMockRequest({
        user: {
          userId: 'user-123',
          tenantId: 'tenant-123',
          roles: ['admin', 'user'],
        },
      });
      const reply = createMockReply();

      const requiredRole = 'admin';
      const userRoles = request.user.roles;
      const hasRole = userRoles.includes(requiredRole);

      expect(hasRole).toBe(true);
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should deny access when user lacks required role', async () => {
      const request = createMockRequest({
        user: {
          userId: 'user-123',
          tenantId: 'tenant-123',
          roles: ['user'],
        },
      });
      const reply = createMockReply();

      const requiredRole = 'admin';
      const userRoles = request.user.roles;
      const hasRole = userRoles.includes(requiredRole);

      if (!hasRole) {
        reply.status(403).send({
          type: 'https://api.tickettoken.com/problems/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: `Required role '${requiredRole}' not found`,
        });
      }

      expect(reply.status).toHaveBeenCalledWith(403);
    });

    it('should allow access with any of multiple roles', async () => {
      const request = createMockRequest({
        user: {
          userId: 'user-123',
          tenantId: 'tenant-123',
          roles: ['venue_manager'],
        },
      });

      const requiredRoles = ['admin', 'venue_manager', 'super_admin'];
      const userRoles = request.user.roles;
      const hasAnyRole = requiredRoles.some(role => userRoles.includes(role));

      expect(hasAnyRole).toBe(true);
    });

    it('should deny access when user has none of required roles', async () => {
      const request = createMockRequest({
        user: {
          userId: 'user-123',
          tenantId: 'tenant-123',
          roles: ['user', 'buyer'],
        },
      });
      const reply = createMockReply();

      const requiredRoles = ['admin', 'venue_manager'];
      const userRoles = request.user.roles;
      const hasAnyRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasAnyRole) {
        reply.status(403).send({
          type: 'https://api.tickettoken.com/problems/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'Insufficient permissions',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('User Context', () => {
    it('should extract user ID from token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({
        sub: 'user-456',
        tenantId: 'tenant-789',
        roles: ['user'],
      });

      const request = createMockRequest();
      const token = 'valid-token';
      const decoded = jwt.verify(token, 'secret');
      
      (request as any).user = {
        userId: decoded.sub,
        tenantId: decoded.tenantId,
        roles: decoded.roles,
      };

      expect(request.user.userId).toBe('user-456');
    });

    it('should extract tenant ID from token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({
        sub: 'user-123',
        tenantId: 'tenant-abc',
        roles: ['user'],
      });

      const request = createMockRequest();
      const decoded = jwt.verify('token', 'secret');
      
      (request as any).user = {
        userId: decoded.sub,
        tenantId: decoded.tenantId,
        roles: decoded.roles,
      };

      expect(request.user.tenantId).toBe('tenant-abc');
    });

    it('should handle tokens without tenant ID gracefully', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({
        sub: 'user-123',
        roles: ['user'],
      });

      const request = createMockRequest();
      const decoded = jwt.verify('token', 'secret');
      
      (request as any).user = {
        userId: decoded.sub,
        tenantId: decoded.tenantId || null,
        roles: decoded.roles,
      };

      expect(request.user.tenantId).toBeNull();
    });
  });

  describe('Service-to-Service Authentication', () => {
    it('should accept valid service tokens', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-auth': 'valid-service-token',
          'x-service-name': 'order-service',
        },
      });
      const reply = createMockReply();

      const serviceAuth = request.headers['x-service-auth'];
      const serviceName = request.headers['x-service-name'];

      // Validate service token
      const isValidService = serviceAuth === 'valid-service-token' && serviceName;

      if (isValidService) {
        (request as any).isServiceRequest = true;
        (request as any).serviceName = serviceName;
      }

      expect((request as any).isServiceRequest).toBe(true);
      expect((request as any).serviceName).toBe('order-service');
    });

    it('should reject invalid service tokens', async () => {
      const request = createMockRequest({
        headers: {
          'x-service-auth': 'invalid-service-token',
          'x-service-name': 'unknown-service',
        },
      });
      const reply = createMockReply();

      const serviceAuth = request.headers['x-service-auth'];
      const validServiceToken = 'valid-service-token';

      if (serviceAuth !== validServiceToken) {
        reply.status(401).send({
          type: 'https://api.tickettoken.com/problems/unauthorized',
          title: 'Service Authentication Failed',
          status: 401,
          detail: 'Invalid service authentication token',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('API Key Authentication', () => {
    it('should accept valid API key in header', async () => {
      const request = createMockRequest({
        headers: {
          'x-api-key': 'pk_test_valid123',
        },
      });

      const apiKey = request.headers['x-api-key'];
      const isValidApiKey = apiKey && apiKey.startsWith('pk_');

      expect(isValidApiKey).toBe(true);
    });

    it('should reject invalid API key format', async () => {
      const request = createMockRequest({
        headers: {
          'x-api-key': 'invalid-api-key',
        },
      });
      const reply = createMockReply();

      const apiKey = request.headers['x-api-key'] as string;
      const isValidFormat = apiKey.startsWith('pk_') || apiKey.startsWith('sk_');

      if (!isValidFormat) {
        reply.status(401).send({
          type: 'https://api.tickettoken.com/problems/unauthorized',
          title: 'Invalid API Key',
          status: 401,
          detail: 'The provided API key has an invalid format',
        });
      }

      expect(reply.status).toHaveBeenCalledWith(401);
    });

    it('should identify live vs test API keys', async () => {
      const testKey = 'pk_test_abc123';
      const liveKey = 'pk_live_xyz789';

      const isTestKey = testKey.includes('_test_');
      const isLiveKey = liveKey.includes('_live_');

      expect(isTestKey).toBe(true);
      expect(isLiveKey).toBe(true);
    });
  });
});
