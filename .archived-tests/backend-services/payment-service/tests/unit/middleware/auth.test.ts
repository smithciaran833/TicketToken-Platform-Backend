import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import fs from 'fs';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('fs');
jest.mock('jsonwebtoken');

const mockPublicKey = 'mock-public-key';
(fs.readFileSync as jest.Mock).mockReturnValue(mockPublicKey);

// =============================================================================
// TEST SUITE
// =============================================================================

describe('auth middleware', () => {
  let authenticate: any;
  let requireRole: any;
  let requireVenueAccess: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to get fresh import
    jest.isolateModules(() => {
      const authModule = require('../../../src/middleware/auth');
      authenticate = authModule.authenticate;
      requireRole = authModule.requireRole;
      requireVenueAccess = authModule.requireVenueAccess;
    });

    mockRequest = {
      headers: {},
      params: {},
      body: {},
    } as any;

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;
  });

  // ===========================================================================
  // authenticate() - Success Cases - 5 test cases
  // ===========================================================================

  describe('authenticate() - Success', () => {
    it('should authenticate valid token', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        role: 'customer',
      });

      await authenticate(mockRequest, mockReply);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-token',
        mockPublicKey,
        expect.objectContaining({
          algorithms: ['RS256'],
        })
      );
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should attach user to request', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      const decodedToken = { userId: 'user-456', role: 'admin' };
      (jwt.verify as jest.Mock).mockReturnValue(decodedToken);

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.user).toEqual(decodedToken);
    });

    it('should extract userId from decoded token', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user-789' });

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.userId).toBe('user-789');
    });

    it('should extract userId from id field', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'user-111' });

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.userId).toBe('user-111');
    });

    it('should extract tenantId from decoded token', async () => {
      mockRequest.headers.authorization = 'Bearer valid-token';
      (jwt.verify as jest.Mock).mockReturnValue({ tenantId: 'tenant-123' });

      await authenticate(mockRequest, mockReply);

      expect(mockRequest.tenantId).toBe('tenant-123');
    });
  });

  // ===========================================================================
  // authenticate() - Error Cases - 5 test cases
  // ===========================================================================

  describe('authenticate() - Error Cases', () => {
    it('should reject request without authorization header', async () => {
      delete mockRequest.headers.authorization;

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should reject request without Bearer prefix', async () => {
      mockRequest.headers.authorization = 'InvalidToken';

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    it('should reject expired token', async () => {
      mockRequest.headers.authorization = 'Bearer expired-token';
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      (jwt.verify as jest.Mock).mockImplementation(() => { throw error; });

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should reject invalid token', async () => {
      mockRequest.headers.authorization = 'Bearer invalid-token';
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      (jwt.verify as jest.Mock).mockImplementation(() => { throw error; });

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should handle generic authentication errors', async () => {
      mockRequest.headers.authorization = 'Bearer token';
      (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('Generic error'); });

      await authenticate(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication error' });
    });
  });

  // ===========================================================================
  // requireRole() - 5 test cases
  // ===========================================================================

  describe('requireRole()', () => {
    it('should allow user with required role', async () => {
      mockRequest.user = { role: 'admin' };
      const middleware = requireRole(['admin', 'moderator']);

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject user without authentication', async () => {
      delete mockRequest.user;
      const middleware = requireRole(['admin']);

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_AUTH',
      });
    });

    it('should reject user with wrong role', async () => {
      mockRequest.user = { role: 'customer' };
      const middleware = requireRole(['admin', 'moderator']);

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: ['admin', 'moderator'],
        userRole: 'customer',
      });
    });

    it('should allow any role in the list', async () => {
      mockRequest.user = { role: 'moderator' };
      const middleware = requireRole(['admin', 'moderator', 'support']);

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should handle single role requirement', async () => {
      mockRequest.user = { role: 'admin' };
      const middleware = requireRole(['admin']);

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // requireVenueAccess() - 6 test cases
  // ===========================================================================

  describe('requireVenueAccess()', () => {
    it('should allow access for admin users', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = { isAdmin: true, role: 'customer' };

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow access for users with admin role', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = { role: 'admin' };

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should allow access when user has venue in their list', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = { role: 'venue_owner', venues: ['venue-123', 'venue-456'] };

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should reject when venueId is missing', async () => {
      mockRequest.user = { role: 'customer' };

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Venue ID required',
        code: 'VENUE_ID_MISSING',
      });
    });

    it('should reject unauthenticated users', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      delete mockRequest.user;

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject when user does not have venue access', async () => {
      mockRequest.params = { venueId: 'venue-999' };
      mockRequest.user = { role: 'venue_owner', venues: ['venue-123', 'venue-456'] };

      await requireVenueAccess(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Access denied to this venue',
        code: 'VENUE_ACCESS_DENIED',
        venueId: 'venue-999',
      });
    });
  });
});
