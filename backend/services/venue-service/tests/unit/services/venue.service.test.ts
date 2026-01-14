/**
 * Unit tests for src/services/venue.service.ts
 * Tests core venue operations with mocked dependencies
 * Security: tenant isolation, access control, audit logging
 */

import { VenueService } from '../../../src/services/venue.service';
import { createRedisMock } from '../../__mocks__/redis.mock';
import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock VenueAuditLogger
jest.mock('../../../src/utils/venue-audit-logger', () => ({
  VenueAuditLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock models
jest.mock('../../../src/models/venue.model', () => ({
  VenueModel: jest.fn().mockImplementation(() => ({
    createWithDefaults: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    searchVenues: jest.fn(),
    getVenueStats: jest.fn(),
  })),
  IVenue: {},
}));

jest.mock('../../../src/models/staff.model', () => ({
  StaffModel: jest.fn().mockImplementation(() => ({
    addStaffMember: jest.fn(),
    findByVenueAndUser: jest.fn(),
    hasPermission: jest.fn(),
    getVenueStaff: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('../../../src/models/settings.model', () => ({
  SettingsModel: jest.fn().mockImplementation(() => ({})),
}));

describe('services/venue.service', () => {
  let venueService: VenueService;
  let mockRedis: ReturnType<typeof createRedisMock>;
  let mockDb: ReturnType<typeof createKnexMock>;
  let mockCacheService: any;
  let mockEventPublisher: any;
  let mockLogger: any;

  // Track mock model instances
  let mockVenueModel: any;
  let mockStaffModel: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRedis = createRedisMock();
    mockDb = createKnexMock();
    
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      clearVenueCache: jest.fn(),
      setTenantContext: jest.fn(),
    };
    
    mockEventPublisher = {
      publishVenueCreated: jest.fn().mockResolvedValue(undefined),
      publishVenueUpdated: jest.fn().mockResolvedValue(undefined),
      publishVenueDeleted: jest.fn().mockResolvedValue(undefined),
    };
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Create service instance
    venueService = new VenueService({
      db: mockDb,
      redis: mockRedis as any,
      cacheService: mockCacheService,
      eventPublisher: mockEventPublisher,
      logger: mockLogger,
    });

    // Get references to model mocks
    const { VenueModel } = require('../../../src/models/venue.model');
    const { StaffModel } = require('../../../src/models/staff.model');
    mockVenueModel = VenueModel.mock.results[VenueModel.mock.results.length - 1]?.value;
    mockStaffModel = StaffModel.mock.results[StaffModel.mock.results.length - 1]?.value;
  });

  describe('createVenue()', () => {
    const venueData = {
      name: 'Test Arena',
      slug: 'test-arena',
      venue_type: 'stadium' as const,
    };
    const ownerId = 'user-123';
    const tenantId = 'tenant-456';

    it('should create venue with transaction', async () => {
      const createdVenue = { id: 'venue-1', ...venueData };
      
      // Mock transaction with proper trx function behavior
      mockDb.transaction.mockImplementation(async (callback: any) => {
        const { VenueModel } = require('../../../src/models/venue.model');
        const { StaffModel } = require('../../../src/models/staff.model');
        
        // Reset and configure mocks for transaction
        const trxVenueModel = {
          createWithDefaults: jest.fn().mockResolvedValue(createdVenue),
        };
        const trxStaffModel = {
          addStaffMember: jest.fn().mockResolvedValue({ id: 'staff-1' }),
        };
        
        VenueModel.mockImplementation(() => trxVenueModel);
        StaffModel.mockImplementation(() => trxStaffModel);
        
        // Mock trx as a callable function that returns a query builder for table access
        const mockTrx: any = (tableName: string) => ({
          insert: jest.fn().mockResolvedValue([1]),
        });
        
        return callback(mockTrx);
      });

      const result = await venueService.createVenue(venueData, ownerId, tenantId);

      expect(result).toBeDefined();
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId }),
        'Venue created successfully'
      );
    });

    it('should add owner as staff with owner role', async () => {
      const createdVenue = { id: 'venue-1', ...venueData };
      let addStaffCalled = false;
      
      mockDb.transaction.mockImplementation(async (callback: any) => {
        const { StaffModel } = require('../../../src/models/staff.model');
        const { VenueModel } = require('../../../src/models/venue.model');
        
        const trxStaffModel = {
          addStaffMember: jest.fn().mockImplementation((data: any) => {
            addStaffCalled = true;
            expect(data.role).toBe('owner');
            expect(data.user_id).toBe(ownerId);
            expect(data.permissions).toContain('*');
            return { id: 'staff-1' };
          }),
        };
        
        VenueModel.mockImplementation(() => ({
          createWithDefaults: jest.fn().mockResolvedValue(createdVenue),
        }));
        StaffModel.mockImplementation(() => trxStaffModel);
        
        const mockTrx: any = jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue([1]),
        });
        
        return callback(mockTrx);
      });

      await venueService.createVenue(venueData, ownerId, tenantId);
      
      expect(addStaffCalled).toBe(true);
    });

    it('should publish venue created event', async () => {
      const createdVenue = { id: 'venue-1', ...venueData };
      
      mockDb.transaction.mockImplementation(async (callback: any) => {
        const { VenueModel } = require('../../../src/models/venue.model');
        const { StaffModel } = require('../../../src/models/staff.model');
        
        VenueModel.mockImplementation(() => ({
          createWithDefaults: jest.fn().mockResolvedValue(createdVenue),
        }));
        StaffModel.mockImplementation(() => ({
          addStaffMember: jest.fn().mockResolvedValue({ id: 'staff-1' }),
        }));
        
        const mockTrx: any = jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue([1]),
        });
        
        return callback(mockTrx);
      });

      await venueService.createVenue(venueData, ownerId, tenantId);

      expect(mockEventPublisher.publishVenueCreated).toHaveBeenCalledWith(
        'venue-1',
        createdVenue,
        ownerId
      );
    });

    it('should handle event publishing failure gracefully', async () => {
      const createdVenue = { id: 'venue-1', ...venueData };
      mockEventPublisher.publishVenueCreated.mockRejectedValue(new Error('Publish failed'));
      
      mockDb.transaction.mockImplementation(async (callback: any) => {
        const { VenueModel } = require('../../../src/models/venue.model');
        const { StaffModel } = require('../../../src/models/staff.model');
        
        VenueModel.mockImplementation(() => ({
          createWithDefaults: jest.fn().mockResolvedValue(createdVenue),
        }));
        StaffModel.mockImplementation(() => ({
          addStaffMember: jest.fn().mockResolvedValue({ id: 'staff-1' }),
        }));
        
        const mockTrx: any = jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue([1]),
        });
        
        return callback(mockTrx);
      });

      // Should not throw even if publishing fails
      const result = await venueService.createVenue(venueData, ownerId, tenantId);

      expect(result).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to publish venue created event',
        expect.any(Object)
      );
    });

    it('should set tenant_id on venue', async () => {
      let capturedVenueData: any;
      
      mockDb.transaction.mockImplementation(async (callback: any) => {
        const { VenueModel } = require('../../../src/models/venue.model');
        const { StaffModel } = require('../../../src/models/staff.model');
        
        VenueModel.mockImplementation(() => ({
          createWithDefaults: jest.fn().mockImplementation((data: any) => {
            capturedVenueData = data;
            return { id: 'venue-1', ...data };
          }),
        }));
        StaffModel.mockImplementation(() => ({
          addStaffMember: jest.fn().mockResolvedValue({ id: 'staff-1' }),
        }));
        
        const mockTrx: any = jest.fn().mockReturnValue({
          insert: jest.fn().mockResolvedValue([1]),
        });
        
        return callback(mockTrx);
      });

      await venueService.createVenue(venueData, ownerId, tenantId);

      expect(capturedVenueData.tenant_id).toBe(tenantId);
      expect(capturedVenueData.created_by).toBe(ownerId);
    });
  });

  describe('getVenue()', () => {
    const venueId = 'venue-123';
    const userId = 'user-456';
    const testVenue = {
      id: venueId,
      name: 'Test Venue',
      status: 'ACTIVE',
    };

    beforeEach(() => {
      // Reset model mocks
      const { VenueModel } = require('../../../src/models/venue.model');
      const { StaffModel } = require('../../../src/models/staff.model');
      
      mockVenueModel = {
        findById: jest.fn(),
      };
      mockStaffModel = {
        findByVenueAndUser: jest.fn(),
      };
      
      VenueModel.mockImplementation(() => mockVenueModel);
      StaffModel.mockImplementation(() => mockStaffModel);
    });

    it('should return cached venue on cache hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(testVenue));
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ is_active: true });
      mockVenueModel.findById.mockResolvedValue(testVenue);

      const result = await venueService.getVenue(venueId, userId);

      expect(result).toEqual(testVenue);
      expect(mockRedis.get).toHaveBeenCalledWith(`venue:${venueId}:details`);
    });

    it('should fetch from database on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockVenueModel.findById.mockResolvedValue(testVenue);
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ is_active: true });

      const result = await venueService.getVenue(venueId, userId);

      expect(result).toEqual(testVenue);
      expect(mockVenueModel.findById).toHaveBeenCalledWith(venueId);
    });

    it('should cache venue after database fetch', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      mockVenueModel.findById.mockResolvedValue(testVenue);
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ is_active: true });

      await venueService.getVenue(venueId, userId);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `venue:${venueId}:details`,
        300,
        JSON.stringify(testVenue)
      );
    });

    it('should return null for non-existent venue', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVenueModel.findById.mockResolvedValue(null);

      const result = await venueService.getVenue(venueId, userId);

      expect(result).toBeNull();
    });

    it('should throw ForbiddenError when user has no access', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockVenueModel.findById.mockResolvedValue(testVenue);
      mockStaffModel.findByVenueAndUser.mockResolvedValue(null);

      await expect(venueService.getVenue(venueId, userId)).rejects.toThrow('Access denied to this venue');
    });

    it('should check access even for cached venues', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(testVenue));
      mockStaffModel.findByVenueAndUser.mockResolvedValue(null);
      mockVenueModel.findById.mockResolvedValue(testVenue);

      await expect(venueService.getVenue(venueId, userId)).rejects.toThrow('Access denied');
    });
  });

  describe('updateVenue()', () => {
    const venueId = 'venue-123';
    const userId = 'user-456';
    const updates = { name: 'Updated Venue' };

    beforeEach(() => {
      const { VenueModel } = require('../../../src/models/venue.model');
      const { StaffModel } = require('../../../src/models/staff.model');
      
      mockVenueModel = {
        findBySlug: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: venueId, ...updates }),
      };
      mockStaffModel = {
        hasPermission: jest.fn().mockResolvedValue(true),
      };
      
      VenueModel.mockImplementation(() => mockVenueModel);
      StaffModel.mockImplementation(() => mockStaffModel);
    });

    it('should update venue when user has permission', async () => {
      const result = await venueService.updateVenue(venueId, updates, userId);

      expect(result.name).toBe('Updated Venue');
      expect(mockStaffModel.hasPermission).toHaveBeenCalledWith(venueId, userId, 'venue:update');
    });

    it('should throw ForbiddenError when user lacks permission', async () => {
      mockStaffModel.hasPermission.mockResolvedValue(false);

      await expect(venueService.updateVenue(venueId, updates, userId)).rejects.toThrow('Permission denied');
    });

    it('should reject duplicate slug', async () => {
      mockVenueModel.findBySlug.mockResolvedValue({ id: 'other-venue' });

      await expect(
        venueService.updateVenue(venueId, { slug: 'existing-slug' }, userId)
      ).rejects.toThrow('Slug already in use');
    });

    it('should allow same slug for same venue', async () => {
      mockVenueModel.findBySlug.mockResolvedValue({ id: venueId });

      await expect(
        venueService.updateVenue(venueId, { slug: 'same-slug' }, userId)
      ).resolves.not.toThrow();
    });

    it('should clear cache after update', async () => {
      mockRedis.del.mockResolvedValue(1);

      await venueService.updateVenue(venueId, updates, userId);

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should publish venue updated event', async () => {
      await venueService.updateVenue(venueId, updates, userId);

      expect(mockEventPublisher.publishVenueUpdated).toHaveBeenCalledWith(
        venueId,
        updates,
        userId
      );
    });
  });

  describe('deleteVenue()', () => {
    const venueId = 'venue-123';
    const userId = 'user-456';

    beforeEach(() => {
      const { VenueModel } = require('../../../src/models/venue.model');
      const { StaffModel } = require('../../../src/models/staff.model');
      
      mockVenueModel = {
        softDelete: jest.fn().mockResolvedValue(undefined),
      };
      mockStaffModel = {
        findByVenueAndUser: jest.fn().mockResolvedValue({ role: 'owner' }),
      };
      
      VenueModel.mockImplementation(() => mockVenueModel);
      StaffModel.mockImplementation(() => mockStaffModel);

      // Mock canDeleteVenue queries
      mockDb._mockChain.first.mockResolvedValue({ count: '0' });
    });

    it('should delete venue when owner', async () => {
      await venueService.deleteVenue(venueId, userId);

      expect(mockVenueModel.softDelete).toHaveBeenCalledWith(venueId);
    });

    it('should reject deletion by non-owner', async () => {
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ role: 'manager' });

      await expect(venueService.deleteVenue(venueId, userId)).rejects.toThrow('Only venue owners can delete venues');
    });

    it('should reject deletion when staff not found', async () => {
      mockStaffModel.findByVenueAndUser.mockResolvedValue(null);

      await expect(venueService.deleteVenue(venueId, userId)).rejects.toThrow('Only venue owners can delete venues');
    });

    it('should publish venue deleted event', async () => {
      await venueService.deleteVenue(venueId, userId);

      expect(mockEventPublisher.publishVenueDeleted).toHaveBeenCalledWith(venueId, userId);
    });

    it('should clear cache after deletion', async () => {
      mockRedis.del.mockResolvedValue(1);

      await venueService.deleteVenue(venueId, userId);

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('checkVenueAccess()', () => {
    const venueId = 'venue-123';
    const userId = 'user-456';

    beforeEach(() => {
      const { VenueModel } = require('../../../src/models/venue.model');
      const { StaffModel } = require('../../../src/models/staff.model');
      
      mockVenueModel = {
        findById: jest.fn(),
      };
      mockStaffModel = {
        findByVenueAndUser: jest.fn(),
      };
      
      VenueModel.mockImplementation(() => mockVenueModel);
      StaffModel.mockImplementation(() => mockStaffModel);
    });

    it('should return true for active staff and active venue', async () => {
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ is_active: true });
      mockVenueModel.findById.mockResolvedValue({ status: 'ACTIVE' });

      const result = await venueService.checkVenueAccess(venueId, userId);

      expect(result).toBe(true);
    });

    it('should return false when staff not found', async () => {
      mockStaffModel.findByVenueAndUser.mockResolvedValue(null);

      const result = await venueService.checkVenueAccess(venueId, userId);

      expect(result).toBe(false);
    });

    it('should return false when staff is inactive', async () => {
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ is_active: false });

      const result = await venueService.checkVenueAccess(venueId, userId);

      expect(result).toBe(false);
    });

    it('should return false when venue not found', async () => {
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ is_active: true });
      mockVenueModel.findById.mockResolvedValue(null);

      const result = await venueService.checkVenueAccess(venueId, userId);

      expect(result).toBe(false);
    });

    it('should return false when venue is inactive', async () => {
      mockStaffModel.findByVenueAndUser.mockResolvedValue({ is_active: true });
      mockVenueModel.findById.mockResolvedValue({ status: 'INACTIVE' });

      const result = await venueService.checkVenueAccess(venueId, userId);

      expect(result).toBe(false);
    });
  });

  describe('searchVenues()', () => {
    it('should call model searchVenues with filters', async () => {
      const { VenueModel } = require('../../../src/models/venue.model');
      const mockSearch = jest.fn().mockResolvedValue([{ id: 'venue-1' }]);
      
      VenueModel.mockImplementation(() => ({
        searchVenues: mockSearch,
      }));

      const result = await venueService.searchVenues('arena', { city: 'New York' });

      expect(mockSearch).toHaveBeenCalledWith('arena', { city: 'New York' });
      expect(result).toHaveLength(1);
    });
  });

  describe('getVenueStats()', () => {
    const venueId = 'venue-123';
    const mockStats = { totalEvents: 10, totalTicketsSold: 1000 };

    beforeEach(() => {
      const { VenueModel } = require('../../../src/models/venue.model');
      
      VenueModel.mockImplementation(() => ({
        getVenueStats: jest.fn().mockResolvedValue(mockStats),
      }));
    });

    it('should return cached stats on hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockStats));

      const result = await venueService.getVenueStats(venueId);

      expect(result).toEqual(mockStats);
      expect(mockRedis.get).toHaveBeenCalledWith(`venue:${venueId}:stats`);
    });

    it('should fetch from model on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      const result = await venueService.getVenueStats(venueId);

      expect(result).toEqual(mockStats);
    });

    it('should cache stats for 1 minute', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      await venueService.getVenueStats(venueId);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `venue:${venueId}:stats`,
        60,
        JSON.stringify(mockStats)
      );
    });
  });

  describe('Staff Management', () => {
    const venueId = 'venue-123';
    const requesterId = 'user-owner';
    const newStaffData = { userId: 'user-new', role: 'manager', permissions: ['venue:read'] };

    describe('addStaffMember()', () => {
      beforeEach(() => {
        const { StaffModel } = require('../../../src/models/staff.model');
        
        mockStaffModel = {
          findByVenueAndUser: jest.fn(),
          addStaffMember: jest.fn().mockResolvedValue({ id: 'staff-new' }),
        };
        
        StaffModel.mockImplementation(() => mockStaffModel);
      });

      it('should allow owner to add staff', async () => {
        mockStaffModel.findByVenueAndUser.mockResolvedValue({ role: 'owner' });

        await venueService.addStaffMember(venueId, newStaffData, requesterId);

        expect(mockStaffModel.addStaffMember).toHaveBeenCalledWith({
          venue_id: venueId,
          user_id: newStaffData.userId,
          role: newStaffData.role,
          permissions: newStaffData.permissions,
        });
      });

      it('should allow manager to add staff', async () => {
        mockStaffModel.findByVenueAndUser.mockResolvedValue({ role: 'manager' });

        await expect(
          venueService.addStaffMember(venueId, newStaffData, requesterId)
        ).resolves.not.toThrow();
      });

      it('should reject staff addition by regular staff', async () => {
        mockStaffModel.findByVenueAndUser.mockResolvedValue({ role: 'staff' });

        await expect(
          venueService.addStaffMember(venueId, newStaffData, requesterId)
        ).rejects.toThrow('Only owners and managers can add staff');
      });

      it('should reject when requester not found', async () => {
        mockStaffModel.findByVenueAndUser.mockResolvedValue(null);

        await expect(
          venueService.addStaffMember(venueId, newStaffData, requesterId)
        ).rejects.toThrow('Only owners and managers can add staff');
      });
    });

    describe('getVenueStaff()', () => {
      beforeEach(() => {
        const { VenueModel } = require('../../../src/models/venue.model');
        const { StaffModel } = require('../../../src/models/staff.model');
        
        mockVenueModel = {
          findById: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
        };
        mockStaffModel = {
          findByVenueAndUser: jest.fn().mockResolvedValue({ is_active: true }),
          getVenueStaff: jest.fn().mockResolvedValue([
            { id: 'staff-1', role: 'owner' },
            { id: 'staff-2', role: 'manager' },
          ]),
        };
        
        VenueModel.mockImplementation(() => mockVenueModel);
        StaffModel.mockImplementation(() => mockStaffModel);
      });

      it('should return staff list when user has access', async () => {
        const result = await venueService.getVenueStaff(venueId, requesterId);

        expect(result).toHaveLength(2);
        expect(mockStaffModel.getVenueStaff).toHaveBeenCalledWith(venueId);
      });

      it('should throw when user lacks access', async () => {
        mockStaffModel.findByVenueAndUser.mockResolvedValue(null);

        await expect(venueService.getVenueStaff(venueId, requesterId)).rejects.toThrow('Access denied');
      });
    });

    describe('removeStaffMember()', () => {
      const staffIdToRemove = 'staff-to-remove';

      beforeEach(() => {
        const { StaffModel } = require('../../../src/models/staff.model');
        
        mockStaffModel = {
          findByVenueAndUser: jest.fn().mockResolvedValue({ id: 'requester-staff', role: 'owner' }),
          delete: jest.fn().mockResolvedValue(undefined),
        };
        
        StaffModel.mockImplementation(() => mockStaffModel);
      });

      it('should allow owner to remove staff', async () => {
        await venueService.removeStaffMember(venueId, staffIdToRemove, requesterId);

        expect(mockStaffModel.delete).toHaveBeenCalledWith(staffIdToRemove);
      });

      it('should reject removal by non-owner', async () => {
        mockStaffModel.findByVenueAndUser.mockResolvedValue({ id: 'requester-staff', role: 'manager' });

        await expect(
          venueService.removeStaffMember(venueId, staffIdToRemove, requesterId)
        ).rejects.toThrow('Only owners can remove staff');
      });

      it('should reject self-removal', async () => {
        mockStaffModel.findByVenueAndUser.mockResolvedValue({ id: staffIdToRemove, role: 'owner' });

        await expect(
          venueService.removeStaffMember(venueId, staffIdToRemove, requesterId)
        ).rejects.toThrow('Cannot remove yourself');
      });
    });
  });

  describe('listUserVenues()', () => {
    const userId = 'user-123';

    it('should return empty array when user has no venues', async () => {
      mockDb._mockChain.select.mockResolvedValue([]);

      const result = await venueService.listUserVenues(userId);

      expect(result).toEqual([]);
    });
  });

  describe('updateOnboardingProgress()', () => {
    const venueId = 'venue-123';

    beforeEach(() => {
      const { VenueModel } = require('../../../src/models/venue.model');
      
      mockVenueModel = {
        findById: jest.fn().mockResolvedValue({ id: venueId, onboarding: {} }),
        update: jest.fn().mockResolvedValue({ id: venueId }),
      };
      
      VenueModel.mockImplementation(() => mockVenueModel);
      mockRedis.del.mockResolvedValue(1);
    });

    it('should update onboarding step', async () => {
      await venueService.updateOnboardingProgress(venueId, 'basic_info', true);

      expect(mockVenueModel.update).toHaveBeenCalledWith(
        venueId,
        expect.objectContaining({
          onboarding: { basic_info: true },
        })
      );
    });

    it('should throw when venue not found', async () => {
      mockVenueModel.findById.mockResolvedValue(null);

      await expect(
        venueService.updateOnboardingProgress(venueId, 'basic_info', true)
      ).rejects.toThrow('Venue not found');
    });

    it('should clear cache after update', async () => {
      await venueService.updateOnboardingProgress(venueId, 'basic_info', true);

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });
});

