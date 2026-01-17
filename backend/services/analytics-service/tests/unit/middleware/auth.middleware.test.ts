/**
 * Auth Middleware Unit Tests
 */

import jwt from 'jsonwebtoken';

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret-for-unit-tests-minimum-32-chars',
    },
  },
}));

import { authenticate, authorize, requireTenant, JWT_CONFIG } from '../../../src/middleware/auth.middleware';
import { logger } from '../../../src/utils/logger';

describe('Auth Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
      url: '/api/test',
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('authenticate', () => {
    const validPayload = {
      userId: 'user-123',
      tenantId: 'tenant-456',
      venueId: 'venue-789',
      role: 'admin',
      permissions: ['read', 'write'],
    };

    function createToken(payload: object, options: jwt.SignOptions = {}): string {
      return jwt.sign(payload, 'test-jwt-secret-for-unit-tests-minimum-32-chars', {
        algorithm: 'HS256',
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
        expiresIn: '1h',
        ...options,
      });
    }

    it('should reject request without authorization header', async () => {
      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
        })
      );
    });

    it('should reject request without Bearer scheme', async () => {
      mockRequest.headers.authorization = 'Basic abc123';

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'Authorization header must use Bearer scheme',
        })
      );
    });

    it('should reject empty token', async () => {
      mockRequest.headers.authorization = 'Bearer ';

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'Token is empty',
        })
      );
    });

    it('should reject expired token', async () => {
      const expiredToken = jwt.sign(
        validPayload,
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { expiresIn: '-1h', algorithm: 'HS256' }
      );
      mockRequest.headers.authorization = `Bearer ${expiredToken}`;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Token expired',
        })
      );
    });

    it('should reject invalid token signature', async () => {
      const invalidToken = jwt.sign(validPayload, 'wrong-secret', { algorithm: 'HS256' });
      mockRequest.headers.authorization = `Bearer ${invalidToken}`;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth_failed' }),
        'Authentication failed'
      );
    });

    it('should reject token without user identifier', async () => {
      const tokenWithoutUserId = createToken({ tenantId: 'tenant-123', role: 'user' });
      mockRequest.headers.authorization = `Bearer ${tokenWithoutUserId}`;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: 'Token does not contain a valid user identifier',
        })
      );
    });

    it('should authenticate valid token and set user on request', async () => {
      const validToken = createToken(validPayload);
      mockRequest.headers.authorization = `Bearer ${validToken}`;

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user).toEqual({
        id: 'user-123',
        tenantId: 'tenant-456',
        venueId: 'venue-789',
        role: 'admin',
        permissions: ['read', 'write'],
      });
      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should set venue info when venueId present', async () => {
      const validToken = createToken({ ...validPayload, venueName: 'Test Venue' });
      mockRequest.headers.authorization = `Bearer ${validToken}`;

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.venue).toEqual({
        id: 'venue-789',
        name: 'Test Venue',
      });
    });

    it('should handle alternative field names (sub, tenant_id, venue_id)', async () => {
      const alternativePayload = {
        sub: 'user-alt',
        tenant_id: 'tenant-alt',
        venue_id: 'venue-alt',
        role: 'user',
      };
      const token = createToken(alternativePayload);
      mockRequest.headers.authorization = `Bearer ${token}`;

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.id).toBe('user-alt');
      expect(mockRequest.user.tenantId).toBe('tenant-alt');
      expect(mockRequest.user.venueId).toBe('venue-alt');
    });

    it('should use default role when not provided', async () => {
      const token = createToken({ userId: 'user-123' });
      mockRequest.headers.authorization = `Bearer ${token}`;

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user.role).toBe('user');
    });

    it('should log successful authentication', async () => {
      const validToken = createToken(validPayload);
      mockRequest.headers.authorization = `Bearer ${validToken}`;

      await authenticate(mockRequest, mockReply);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth_success',
          userId: 'user-123',
          tenantId: 'tenant-456',
        })
      );
    });
  });

  describe('authorize', () => {
    beforeEach(() => {
      mockRequest.user = {
        id: 'user-123',
        role: 'user',
        permissions: ['read', 'analytics:view'],
      };
    });

    it('should reject if user not authenticated', async () => {
      mockRequest.user = undefined;
      const middleware = authorize('read');

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
    });

    it('should allow admin role to bypass permissions', async () => {
      mockRequest.user.role = 'admin';
      mockRequest.user.permissions = [];
      const middleware = authorize('super:secret');

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow super_admin role to bypass permissions', async () => {
      mockRequest.user.role = 'super_admin';
      mockRequest.user.permissions = [];
      const middleware = authorize(['admin:only']);

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow if user has required permission', async () => {
      const middleware = authorize('analytics:view');

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow if user has wildcard permission', async () => {
      mockRequest.user.permissions = ['*'];
      const middleware = authorize('any:permission');

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should allow if user has one of multiple required permissions', async () => {
      const middleware = authorize(['write', 'read', 'delete']);

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should reject if user lacks required permission', async () => {
      const middleware = authorize('write');

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Insufficient permissions',
        })
      );
    });

    it('should log authorization denial', async () => {
      const middleware = authorize('admin:delete');

      await middleware(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'authorization_denied',
          userId: 'user-123',
        })
      );
    });
  });

  describe('requireTenant', () => {
    it('should reject if tenantId not present', async () => {
      mockRequest.tenantId = undefined;

      await requireTenant(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Tenant context required',
        })
      );
    });

    it('should allow if tenantId is present', async () => {
      mockRequest.tenantId = 'tenant-123';

      await requireTenant(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('JWT_CONFIG', () => {
    it('should have secure algorithm settings', () => {
      expect(JWT_CONFIG.algorithms).toContain('RS256');
      expect(JWT_CONFIG.algorithms).toContain('HS256');
      expect(JWT_CONFIG.algorithms).not.toContain('none');
    });

    it('should have clock tolerance configured', () => {
      expect(JWT_CONFIG.clockTolerance).toBe(30);
    });

    it('should have max age configured', () => {
      expect(JWT_CONFIG.maxAge).toBe('24h');
    });
  });
});
