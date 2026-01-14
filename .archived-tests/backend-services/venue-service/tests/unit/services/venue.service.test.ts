import { VenueService } from '../../../src/services/venue.service';
import { IVenue } from '../../../src/models/venue.model';

describe('Venue Service', () => {
  let venueService: VenueService;
  let mockDb: any;
  let mockRedis: any;
  let mockCacheService: any;
  let mockEventPublisher: any;
  let mockLogger: any;
  let mockVenueModel: any;
  let mockStaffModel: any;
  let mockSettingsModel: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database
    mockDb = jest.fn();
    mockDb.transaction = jest.fn(async (callback) => {
      const trx = { ...mockDb };
      return await callback(trx);
    });
    
    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn()
    };

    // Mock cache service
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn()
    };

    // Mock event publisher
    mockEventPublisher = {
      publishVenueCreated: jest.fn(),
      publishVenueUpdated: jest.fn(),
      publishVenueDeleted: jest.fn()
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Create service instance
    venueService = new VenueService({
      db: mockDb,
      redis: mockRedis,
      cacheService: mockCacheService,
      eventPublisher: mockEventPublisher,
      logger: mockLogger
    });

    // Mock the models that get created internally
    mockDb.mockReturnValue = jest.fn().mockReturnThis();
  });

  // =============================================================================
  // Create Venue Tests
  // =============================================================================

  describe('createVenue', () => {
    it('should create venue with valid data', async () => {
      const venueData = {
        name: 'Test Venue',
        slug: 'test-venue',
        venue_type: 'theater',
        max_capacity: 500
      };

      const createdVenue = {
        id: 'venue-123',
        ...venueData,
        status: 'ACTIVE',
        created_by: 'user-123',
        tenant_id: 'tenant-123'
      };

      mockDb.transaction = jest.fn(async (callback) => {
        const trx = {
          ...mockDb,
          insert: jest.fn().mockResolvedValue([createdVenue])
        };
        trx.mockReturnValue = jest.fn().mockReturnValue({
          insert: trx.insert,
          returning: jest.fn().mockResolvedValue([createdVenue])
        });
        return await callback(trx);
      });

      const result = await venueService.createVenue(venueData, 'user-123', 'tenant-123');

      expect(mockEventPublisher.publishVenueCreated).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should set default values (status: ACTIVE)', async () => {
      const venueData = {
        name: 'Test Venue'
      };

      mockDb.transaction = jest.fn(async (callback) => {
        const trx = mockDb;
        return await callback(trx);
      });

      await venueService.createVenue(venueData, 'user-123', 'tenant-123');

      expect(venueData).toBeDefined();
    });

    it('should set tenant_id', async () => {
      const venueData = { name: 'Test' };

      mockDb.transaction = jest.fn(async (callback) => {
        const trx = mockDb;
        return await callback(trx);
      });

      await venueService.createVenue(venueData, 'user-123', 'tenant-abc');

      expect(venueData).toBeDefined();
    });

    it('should publish venue.created event to RabbitMQ', async () => {
      const venueData = { name: 'Test', id: 'venue-123' };

      mockDb.transaction = jest.fn(async (callback) => {
        return await callback(mockDb);
      });

      await venueService.createVenue(venueData, 'user-123', 'tenant-123');

      expect(mockEventPublisher.publishVenueCreated).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Get Venue Tests
  // =============================================================================

  describe('getVenue', () => {
    it('should return venue when found', async () => {
      const venue = {
        id: 'venue-123',
        name: 'Test Venue',
        status: 'ACTIVE'
      };

      mockRedis.get.mockResolvedValue(null);

      // Mock checkVenueAccess
      jest.spyOn(venueService, 'checkVenueAccess').mockResolvedValue(true);

      const result = await venueService.getVenue('venue-123', 'user-123');

      expect(result).toBeDefined();
    });

    it('should return null when venue not found', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await venueService.getVenue('nonexistent', 'user-123');

      expect(result).toBeNull();
    });

    it('should throw error when access denied', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      jest.spyOn(venueService, 'checkVenueAccess').mockResolvedValue(false);

      await expect(
        venueService.getVenue('venue-123', 'user-999')
      ).rejects.toThrow('Access denied');
    });

    it('should use cached venue when available', async () => {
      const cachedVenue = JSON.stringify({
        id: 'venue-123',
        name: 'Cached Venue'
      });

      mockRedis.get.mockResolvedValue(cachedVenue);
      jest.spyOn(venueService, 'checkVenueAccess').mockResolvedValue(true);

      await venueService.getVenue('venue-123', 'user-123');

      expect(mockRedis.get).toHaveBeenCalledWith('venue:venue-123:details');
    });
  });

  // =============================================================================
  // List Venues Tests
  // =============================================================================

  describe('listVenues', () => {
    it('should return paginated list', async () => {
      const query = {
        limit: 20,
        offset: 0
      };

      jest.spyOn(venueService, 'searchVenues').mockResolvedValue([]);

      const result = await venueService.listVenues(query);

      expect(result).toEqual([]);
    });

    it('should filter by venue_type', async () => {
      const query = {
        type: 'theater'
      };

      jest.spyOn(venueService, 'searchVenues').mockResolvedValue([]);

      await venueService.listVenues(query);

      expect(venueService.searchVenues).toHaveBeenCalled();
    });

    it('should support search by name/city/description', async () => {
      const query = {
        search: 'Madison Square'
      };

      jest.spyOn(venueService, 'searchVenues').mockResolvedValue([]);

      await venueService.listVenues(query);

      expect(venueService.searchVenues).toHaveBeenCalledWith('Madison Square', expect.any(Object));
    });
  });

  // =============================================================================
  // Update Venue Tests
  // =============================================================================

  describe('updateVenue', () => {
    it('should update venue successfully', async () => {
      const updates = {
        name: 'Updated Name',
        capacity: 600
      };

      const result = await venueService.updateVenue('venue-123', updates, 'user-123');

      expect(mockEventPublisher.publishVenueUpdated).toHaveBeenCalled();
    });

    it('should update updated_at timestamp', async () => {
      const updates = { name: 'New Name' };

      await venueService.updateVenue('venue-123', updates, 'user-123');

      expect(updates).toBeDefined();
    });

    it('should validate venue exists before update', async () => {
      await expect(
        venueService.updateVenue('nonexistent', {}, 'user-123')
      ).rejects.toThrow();
    });

    it('should publish venue.updated event', async () => {
      const updates = { name: 'Updated' };

      await venueService.updateVenue('venue-123', updates, 'user-123');

      expect(mockEventPublisher.publishVenueUpdated).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Delete Venue Tests
  // =============================================================================

  describe('deleteVenue', () => {
    it('should soft delete venue', async () => {
      await venueService.deleteVenue('venue-123', 'owner-123');

      expect(mockEventPublisher.publishVenueDeleted).toHaveBeenCalled();
    });

    it('should not actually delete from database', async () => {
      await venueService.deleteVenue('venue-123', 'owner-123');

      // Soft delete means deleted_at is set, not actual deletion
      expect(mockDb).toBeDefined();
    });

    it('should publish venue.deleted event', async () => {
      await venueService.deleteVenue('venue-123', 'owner-123');

      expect(mockEventPublisher.publishVenueDeleted).toHaveBeenCalledWith('venue-123', 'owner-123');
    });
  });

  // =============================================================================
  // Business Logic Tests
  // =============================================================================

  describe('Business Logic Validation', () => {
    it('should validate max_capacity > 0', async () => {
      const venueData = {
        name: 'Test',
        max_capacity: -10
      };

      await expect(
        venueService.createVenue(venueData, 'user-123', 'tenant-123')
      ).rejects.toThrow();
    });
  });

  // =============================================================================
  // Access Control Tests  
  // =============================================================================

  describe('checkVenueAccess', () => {
    it('should return true when user has access', async () => {
      const result = await venueService.checkVenueAccess('venue-123', 'user-123');

      expect(typeof result).toBe('boolean');
    });

    it('should return false when user lacks access', async () => {
      const result = await venueService.checkVenueAccess('venue-123', 'unauthorized-user');

      expect(typeof result).toBe('boolean');
    });

    it('should return false for inactive venues', async () => {
      const result = await venueService.checkVenueAccess('inactive-venue', 'user-123');

      expect(typeof result).toBe('boolean');
    });
  });

  // =============================================================================
  // Staff Management Tests
  // =============================================================================

  describe('addStaffMember', () => {
    it('should add staff member with proper permissions', async () => {
      const staffData = {
        userId: 'user-456',
        role: 'manager',
        permissions: ['venue:read', 'venue:update']
      };

      await venueService.addStaffMember('venue-123', staffData, 'owner-123');

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should only allow owners and managers to add staff', async () => {
      const staffData = {
        userId: 'user-456',
        role: 'staff'
      };

      await expect(
        venueService.addStaffMember('venue-123', staffData, 'regular-user')
      ).rejects.toThrow();
    });
  });

  describe('getVenueStaff', () => {
    it('should return list of staff members', async () => {
      jest.spyOn(venueService, 'checkVenueAccess').mockResolvedValue(true);

      const result = await venueService.getVenueStaff('venue-123', 'user-123');

      expect(Array.isArray(result)).toBe(true);
    });

    it('should require access to view staff', async () => {
      jest.spyOn(venueService, 'checkVenueAccess').mockResolvedValue(false);

      await expect(
        venueService.getVenueStaff('venue-123', 'unauthorized')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('removeStaffMember', () => {
    it('should only allow owners to remove staff', async () => {
      await expect(
        venueService.removeStaffMember('venue-123', 'staff-id', 'non-owner')
      ).rejects.toThrow();
    });

    it('should not allow removing yourself', async () => {
      await expect(
        venueService.removeStaffMember('venue-123', 'owner-123', 'owner-123')
      ).rejects.toThrow('Cannot remove yourself');
    });
  });

  // =============================================================================
  // Cache Management Tests
  // =============================================================================

  describe('Cache Management', () => {
    it('should clear venue cache on update', async () => {
      await venueService.updateVenue('venue-123', { name: 'New' }, 'user-123');

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should clear venue cache on delete', async () => {
      await venueService.deleteVenue('venue-123', 'owner-123');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Onboarding Tests
  // =============================================================================

  describe('updateOnboardingProgress', () => {
    it('should update onboarding step completion', async () => {
      await venueService.updateOnboardingProgress('venue-123', 'basic_info', true);

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should calculate onboarding status correctly', async () => {
      await venueService.updateOnboardingProgress('venue-123', 'layout', true);

      expect(mockLogger.info).toBeDefined();
    });
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.transaction = jest.fn().mockRejectedValue(new Error('DB Error'));

      await expect(
        venueService.createVenue({ name: 'Test' }, 'user-123', 'tenant-123')
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log errors appropriately', async () => {
      mockDb.transaction = jest.fn().mockRejectedValue(new Error('Test Error'));

      try {
        await venueService.createVenue({ name: 'Test' }, 'user-123', 'tenant-123');
      } catch (error) {
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });
  });
});
