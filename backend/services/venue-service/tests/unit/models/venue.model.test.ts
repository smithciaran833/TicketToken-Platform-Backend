import { VenueModel, IVenue } from '../../../src/models/venue.model';

describe('VenueModel', () => {
  let venueModel: VenueModel;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
    });

    venueModel = new VenueModel(mockDb);
  });

  // =============================================================================
  // constructor() - 1 test case
  // =============================================================================

  describe('constructor()', () => {
    it('should set table name to venues', () => {
      expect((venueModel as any).tableName).toBe('venues');
    });
  });

  // =============================================================================
  // findBySlug() - 3 test cases
  // =============================================================================

  describe('findBySlug()', () => {
    const mockDbVenue = {
      id: 'venue-1',
      name: 'Test Venue',
      slug: 'test-venue',
      tenant_id: 'tenant-1',
      email: 'test@venue.com',
      address_line1: '123 Main St',
      city: 'New York',
      state_province: 'NY',
      postal_code: '10001',
      country_code: 'US',
      venue_type: 'arena',
      max_capacity: 20000,
      image_gallery: '["img1.jpg","img2.jpg"]',
    };

    it('should find venue by slug', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockDbVenue);

      const result = await venueModel.findBySlug('test-venue');

      expect(result).toBeDefined();
      expect(result?.slug).toBe('test-venue');
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ slug: 'test-venue' });
    });

    it('should transform venue from database format', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockDbVenue);

      const result = await venueModel.findBySlug('test-venue');

      expect(result?.address).toBeDefined();
      expect(result?.address?.street).toBe('123 Main St');
      expect(result?.type).toBe('arena');
    });

    it('should return null if not found', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      const result = await venueModel.findBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // findById() - 3 test cases
  // =============================================================================

  describe('findById()', () => {
    const mockDbVenue = {
      id: 'venue-1',
      name: 'Test Venue',
      tenant_id: 'tenant-1',
      email: 'test@venue.com',
      address_line1: '123 Main St',
      city: 'New York',
      state_province: 'NY',
      country_code: 'US',
      venue_type: 'stadium',
      max_capacity: 50000,
    };

    it('should find venue by id', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockDbVenue);

      const result = await venueModel.findById('venue-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('venue-1');
    });

    it('should transform venue from database', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(mockDbVenue);

      const result = await venueModel.findById('venue-1');

      expect(result?.address).toBeDefined();
      expect(result?.capacity).toBe(50000);
      expect(result?.type).toBe('stadium');
    });

    it('should return null if not found', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue(null);

      const result = await venueModel.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // createWithDefaults() - 4 test cases
  // =============================================================================

  describe('createWithDefaults()', () => {
    const minimalVenueData: Partial<IVenue> = {
      tenant_id: 'tenant-1',
      name: 'New Venue',
      email: 'new@venue.com',
      address_line1: '456 Elm St',
      city: 'Boston',
      state_province: 'MA',
      country_code: 'US',
      venue_type: 'theater',
      max_capacity: 500,
    };

    it('should create venue with provided data', async () => {
      const createdVenue = { id: 'venue-1', ...minimalVenueData };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([createdVenue]);

      const result = await venueModel.createWithDefaults(minimalVenueData);

      expect(result).toBeDefined();
      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalled();
    });

    it('should generate slug from name', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.createWithDefaults(minimalVenueData);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'new-venue',
        })
      );
    });

    it('should set default status to ACTIVE', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.createWithDefaults(minimalVenueData);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ACTIVE',
        })
      );
    });

    it('should set default is_verified to false', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.createWithDefaults(minimalVenueData);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          is_verified: false,
        })
      );
    });
  });

  // =============================================================================
  // update() - 4 test cases
  // =============================================================================

  describe('update()', () => {
    it('should update venue with new data', async () => {
      const updates = { name: 'Updated Venue' };
      const updated = { id: 'venue-1', name: 'Updated Venue' };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([updated]);

      const result = await venueModel.update('venue-1', updates);

      expect(result).toBeDefined();
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'venue-1' });
    });

    it('should map legacy address field to flat columns', async () => {
      const updates = {
        address: {
          street: '789 Oak Ave',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
        },
      };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.update('venue-1', updates);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          address_line1: '789 Oak Ave',
          city: 'Chicago',
          state_province: 'IL',
          postal_code: '60601',
        })
      );
    });

    it('should map type to venue_type', async () => {
      const updates = { type: 'concert_hall' };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.update('venue-1', updates);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_type: 'concert_hall',
        })
      );
    });

    it('should map is_active to status', async () => {
      const updates = { is_active: false };
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.update('venue-1', updates);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'INACTIVE',
        })
      );
    });
  });

  // =============================================================================
  // updateOnboardingStatus() - 2 test cases
  // =============================================================================

  describe('updateOnboardingStatus()', () => {
    it('should update onboarding status in metadata', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        id: 'venue-1',
        metadata: {},
      });
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{
        id: 'venue-1',
        metadata: { onboarding_status: 'completed' },
      }]);

      const result = await venueModel.updateOnboardingStatus('venue-1', 'completed');

      expect(result).toBe(true);
    });

    it('should set onboarding status', async () => {
      mockDb._mockQueryBuilder.first.mockResolvedValue({
        id: 'venue-1',
        metadata: { custom_field: 'value' },
      });
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{
        id: 'venue-1',
        metadata: { onboarding_status: 'in_progress' },
      }]);

      await venueModel.updateOnboardingStatus('venue-1', 'in_progress');

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { onboarding_status: 'in_progress' },
        })
      );
    });
  });

  // =============================================================================
  // getActiveVenues() - 2 test cases
  // =============================================================================

  describe('getActiveVenues()', () => {
    const mockVenues = [
      { id: '1', status: 'ACTIVE', name: 'Venue 1' },
      { id: '2', status: 'ACTIVE', name: 'Venue 2' },
    ];

    it('should get all active venues', async () => {
      mockDb._mockQueryBuilder.offset.mockResolvedValue(mockVenues);

      const result = await venueModel.getActiveVenues();

      expect(result).toHaveLength(2);
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ status: 'ACTIVE' });
    });

    it('should exclude soft-deleted venues', async () => {
      mockDb._mockQueryBuilder.offset.mockResolvedValue(mockVenues);

      await venueModel.getActiveVenues();

      expect(mockDb._mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
    });
  });

  // =============================================================================
  // getVenuesByType() - 1 test case
  // =============================================================================

  describe('getVenuesByType()', () => {
    it('should filter by venue_type and active status', async () => {
      mockDb._mockQueryBuilder.offset.mockResolvedValue([]);

      await venueModel.getVenuesByType('arena');

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalledWith({ 
        venue_type: 'arena',
        status: 'ACTIVE'
      });
    });
  });

  // =============================================================================
  // searchVenues() - 2 test cases
  // =============================================================================

  describe('searchVenues()', () => {
    it('should search venues by term', async () => {
      mockDb._mockQueryBuilder.offset.mockResolvedValue([]);

      await venueModel.searchVenues('Madison');

      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalled();
    });

    it('should search in multiple fields', async () => {
      mockDb._mockQueryBuilder.offset.mockResolvedValue([]);

      await venueModel.searchVenues('test');

      // Should use orWhere for multiple fields (name, city, description)
      expect(mockDb._mockQueryBuilder.where).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // transformFromDb() - 5 test cases (testing via findById)
  // =============================================================================

  describe('transformFromDb (via findById)', () => {
    it('should parse image_gallery JSON string', async () => {
      const dbVenue = {
        id: 'venue-1',
        tenant_id: 'tenant-1',
        name: 'Test',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'NYC',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 1000,
        image_gallery: '["img1.jpg","img2.jpg"]',
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(dbVenue);

      const result = await venueModel.findById('venue-1');

      expect(result?.image_gallery).toEqual(['img1.jpg', 'img2.jpg']);
    });

    it('should handle invalid image_gallery JSON', async () => {
      const dbVenue = {
        id: 'venue-1',
        tenant_id: 'tenant-1',
        name: 'Test',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'NYC',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 1000,
        image_gallery: 'invalid-json',
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(dbVenue);

      const result = await venueModel.findById('venue-1');

      expect(result?.image_gallery).toEqual([]);
    });

    it('should create address object from flat columns', async () => {
      const dbVenue = {
        id: 'venue-1',
        tenant_id: 'tenant-1',
        name: 'Test',
        email: 'test@test.com',
        address_line1: '123 Main St',
        city: 'Boston',
        state_province: 'MA',
        postal_code: '02101',
        country_code: 'US',
        venue_type: 'theater',
        max_capacity: 500,
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(dbVenue);

      const result = await venueModel.findById('venue-1');

      expect(result?.address).toEqual({
        street: '123 Main St',
        city: 'Boston',
        state: 'MA',
        zipCode: '02101',
        country: 'US',
      });
    });

    it('should map venue_type to type', async () => {
      const dbVenue = {
        id: 'venue-1',
        tenant_id: 'tenant-1',
        name: 'Test',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'NYC',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'stadium',
        max_capacity: 50000,
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(dbVenue);

      const result = await venueModel.findById('venue-1');

      expect(result?.type).toBe('stadium');
      expect(result?.venue_type).toBe('stadium');
    });

    it('should map status to is_active', async () => {
      const dbVenue = {
        id: 'venue-1',
        tenant_id: 'tenant-1',
        name: 'Test',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'NYC',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 1000,
        status: 'ACTIVE',
      };
      mockDb._mockQueryBuilder.first.mockResolvedValue(dbVenue);

      const result = await venueModel.findById('venue-1');

      expect(result?.is_active).toBe(true);
      expect(result?.status).toBe('ACTIVE');
    });
  });

  // =============================================================================
  // generateSlug() - 3 test cases (testing via createWithDefaults)
  // =============================================================================

  describe('generateSlug (via createWithDefaults)', () => {
    it('should convert name to lowercase slug', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.createWithDefaults({
        tenant_id: 'tenant-1',
        name: 'Madison Square Garden',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'NYC',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 20000,
      });

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'madison-square-garden',
        })
      );
    });

    it('should replace spaces and special characters with hyphens', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.createWithDefaults({
        tenant_id: 'tenant-1',
        name: 'The O2 Arena & Stadium',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'London',
        state_province: 'LDN',
        country_code: 'GB',
        venue_type: 'arena',
        max_capacity: 20000,
      });

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: expect.stringMatching(/^the-o2-arena-stadium$/),
        })
      );
    });

    it('should remove leading and trailing hyphens', async () => {
      mockDb._mockQueryBuilder.returning.mockResolvedValue([{ id: 'venue-1' }]);

      await venueModel.createWithDefaults({
        tenant_id: 'tenant-1',
        name: '---Test Venue!!!',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'NYC',
        state_province: 'NY',
        country_code: 'US',
        venue_type: 'theater',
        max_capacity: 500,
      });

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: expect.not.stringMatching(/^-|-$/),
        })
      );
    });
  });
});
