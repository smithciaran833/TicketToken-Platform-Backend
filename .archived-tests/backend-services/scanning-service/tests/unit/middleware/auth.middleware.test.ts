import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  authenticateRequest,
  requireRole,
  requirePermission,
  optionalAuthentication,
  JWTPayload
} from '../../../src/middleware/auth.middleware';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../../src/utils/logger');

describe('Auth Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    // Setup mock reply
    sendMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock
    } as any;

    mockRequest = {
      headers: {},
      url: '/test-endpoint'
    };

    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
  });

  describe('authenticateRequest', () => {
    it('should authenticate valid JWT token', async () => {
      const validPayload: JWTPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        venueId: 'venue-789',
        permissions: ['scan:tickets']
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      (jwt.verify as jest.Mock).mockReturnValue(validPayload);

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret-key');
      expect(mockRequest.user).toEqual(validPayload);
      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      mockRequest.headers = {};

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authorization token provided'
      });
    });

    it('should reject request with invalid authorization format', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token123'
      };

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid authorization header format. Expected: Bearer <token>'
      });
    });

    it('should reject request when JWT_SECRET is not configured', async () => {
      delete process.env.JWT_SECRET;

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Configuration Error',
        message: 'Authentication system not properly configured'
      });
    });

    it('should reject expired token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError('jwt expired', new Date());
      });

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Token has expired'
      });
    });

    it('should reject malformed token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer malformed-token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('jwt malformed');
      });

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    });

    it('should reject token with missing userId', async () => {
      const invalidPayload = {
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: []
      };

      mockRequest.headers = {
        authorization: 'Bearer token'
      };

      (jwt.verify as jest.Mock).mockReturnValue(invalidPayload);

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid token payload'
      });
    });

    it('should reject token with missing tenantId', async () => {
      const invalidPayload = {
        userId: 'user-123',
        role: 'VENUE_STAFF',
        permissions: []
      };

      mockRequest.headers = {
        authorization: 'Bearer token'
      };

      (jwt.verify as jest.Mock).mockReturnValue(invalidPayload);

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid token payload'
      });
    });

    it('should reject token with missing role', async () => {
      const invalidPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        permissions: []
      };

      mockRequest.headers = {
        authorization: 'Bearer token'
      };

      (jwt.verify as jest.Mock).mockReturnValue(invalidPayload);

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid token payload'
      });
    });

    it('should handle unexpected errors gracefully', async () => {
      mockRequest.headers = {
        authorization: 'Bearer token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await authenticateRequest(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication failed'
      });
    });
  });

  describe('requireRole', () => {
    it('should allow request with correct role', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: []
      };

      const middleware = requireRole('VENUE_STAFF', 'ADMIN');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow request with any of the allowed roles', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'ADMIN',
        permissions: []
      };

      const middleware = requireRole('VENUE_STAFF', 'ADMIN');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject request without user', async () => {
      const middleware = requireRole('ADMIN');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Not authenticated'
      });
    });

    it('should reject request with insufficient role', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'CUSTOMER',
        permissions: []
      };

      const middleware = requireRole('VENUE_STAFF', 'ADMIN');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: ['VENUE_STAFF', 'ADMIN'],
        current: 'CUSTOMER'
      });
    });

    it('should work with single role requirement', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'ADMIN',
        permissions: []
      };

      const middleware = requireRole('ADMIN');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should allow request with all required permissions', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: ['scan:tickets', 'view:events', 'manage:devices']
      };

      const middleware = requirePermission('scan:tickets', 'view:events');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow request with single permission', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: ['scan:tickets']
      };

      const middleware = requirePermission('scan:tickets');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject request without user', async () => {
      const middleware = requirePermission('scan:tickets');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Not authenticated'
      });
    });

    it('should reject request missing one required permission', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: ['scan:tickets']
      };

      const middleware = requirePermission('scan:tickets', 'manage:devices');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Missing required permissions',
        required: ['scan:tickets', 'manage:devices']
      });
    });

    it('should reject request with no permissions', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: []
      };

      const middleware = requirePermission('scan:tickets');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Missing required permissions',
        required: ['scan:tickets']
      });
    });

    it('should handle user with undefined permissions', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: undefined as any
      };

      const middleware = requirePermission('scan:tickets');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe('optionalAuthentication', () => {
    it('should authenticate valid token when provided', async () => {
      const validPayload: JWTPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'VENUE_STAFF',
        permissions: ['scan:tickets']
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      (jwt.verify as jest.Mock).mockReturnValue(validPayload);

      await optionalAuthentication(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toEqual(validPayload);
      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should continue without user when no token provided', async () => {
      mockRequest.headers = {};

      await optionalAuthentication(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should continue without user when invalid token format', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token'
      };

      await optionalAuthentication(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should continue without user when JWT_SECRET not configured', async () => {
      delete process.env.JWT_SECRET;

      mockRequest.headers = {
        authorization: 'Bearer token'
      };

      await optionalAuthentication(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should continue without user when token is invalid', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid token');
      });

      await optionalAuthentication(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should continue without user when token is expired', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new jwt.TokenExpiredError('token expired', new Date());
      });

      await optionalAuthentication(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeUndefined();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});
