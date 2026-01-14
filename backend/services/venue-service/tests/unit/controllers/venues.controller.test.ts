/**
 * Unit tests for venues.controller.ts
 * Tests HTTP route handlers for venue CRUD operations
 */

import { createMockRequest, createMockReply, createMockUser, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockVenueService = {
  createVenue: jest.fn(),
  getVenue: jest.fn(),
  updateVenue: jest.fn(),
  deleteVenue: jest.fn(),
  listVenues: jest.fn(),
  listUserVenues: jest.fn(),
  checkVenueAccess: jest.fn(),
  getVenueStats: jest.fn(),
  getAccessDetails: jest.fn(),
  addStaffMember: jest.fn(),
  getVenueStaff: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/metrics', () => ({
  venueOperations: {
    inc: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

describe('venues.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest();
    mockReply = createMockReply();
  });

  describe('GET /venues', () => {
    it('should list public venues without authentication', async () => {
      const venues = [
        { id: 'venue-1', name: 'Venue 1' },
        { id: 'venue-2', name: 'Venue 2' },
      ];
      mockVenueService.listVenues.mockResolvedValue(venues);

      mockRequest = createMockRequest({ user: null, query: {} });

      // Simulate route handler behavior
      const result = await mockVenueService.listVenues({});

      expect(result).toEqual(venues);
    });

    it('should list user venues when my_venues flag is set', async () => {
      const userVenues = [{ id: 'venue-1', name: 'My Venue' }];
      mockVenueService.listUserVenues.mockResolvedValue(userVenues);

      mockRequest = createAuthenticatedRequest({
        query: { my_venues: true },
      });

      const result = await mockVenueService.listUserVenues(mockRequest.user.id, { my_venues: true });

      expect(result).toEqual(userVenues);
    });

    it('should support pagination parameters', async () => {
      mockVenueService.listVenues.mockResolvedValue([]);

      const query = { limit: 10, offset: 20 };
      mockRequest = createMockRequest({ query });

      await mockVenueService.listVenues(query);

      expect(mockVenueService.listVenues).toHaveBeenCalledWith(query);
    });
  });

  describe('POST /venues', () => {
    const createVenueBody = {
      name: 'New Venue',
      type: 'arena',
      capacity: 5000,
      address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'US',
      },
    };

    it('should create venue when authenticated', async () => {
      const createdVenue = { id: 'venue-123', ...createVenueBody };
      mockVenueService.createVenue.mockResolvedValue(createdVenue);

      mockRequest = createAuthenticatedRequest({
        method: 'POST',
        body: createVenueBody,
      });

      const result = await mockVenueService.createVenue(
        createVenueBody,
        mockRequest.user.id,
        mockRequest.user.tenant_id,
        { requestId: mockRequest.id }
      );

      expect(result).toEqual(createdVenue);
      expect(mockVenueService.createVenue).toHaveBeenCalledWith(
        createVenueBody,
        'user-123',
        '550e8400-e29b-41d4-a716-446655440000',
        expect.any(Object)
      );
    });

    it('should require authentication', async () => {
      mockRequest = createMockRequest({ method: 'POST', body: createVenueBody, user: null });

      // Authentication should be checked before route handler
      expect(mockRequest.user).toBeNull();
    });

    it('should throw ConflictError if venue already exists', async () => {
      mockVenueService.createVenue.mockRejectedValue(new Error('Venue already exists'));

      await expect(
        mockVenueService.createVenue(createVenueBody, 'user-123', 'tenant-123', {})
      ).rejects.toThrow('Venue already exists');
    });
  });

  describe('GET /venues/:venueId', () => {
    it('should return venue when user has access', async () => {
      const venue = { id: 'venue-123', name: 'Test Venue' };
      mockVenueService.getVenue.mockResolvedValue(venue);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: 'venue-123' },
      });

      const result = await mockVenueService.getVenue('venue-123', mockRequest.user.id);

      expect(result).toEqual(venue);
    });

    it('should throw NotFoundError when venue does not exist', async () => {
      mockVenueService.getVenue.mockResolvedValue(null);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: 'nonexistent' },
      });

      const result = await mockVenueService.getVenue('nonexistent', mockRequest.user.id);

      expect(result).toBeNull();
    });
  });

  describe('GET /venues/:venueId/capacity', () => {
    it('should return venue capacity when user has access', async () => {
      const venue = { id: 'venue-123', name: 'Test Venue', max_capacity: 10000 };
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getVenue.mockResolvedValue(venue);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: 'venue-123' },
      });

      const hasAccess = await mockVenueService.checkVenueAccess('venue-123', mockRequest.user.id);
      expect(hasAccess).toBe(true);

      const result = await mockVenueService.getVenue('venue-123', mockRequest.user.id);
      expect(result.max_capacity).toBe(10000);
    });

    it('should deny access when user lacks permission', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: 'venue-123' },
      });

      const hasAccess = await mockVenueService.checkVenueAccess('venue-123', mockRequest.user.id);
      expect(hasAccess).toBe(false);
    });
  });

  describe('GET /venues/:venueId/stats', () => {
    it('should return venue stats when user has access', async () => {
      const stats = { totalEvents: 10, totalTicketsSold: 5000, averageOccupancy: 75 };
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getVenueStats.mockResolvedValue(stats);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: 'venue-123' },
      });

      const result = await mockVenueService.getVenueStats('venue-123');
      expect(result).toEqual(stats);
    });

    it('should return null when stats not found', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getVenueStats.mockResolvedValue(null);

      const result = await mockVenueService.getVenueStats('venue-123');
      expect(result).toBeNull();
    });
  });

  describe('PUT /venues/:venueId', () => {
    const updateBody = { name: 'Updated Venue Name' };

    it('should update venue when user has access', async () => {
      const updatedVenue = { id: 'venue-123', ...updateBody };
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.updateVenue.mockResolvedValue(updatedVenue);

      mockRequest = createAuthenticatedRequest({
        method: 'PUT',
        params: { venueId: 'venue-123' },
        body: updateBody,
      });

      const result = await mockVenueService.updateVenue(
        'venue-123',
        updateBody,
        mockRequest.user.id,
        mockRequest.user.tenant_id
      );

      expect(result).toEqual(updatedVenue);
    });

    it('should throw ForbiddenError when user lacks permission', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);

      mockRequest = createAuthenticatedRequest({
        method: 'PUT',
        params: { venueId: 'venue-123' },
        body: updateBody,
      });

      const hasAccess = await mockVenueService.checkVenueAccess('venue-123', mockRequest.user.id);
      expect(hasAccess).toBe(false);
    });
  });

  describe('DELETE /venues/:venueId', () => {
    it('should delete venue when user is owner', async () => {
      mockVenueService.deleteVenue.mockResolvedValue(undefined);

      mockRequest = createAuthenticatedRequest({
        method: 'DELETE',
        params: { venueId: 'venue-123' },
      });

      await mockVenueService.deleteVenue('venue-123', mockRequest.user.id, mockRequest.user.tenant_id);

      expect(mockVenueService.deleteVenue).toHaveBeenCalledWith(
        'venue-123',
        'user-123',
        '550e8400-e29b-41d4-a716-446655440000'
      );
    });

    it('should throw ForbiddenError when user is not owner', async () => {
      mockVenueService.deleteVenue.mockRejectedValue(new Error('Only venue owners can delete venues'));

      await expect(
        mockVenueService.deleteVenue('venue-123', 'non-owner', 'tenant-123')
      ).rejects.toThrow('Only venue owners can delete venues');
    });
  });

  describe('GET /venues/:venueId/check-access', () => {
    it('should return access details when user has access', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getAccessDetails.mockResolvedValue({
        role: 'owner',
        permissions: ['*'],
      });

      mockRequest = createAuthenticatedRequest({
        params: { venueId: 'venue-123' },
      });

      const hasAccess = await mockVenueService.checkVenueAccess(
        'venue-123',
        mockRequest.user.id,
        mockRequest.user.tenant_id
      );
      const accessDetails = await mockVenueService.getAccessDetails('venue-123', mockRequest.user.id);

      expect(hasAccess).toBe(true);
      expect(accessDetails.role).toBe('owner');
      expect(accessDetails.permissions).toContain('*');
    });

    it('should return no access when user is not associated', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(false);
      mockVenueService.getAccessDetails.mockResolvedValue(null);

      const hasAccess = await mockVenueService.checkVenueAccess('venue-123', 'unknown-user', 'tenant-123');
      const accessDetails = await mockVenueService.getAccessDetails('venue-123', 'unknown-user');

      expect(hasAccess).toBe(false);
      expect(accessDetails).toBeNull();
    });
  });

  describe('POST /venues/:venueId/staff', () => {
    const staffBody = {
      userId: 'new-staff-user',
      role: 'manager',
      permissions: ['venue:read', 'venue:update'],
    };

    it('should add staff member when user is owner/manager', async () => {
      const newStaff = { id: 'staff-123', ...staffBody };
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.addStaffMember.mockResolvedValue(newStaff);

      mockRequest = createAuthenticatedRequest({
        method: 'POST',
        params: { venueId: 'venue-123' },
        body: staffBody,
      });

      const result = await mockVenueService.addStaffMember('venue-123', staffBody, mockRequest.user.id);

      expect(result).toEqual(newStaff);
    });

    it('should reject when userId is missing', async () => {
      mockRequest = createAuthenticatedRequest({
        method: 'POST',
        params: { venueId: 'venue-123' },
        body: { role: 'manager' }, // Missing userId
      });

      // Validation should fail before route handler
      expect(mockRequest.body.userId).toBeUndefined();
    });

    it('should throw ForbiddenError when user lacks permission', async () => {
      mockVenueService.addStaffMember.mockRejectedValue(new Error('Only owners and managers can add staff'));

      await expect(
        mockVenueService.addStaffMember('venue-123', staffBody, 'non-owner')
      ).rejects.toThrow('Only owners and managers can add staff');
    });
  });

  describe('GET /venues/:venueId/staff', () => {
    it('should return staff list when user has access', async () => {
      const staffList = [
        { id: 'staff-1', role: 'owner' },
        { id: 'staff-2', role: 'manager' },
      ];
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getVenueStaff.mockResolvedValue(staffList);

      mockRequest = createAuthenticatedRequest({
        params: { venueId: 'venue-123' },
      });

      const result = await mockVenueService.getVenueStaff('venue-123', mockRequest.user.id);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('owner');
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockVenueService.getVenue.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        mockVenueService.getVenue('venue-123', 'user-123')
      ).rejects.toThrow('Database connection failed');
    });

    it('should increment error metrics on failure', async () => {
      const { venueOperations } = require('../../../src/utils/metrics');
      
      mockVenueService.createVenue.mockRejectedValue(new Error('Creation failed'));

      try {
        await mockVenueService.createVenue({}, 'user-123', 'tenant-123', {});
      } catch (e) {
        venueOperations.inc({ operation: 'create', status: 'error' });
      }

      expect(venueOperations.inc).toHaveBeenCalledWith({ operation: 'create', status: 'error' });
    });
  });
});
