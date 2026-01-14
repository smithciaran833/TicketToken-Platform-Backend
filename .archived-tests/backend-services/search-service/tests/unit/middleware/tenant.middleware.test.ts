/**
 * Tenant Middleware Tests
 * Tests tenant isolation and validation logic
 */

import { requireTenant, optionalTenant } from '../../../src/middleware/tenant.middleware';
import { AuthenticatedRequest } from '../../../src/middleware/auth.middleware';
import { createMockRequest, createMockReply } from '../../setup';
import * as tenantFilter from '../../../src/utils/tenant-filter';

// Mock tenant-filter utilities
jest.mock('../../../src/utils/tenant-filter');
const mockedTenantFilter = tenantFilter as jest.Mocked<typeof tenantFilter>;

describe('Tenant Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTenantFilter.validateVenueId.mockImplementation((venueId) => venueId); // Return venueId by default
  });

  describe('requireTenant', () => {
    it('should allow request with valid user and venueId', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'venue-uuid-123',
        role: 'user'
      };
      const reply = createMockReply();

      await requireTenant(request, reply as any);

      expect(mockedTenantFilter.validateVenueId).toHaveBeenCalledWith('venue-uuid-123');
      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should reject request without authenticated user', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      // No user set
      const reply = createMockReply();

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should reject request without venueId', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        role: 'user'
        // No venueId
      };
      const reply = createMockReply();

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Tenant information missing',
        message: 'User must be associated with a venue'
      });
    });

    it('should reject request with invalid venueId format', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'invalid-venue-id',
        role: 'user'
      };
      const reply = createMockReply();

      mockedTenantFilter.validateVenueId.mockImplementation(() => {
        throw new Error('Invalid venueId format');
      });

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Invalid tenant information',
        message: 'Invalid venueId format'
      });
    });

    it('should validate venueId format using tenant-filter', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'venue-abc-123',
        role: 'user'
      };
      const reply = createMockReply();

      await requireTenant(request, reply as any);

      expect(mockedTenantFilter.validateVenueId).toHaveBeenCalledWith('venue-abc-123');
    });

    it('should handle validation errors gracefully', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'malformed',
        role: 'user'
      };
      const reply = createMockReply();

      mockedTenantFilter.validateVenueId.mockImplementation(() => {
        throw new Error('VenueId contains invalid characters');
      });

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Invalid tenant information',
        message: 'VenueId contains invalid characters'
      });
    });

    it('should reject empty string venueId', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: '',
        role: 'user'
      };
      const reply = createMockReply();

      mockedTenantFilter.validateVenueId.mockImplementation(() => {
        throw new Error('VenueId cannot be empty');
      });

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should work with admin users that have venueId', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'admin-123',
        venueId: 'venue-admin',
        role: 'admin'
      };
      const reply = createMockReply();

      await requireTenant(request, reply as any);

      expect(mockedTenantFilter.validateVenueId).toHaveBeenCalled();
      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('optionalTenant', () => {
    it('should allow request without authenticated user', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      // No user set
      const reply = createMockReply();

      await optionalTenant(request, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should allow request with authenticated user but no venueId', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        role: 'user'
        // No venueId
      };
      const reply = createMockReply();

      await optionalTenant(request, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
      expect(mockedTenantFilter.validateVenueId).not.toHaveBeenCalled();
    });

    it('should validate venueId if present', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'venue-123',
        role: 'user'
      };
      const reply = createMockReply();

      await optionalTenant(request, reply as any);

      expect(mockedTenantFilter.validateVenueId).toHaveBeenCalledWith('venue-123');
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should reject if venueId is present but invalid', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: 'invalid-format',
        role: 'user'
      };
      const reply = createMockReply();

      mockedTenantFilter.validateVenueId.mockImplementation(() => {
        throw new Error('Invalid venueId format');
      });

      await optionalTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Invalid tenant information',
        message: 'Invalid venueId format'
      });
    });

    it('should handle undefined user gracefully', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = undefined;
      const reply = createMockReply();

      await optionalTenant(request, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should handle null user gracefully', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = null as any;
      const reply = createMockReply();

      await optionalTenant(request, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  describe('Security edge cases', () => {
    it('should reject SQL injection attempts in venueId', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: "venue'; DROP TABLE users;--",
        role: 'user'
      };
      const reply = createMockReply();

      mockedTenantFilter.validateVenueId.mockImplementation(() => {
        throw new Error('Invalid characters in venueId');
      });

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should reject script injection in venueId', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: '<script>alert(1)</script>',
        role: 'user'
      };
      const reply = createMockReply();

      mockedTenantFilter.validateVenueId.mockImplementation(() => {
        throw new Error('Invalid characters in venueId');
      });

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should reject path traversal attempts', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      request.user = {
        id: 'user-123',
        venueId: '../../../etc/passwd',
        role: 'user'
      };
      const reply = createMockReply();

      mockedTenantFilter.validateVenueId.mockImplementation(() => {
        throw new Error('Invalid characters in venueId');
      });

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Middleware ordering', () => {
    it('should assume authentication middleware ran first', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      // Simulate state after auth middleware
      request.user = {
        id: 'user-123',
        venueId: 'venue-123',
        role: 'user'
      };
      const reply = createMockReply();

      await requireTenant(request, reply as any);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should handle case where auth middleware was skipped', async () => {
      const request = createMockRequest({}) as AuthenticatedRequest;
      // No user - auth middleware didn't run or failed
      const reply = createMockReply();

      await requireTenant(request, reply as any);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });
  });
});
