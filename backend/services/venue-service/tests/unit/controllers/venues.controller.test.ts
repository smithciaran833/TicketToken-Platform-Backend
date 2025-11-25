import { venueRoutes } from '../../../src/controllers/venues.controller';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

describe('VenuesController', () => {
  let mockFastify: any;
  let mockVenueService: any;
  let mockLogger: any;
  let mockContainer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Mock venue service
    mockVenueService = {
      listVenues: jest.fn(),
      listUserVenues: jest.fn(),
      createVenue: jest.fn(),
      getVenue: jest.fn(),
      updateVenue: jest.fn(),
      deleteVenue: jest.fn(),
      checkVenueAccess: jest.fn(),
      getAccessDetails: jest.fn(),
      addStaffMember: jest.fn(),
      getVenueStaff: jest.fn(),
      getVenueStats: jest.fn(),
    };

    // Mock container
    mockContainer = {
      cradle: {
        venueService: mockVenueService,
        logger: mockLogger,
      },
    };

    // Mock Fastify instance
    mockFastify = {
      container: mockContainer,
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      register: jest.fn(),
    };
  });

  // Helper to create mock reply with request
  const createMockReply = (requestId = 'req-123') => {
    const mockReply: any = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      request: { id: requestId },
    };
    return mockReply;
  };

  // =============================================================================
  // Route Registration - 5 test cases
  // =============================================================================

  describe('Route Registration', () => {
    it('should register GET / route', async () => {
      await venueRoutes(mockFastify as any);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('should register POST / route', async () => {
      await venueRoutes(mockFastify as any);

      expect(mockFastify.post).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('should register GET /user route', async () => {
      await venueRoutes(mockFastify as any);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/user',
        expect.objectContaining({
          preHandler: expect.any(Array),
        }),
        expect.any(Function)
      );
    });

    it('should register GET /:venueId route', async () => {
      await venueRoutes(mockFastify as any);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/:venueId',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register nested routes', async () => {
      await venueRoutes(mockFastify as any);

      expect(mockFastify.register).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GET / - List Venues - 4 test cases
  // =============================================================================

  describe('GET / - List Venues', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      // Get the handler for GET /
      handler = mockFastify.get.mock.calls.find((call: any) => call[0] === '/')[2];

      mockRequest = {
        query: {},
        headers: {},
        id: 'req-123',
      };

      mockReply = createMockReply();
    });

    it('should list public venues when no auth', async () => {
      const mockVenues = [
        { id: 'venue-1', name: 'Public Venue' },
      ];
      mockVenueService.listVenues.mockResolvedValue(mockVenues);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.listVenues).toHaveBeenCalledWith({});
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockVenues,
        })
      );
    });

    it('should list user venues when my_venues flag is set', async () => {
      const mockVenues = [{ id: 'venue-1', name: 'My Venue' }];
      mockVenueService.listUserVenues.mockResolvedValue(mockVenues);

      // Mock authenticated request
      mockRequest.headers.authorization = 'Bearer valid-token';
      mockRequest.query = { my_venues: true };

      // Mock JWT verification
      jest.mock('jsonwebtoken', () => ({
        verify: jest.fn().mockReturnValue({ id: 'user-1' }),
      }));

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should include pagination in response', async () => {
      mockVenueService.listVenues.mockResolvedValue([]);
      mockRequest.query = { limit: 10, offset: 20 };

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: {
            limit: 10,
            offset: 20,
          },
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockVenueService.listVenues.mockRejectedValue(new Error('DB error'));

      await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST / - Create Venue - 3 test cases
  // =============================================================================

  describe('POST / - Create Venue', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      handler = mockFastify.post.mock.calls.find((call: any) => call[0] === '/')[2];

      mockRequest = {
        body: {
          name: 'New Venue',
          type: 'arena',
          capacity: 10000,
          address: {
            street: '123 Main St',
            city: 'Boston',
            state: 'MA',
            zipCode: '02101',
            country: 'US',
          },
        },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
        id: 'req-123',
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
      };

      mockReply = createMockReply();
    });

    it('should create venue successfully', async () => {
      const mockVenue = { id: 'venue-1', name: 'New Venue' };
      mockVenueService.createVenue.mockResolvedValue(mockVenue);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.createVenue).toHaveBeenCalledWith(
        mockRequest.body,
        'user-1',
        'tenant-1',
        expect.objectContaining({
          requestId: 'req-123',
          ipAddress: '127.0.0.1',
        })
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(mockVenue);
    });

    it('should log venue creation', async () => {
      const mockVenue = { id: 'venue-1', name: 'New Venue' };
      mockVenueService.createVenue.mockResolvedValue(mockVenue);

      await handler(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-1',
          userId: 'user-1',
        }),
        'Venue created'
      );
    });

    it('should handle conflict errors', async () => {
      mockVenueService.createVenue.mockRejectedValue(
        new Error('Venue already exists')
      );

      await expect(handler(mockRequest, mockReply)).rejects.toThrow();
    });
  });

  // =============================================================================
  // GET /user - List User Venues - 2 test cases
  // =============================================================================

  describe('GET /user - List User Venues', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      handler = mockFastify.get.mock.calls.find((call: any) => call[0] === '/user')[2];

      mockRequest = {
        user: { id: 'user-1' },
      };

      mockReply = createMockReply();
    });

    it('should list user venues', async () => {
      const mockVenues = [
        { id: 'venue-1', name: 'User Venue 1' },
        { id: 'venue-2', name: 'User Venue 2' },
      ];
      mockVenueService.listUserVenues.mockResolvedValue(mockVenues);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.listUserVenues).toHaveBeenCalledWith('user-1', {});
      expect(mockReply.send).toHaveBeenCalledWith(mockVenues);
    });

    it('should handle errors', async () => {
      mockVenueService.listUserVenues.mockRejectedValue(new Error('DB error'));

      await handler(mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GET /:venueId - Get Venue - 3 test cases
  // =============================================================================

  describe('GET /:venueId - Get Venue', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      handler = mockFastify.get.mock.calls.find(
        (call: any) => call[0] === '/:venueId'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
      };

      mockReply = createMockReply();
    });

    it('should get venue by id', async () => {
      const mockVenue = { id: 'venue-1', name: 'Test Venue' };
      mockVenueService.getVenue.mockResolvedValue(mockVenue);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.getVenue).toHaveBeenCalledWith('venue-1', 'user-1');
      expect(mockReply.send).toHaveBeenCalledWith(mockVenue);
    });

    it('should return 404 if venue not found', async () => {
      mockVenueService.getVenue.mockResolvedValue(null);

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 for access denied', async () => {
      mockVenueService.getVenue.mockRejectedValue(new Error('Access denied'));

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  // =============================================================================
  // PUT /:venueId - Update Venue - 2 test cases
  // =============================================================================

  describe('PUT /:venueId - Update Venue', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      handler = mockFastify.put.mock.calls.find(
        (call: any) => call[0] === '/:venueId'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
        body: { name: 'Updated Venue' },
      };

      mockReply = createMockReply();

      mockVenueService.checkVenueAccess.mockResolvedValue(true);
    });

    it('should update venue successfully', async () => {
      const mockUpdated = { id: 'venue-1', name: 'Updated Venue' };
      mockVenueService.updateVenue.mockResolvedValue(mockUpdated);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.updateVenue).toHaveBeenCalledWith(
        'venue-1',
        { name: 'Updated Venue' },
        'user-1',
        'tenant-1'
      );
      expect(mockReply.send).toHaveBeenCalledWith(mockUpdated);
    });

    it('should log venue update', async () => {
      mockVenueService.updateVenue.mockResolvedValue({ id: 'venue-1' });

      await handler(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-1',
          userId: 'user-1',
        }),
        'Venue updated'
      );
    });
  });

  // =============================================================================
  // DELETE /:venueId - Delete Venue - 2 test cases
  // =============================================================================

  describe('DELETE /:venueId - Delete Venue', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      handler = mockFastify.delete.mock.calls.find(
        (call: any) => call[0] === '/:venueId'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
      };

      mockReply = createMockReply();
    });

    it('should delete venue successfully', async () => {
      mockVenueService.deleteVenue.mockResolvedValue(true);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.deleteVenue).toHaveBeenCalledWith(
        'venue-1',
        'user-1',
        'tenant-1'
      );
      expect(mockReply.status).toHaveBeenCalledWith(204);
    });

    it('should handle forbidden error', async () => {
      mockVenueService.deleteVenue.mockRejectedValue(
        new Error('Only venue owners can delete venues')
      );

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  // =============================================================================
  // GET /:venueId/check-access - Check Access - 1 test case
  // =============================================================================

  describe('GET /:venueId/check-access - Check Access', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      handler = mockFastify.get.mock.calls.find(
        (call: any) => call[0] === '/:venueId/check-access'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
      };

      mockReply = createMockReply();
    });

    it('should return access details', async () => {
      mockVenueService.checkVenueAccess.mockResolvedValue(true);
      mockVenueService.getAccessDetails.mockResolvedValue({
        role: 'owner',
        permissions: ['*'],
      });

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        hasAccess: true,
        role: 'owner',
        permissions: ['*'],
      });
    });
  });

  // =============================================================================
  // POST /:venueId/staff - Add Staff - 3 test cases
  // =============================================================================

  describe('POST /:venueId/staff - Add Staff', () => {
    let handler: any;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(async () => {
      await venueRoutes(mockFastify as any);
      handler = mockFastify.post.mock.calls.find(
        (call: any) => call[0] === '/:venueId/staff'
      )[2];

      mockRequest = {
        params: { venueId: 'venue-1' },
        user: { id: 'user-1' },
        tenantId: 'tenant-1',
        body: {
          userId: 'user-2',
          role: 'manager',
          permissions: [],
        },
      };

      mockReply = createMockReply();

      mockVenueService.checkVenueAccess.mockResolvedValue(true);
    });

    it('should add staff member', async () => {
      const mockStaff = { id: 'staff-1', userId: 'user-2', role: 'manager' };
      mockVenueService.addStaffMember.mockResolvedValue(mockStaff);

      await handler(mockRequest, mockReply);

      expect(mockVenueService.addStaffMember).toHaveBeenCalledWith(
        'venue-1',
        expect.objectContaining({
          userId: 'user-2',
          role: 'manager',
        }),
        'user-1'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
    });

    it('should require userId', async () => {
      mockRequest.body = { role: 'manager' };

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle errors', async () => {
      mockVenueService.addStaffMember.mockRejectedValue(new Error('DB error'));

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });
});
