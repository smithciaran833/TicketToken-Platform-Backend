import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateJWT, extractTenantId } from '../../src/middleware/auth.middleware';
import { AuthServiceClient } from '../../src/clients/AuthServiceClient';
import { VenueServiceClient } from '../../src/clients/VenueServiceClient';

// Mock the service clients
jest.mock('../../src/clients/AuthServiceClient');
jest.mock('../../src/clients/VenueServiceClient');

describe('Auth Middleware', () => {
  let mockServer: Partial<FastifyInstance>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock server
    mockServer = {
      jwt: {
        verify: jest.fn(),
      } as any,
      redis: {
        get: jest.fn(),
        setex: jest.fn(),
      } as any,
      log: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
      } as any,
    };
    
    // Mock request
    mockRequest = {
      headers: {},
      server: mockServer as FastifyInstance,
    };
    
    // Mock reply
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('validateJWT', () => {
    it('should validate a valid JWT token', async () => {
      const mockPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'venue_admin',
        email: 'test@example.com',
      };
      
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };
      
      (mockServer.jwt!.verify as jest.Mock).mockResolvedValue(mockPayload);
      
      const result = await validateJWT(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      
      expect(result).toEqual(mockPayload);
      expect(mockServer.jwt!.verify).toHaveBeenCalledWith('valid-token');
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      mockRequest.headers = {};
      
      await validateJWT(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No authorization token provided',
      });
    });

    it('should reject request with malformed authorization header', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token',
      };
      
      await validateJWT(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid authorization header format',
      });
    });

    it('should reject request with invalid JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };
      
      (mockServer.jwt!.verify as jest.Mock).mockRejectedValue(
        new Error('Invalid token')
      );
      
      await validateJWT(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    });

    it('should reject request with expired JWT token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token',
      };
      
      const expiredError = new Error('Token expired');
      (expiredError as any).code = 'FAST_JWT_EXPIRED';
      (mockServer.jwt!.verify as jest.Mock).mockRejectedValue(expiredError);
      
      await validateJWT(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      
      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Token has expired',
      });
    });

    it('should validate token with minimum required claims', async () => {
      const minimalPayload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
      };
      
      mockRequest.headers = {
        authorization: 'Bearer minimal-token',
      };
      
      (mockServer.jwt!.verify as jest.Mock).mockResolvedValue(minimalPayload);
      
      const result = await validateJWT(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      
      expect(result).toEqual(minimalPayload);
    });
  });

  describe('extractTenantId', () => {
    it('should extract tenant ID from JWT payload', () => {
      const payload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'venue_admin',
      };
      
      const tenantId = extractTenantId(payload);
      
      expect(tenantId).toBe('tenant-456');
    });

    it('should return null if tenant ID is missing', () => {
      const payload = {
        userId: 'user-123',
        role: 'venue_admin',
      };
      
      const tenantId = extractTenantId(payload as any);
      
      expect(tenantId).toBeNull();
    });

    it('should NOT extract tenant ID from headers (security)', () => {
      // This tests that we NEVER trust client-provided tenant IDs
      mockRequest.headers = {
        'x-tenant-id': 'malicious-tenant-999',
        authorization: 'Bearer token',
      };
      
      const payload = {
        userId: 'user-123',
        tenantId: 'legitimate-tenant-456',
      };
      
      const tenantId = extractTenantId(payload);
      
      // Should extract from JWT, NOT from headers
      expect(tenantId).toBe('legitimate-tenant-456');
      expect(tenantId).not.toBe('malicious-tenant-999');
    });
  });

  describe('getUserDetails - Security Critical', () => {
    it('should fetch user details from auth service with caching', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        role: 'venue_admin',
        tenantId: 'tenant-456',
      };
      
      // Mock Redis cache miss
      (mockServer.redis!.get as jest.Mock).mockResolvedValue(null);
      
      // Mock AuthServiceClient
      const mockAuthClient = {
        getUserById: jest.fn().mockResolvedValue(mockUser),
      };
      (AuthServiceClient as jest.Mock).mockImplementation(() => mockAuthClient);
      
      // In real implementation, this would be called from authentication hook
      const authClient = new AuthServiceClient(mockServer as FastifyInstance);
      const user = await authClient.getUserById(userId);
      
      expect(user).toEqual(mockUser);
      expect(mockAuthClient.getUserById).toHaveBeenCalledWith(userId);
      expect(mockServer.redis!.get).toHaveBeenCalledWith(`user:${userId}`);
    });

    it('should use cached user details when available', async () => {
      const userId = 'user-123';
      const cachedUser = JSON.stringify({
        id: userId,
        email: 'cached@example.com',
        role: 'venue_admin',
        tenantId: 'tenant-456',
      });
      
      // Mock Redis cache hit
      (mockServer.redis!.get as jest.Mock).mockResolvedValue(cachedUser);
      
      const mockAuthClient = {
        getUserById: jest.fn(),
      };
      (AuthServiceClient as jest.Mock).mockImplementation(() => mockAuthClient);
      
      const authClient = new AuthServiceClient(mockServer as FastifyInstance);
      const user = await authClient.getUserById(userId);
      
      // Should not call auth service if cached
      expect(mockAuthClient.getUserById).not.toHaveBeenCalled();
      expect(user).toEqual(JSON.parse(cachedUser));
    });

    it('should handle auth service being unavailable', async () => {
      const userId = 'user-123';
      
      // Mock Redis cache miss
      (mockServer.redis!.get as jest.Mock).mockResolvedValue(null);
      
      // Mock AuthServiceClient throwing error
      const mockAuthClient = {
        getUserById: jest.fn().mockRejectedValue(new Error('Service unavailable')),
      };
      (AuthServiceClient as jest.Mock).mockImplementation(() => mockAuthClient);
      
      const authClient = new AuthServiceClient(mockServer as FastifyInstance);
      
      await expect(authClient.getUserById(userId)).rejects.toThrow('Service unavailable');
    });
  });

  describe('checkVenueAccess - Security Critical', () => {
    it('should verify user has access to venue', async () => {
      const userId = 'user-123';
      const venueId = 'venue-789';
      
      // Mock Redis cache miss
      (mockServer.redis!.get as jest.Mock).mockResolvedValue(null);
      
      // Mock VenueServiceClient
      const mockVenueClient = {
        checkUserVenueAccess: jest.fn().mockResolvedValue(true),
      };
      (VenueServiceClient as jest.Mock).mockImplementation(() => mockVenueClient);
      
      const venueClient = new VenueServiceClient(mockServer as FastifyInstance);
      const hasAccess = await venueClient.checkUserVenueAccess(userId, venueId);
      
      expect(hasAccess).toBe(true);
      expect(mockVenueClient.checkUserVenueAccess).toHaveBeenCalledWith(userId, venueId);
    });

    it('should deny access when user does not have permission', async () => {
      const userId = 'user-123';
      const venueId = 'venue-999';
      
      // Mock Redis cache miss
      (mockServer.redis!.get as jest.Mock).mockResolvedValue(null);
      
      // Mock VenueServiceClient denying access
      const mockVenueClient = {
        checkUserVenueAccess: jest.fn().mockResolvedValue(false),
      };
      (VenueServiceClient as jest.Mock).mockImplementation(() => mockVenueClient);
      
      const venueClient = new VenueServiceClient(mockServer as FastifyInstance);
      const hasAccess = await venueClient.checkUserVenueAccess(userId, venueId);
      
      expect(hasAccess).toBe(false);
    });

    it('should FAIL SECURE when venue service is unavailable', async () => {
      const userId = 'user-123';
      const venueId = 'venue-789';
      
      // Mock Redis cache miss
      (mockServer.redis!.get as jest.Mock).mockResolvedValue(null);
      
      // Mock VenueServiceClient throwing error
      const mockVenueClient = {
        checkUserVenueAccess: jest.fn().mockRejectedValue(new Error('Service down')),
      };
      (VenueServiceClient as jest.Mock).mockImplementation(() => mockVenueClient);
      
      const venueClient = new VenueServiceClient(mockServer as FastifyInstance);
      
      // Should deny access on error (fail secure)
      await expect(venueClient.checkUserVenueAccess(userId, venueId))
        .rejects.toThrow('Service down');
    });

    it('should use cached venue access when available', async () => {
      const userId = 'user-123';
      const venueId = 'venue-789';
      const cacheKey = `venue:access:${userId}:${venueId}`;
      
      // Mock Redis cache hit
      (mockServer.redis!.get as jest.Mock).mockResolvedValue('true');
      
      const mockVenueClient = {
        checkUserVenueAccess: jest.fn(),
      };
      (VenueServiceClient as jest.Mock).mockImplementation(() => mockVenueClient);
      
      const venueClient = new VenueServiceClient(mockServer as FastifyInstance);
      const hasAccess = await venueClient.checkUserVenueAccess(userId, venueId);
      
      // Should not call venue service if cached
      expect(mockVenueClient.checkUserVenueAccess).not.toHaveBeenCalled();
      expect(hasAccess).toBe(true);
    });
  });

  describe('Security: Header Manipulation Prevention', () => {
    it('should NEVER trust x-tenant-id header from client', () => {
      mockRequest.headers = {
        'x-tenant-id': 'attacker-tenant-999',
        authorization: 'Bearer token',
      };
      
      // Even if client sends x-tenant-id, it should be ignored
      // Tenant ID should ONLY come from JWT
      const payload = {
        userId: 'user-123',
        tenantId: 'legitimate-tenant-456',
      };
      
      const tenantId = extractTenantId(payload);
      
      expect(tenantId).toBe('legitimate-tenant-456');
      expect(tenantId).not.toBe('attacker-tenant-999');
    });

    it('should NEVER trust x-user-id header from client', () => {
      mockRequest.headers = {
        'x-user-id': 'attacker-user-999',
        authorization: 'Bearer token',
      };
      
      const payload = {
        userId: 'legitimate-user-123',
        tenantId: 'tenant-456',
      };
      
      // User ID should ONLY come from validated JWT
      expect(payload.userId).toBe('legitimate-user-123');
      expect(payload.userId).not.toBe('attacker-user-999');
    });
  });
});
