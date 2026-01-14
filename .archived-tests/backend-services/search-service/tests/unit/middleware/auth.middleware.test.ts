/**
 * Authentication Middleware Tests
 * Tests JWT validation and authentication logic
 */

import { authenticate, authorize, AuthenticatedRequest } from '../../../src/middleware/auth.middleware';
import { createMockRequest, createMockReply, testUsers } from '../../setup';
import jwt from 'jsonwebtoken';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.NODE_ENV = 'test';
  });

  describe('authenticate', () => {
    it('should authenticate valid request with Bearer token', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer valid.token.here'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockReturnValue({
        id: 'user-123',
        venueId: 'venue-1',
        role: 'user'
      } as any);

      await authenticate(request, reply as any);

      expect(request.user).toBeDefined();
      expect(request.user?.id).toBe('user-123');
      expect(request.user?.venueId).toBe('venue-1');
      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      const request = createMockRequest({
        headers: {}
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      await authenticate(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should reject request with invalid token', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer invalid.token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticate(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Invalid token'
      });
    });

    it('should handle expired tokens', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer expired.token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      const error: any = new Error('Token expired');
      error.name = 'TokenExpiredError';
      mockedJwt.verify.mockImplementation(() => {
        throw error;
      });

      await authenticate(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Token expired'
      });
    });

    it('should handle userId field in token payload', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockReturnValue({
        userId: 'user-456',
        venueId: 'venue-1',
        role: 'user'
      } as any);

      await authenticate(request, reply as any);

      expect(request.user?.id).toBe('user-456');
    });

    it('should set default role to user if not provided', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockReturnValue({
        id: 'user-123',
        venueId: 'venue-1'
      } as any);

      await authenticate(request, reply as any);

      expect(request.user?.role).toBe('user');
    });

    it('should set empty permissions array if not provided', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockReturnValue({
        id: 'user-123',
        venueId: 'venue-1',
        role: 'user'
      } as any);

      await authenticate(request, reply as any);

      expect(request.user?.permissions).toEqual([]);
    });

    it('should warn when JWT_SECRET is not set in development', async () => {
      delete process.env.JWT_SECRET;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockReturnValue({
        id: 'user-123',
        role: 'user'
      } as any);

      await authenticate(request, reply as any);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Using default JWT secret')
      );
      consoleSpy.mockRestore();
    });

    it('should throw error when JWT_SECRET missing in production', async () => {
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';

      const request = createMockRequest({
        headers: {
          authorization: 'Bearer token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      await authenticate(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('authorize', () => {
    it('should allow user with matching role', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'venue-1',
        role: 'admin'
      };
      const reply = createMockReply();

      const middleware = authorize('admin', 'super_admin');
      await middleware(request, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should reject user without matching role', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'venue-1',
        role: 'user'
      };
      const reply = createMockReply();

      const middleware = authorize('admin', 'super_admin');
      await middleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Insufficient permissions'
      });
    });

    it('should reject unauthenticated request', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      // No user set
      const reply = createMockReply();

      const middleware = authorize('admin');
      await middleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should handle multiple allowed roles', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        role: 'manager'
      };
      const reply = createMockReply();

      const middleware = authorize('admin', 'manager', 'super_admin');
      await middleware(request, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should be case-sensitive for roles', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        role: 'Admin'
      };
      const reply = createMockReply();

      const middleware = authorize('admin');
      await middleware(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Token extraction', () => {
    it('should extract token after Bearer prefix', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'Bearer my.jwt.token'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockReturnValue({
        id: 'user-123',
        role: 'user'
      } as any);

      await authenticate(request, reply as any);

      expect(mockedJwt.verify).toHaveBeenCalledWith(
        'my.jwt.token',
        expect.any(String)
      );
    });

    it('should handle missing Bearer prefix gracefully', async () => {
      const request = createMockRequest({
        headers: {
          authorization: 'invalid-format'
        }
      }) as AuthenticatedRequest;
      const reply = createMockReply();

      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticate(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });
});
