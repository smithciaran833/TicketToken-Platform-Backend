import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { authenticate, requireAdmin, requireVenueManager } from '../../../src/middleware/auth.middleware';

// Mock JWT_SECRET
process.env.JWT_SECRET = 'test-secret-key';

describe('Authentication Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let replySendSpy: jest.Mock;
  let replyCodeSpy: jest.Mock;

  beforeEach(() => {
    replySendSpy = jest.fn();
    replyCodeSpy = jest.fn().mockReturnValue({ send: replySendSpy });
    
    mockRequest = {
      headers: {},
      url: '/test',
      method: 'GET'
    };
    
    mockReply = {
      code: replyCodeSpy,
      send: replySendSpy
    };
  });

  describe('authenticate', () => {
    it('should return 401 when no token is provided', async () => {
      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).toHaveBeenCalledWith(401);
      expect(replySendSpy).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'No authorization token provided'
      });
    });

    it('should return 401 when token is invalid', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).toHaveBeenCalledWith(401);
      expect(replySendSpy).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Authentication token is invalid'
      });
    });

    it('should return 401 when token is expired', async () => {
      const expiredToken = jwt.sign(
        { id: 'user-123', email: 'test@example.com' },
        'test-secret-key',
        { expiresIn: '0s' }
      );

      mockRequest.headers = {
        authorization: `Bearer ${expiredToken}`
      };

      // Wait a moment to ensure token expires
      await new Promise(resolve => setTimeout(resolve, 100));

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).toHaveBeenCalledWith(401);
      expect(replySendSpy).toHaveBeenCalledWith({
        error: 'Token expired',
        message: 'Authentication token has expired'
      });
    });

    it('should return 401 when token is missing user ID', async () => {
      const tokenWithoutId = jwt.sign(
        { email: 'test@example.com' },
        'test-secret-key'
      );

      mockRequest.headers = {
        authorization: `Bearer ${tokenWithoutId}`
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).toHaveBeenCalledWith(401);
      expect(replySendSpy).toHaveBeenCalledWith({
        error: 'Invalid token',
        message: 'Token missing user ID'
      });
    });

    it('should set user on request when token is valid', async () => {
      const validToken = jwt.sign(
        {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: 'tenant-456',
          roles: ['user']
        },
        'test-secret-key'
      );

      mockRequest.headers = {
        authorization: `Bearer ${validToken}`
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.id).toBe('user-123');
      expect(mockRequest.user?.email).toBe('test@example.com');
      expect(mockRequest.tenantId).toBe('tenant-456');
      expect(replyCodeSpy).not.toHaveBeenCalled();
    });

    it('should handle Bearer token with extra spaces', async () => {
      const validToken = jwt.sign(
        { id: 'user-123', email: 'test@example.com' },
        'test-secret-key'
      );

      mockRequest.headers = {
        authorization: `  Bearer  ${validToken}  `
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.id).toBe('user-123');
    });
  });

  describe('requireAdmin', () => {
    it('should return 403 when user is not admin', async () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
        roles: ['user']
      };

      await requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).toHaveBeenCalledWith(403);
      expect(replySendSpy).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Admin access required'
      });
    });

    it('should allow access when user is admin', async () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'admin@example.com',
        roles: ['admin']
      };

      await requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).not.toHaveBeenCalled();
    });

    it('should return 403 when user has no roles', async () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com'
      };

      await requireAdmin(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).toHaveBeenCalledWith(403);
    });
  });

  describe('requireVenueManager', () => {
    it('should allow access when user is admin', async () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'admin@example.com',
        roles: ['admin']
      };

      await requireVenueManager(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).not.toHaveBeenCalled();
    });

    it('should allow access when user is venue_manager', async () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'manager@example.com',
        roles: ['venue_manager']
      };

      await requireVenueManager(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).not.toHaveBeenCalled();
    });

    it('should return 403 when user has neither role', async () => {
      mockRequest.user = {
        id: 'user-123',
        email: 'user@example.com',
        roles: ['user']
      };

      await requireVenueManager(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replyCodeSpy).toHaveBeenCalledWith(403);
      expect(replySendSpy).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Venue manager access required'
      });
    });
  });
});
