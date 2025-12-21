import { VenueModel, IVenue } from '../../../src/models/venue.model';
import { v4 as uuidv4 } from 'uuid';

describe('Unit: Venue Model', () => {
  let mockDb: any;
  let venueModel: VenueModel;
  let mockQuery: any;

  beforeEach(() => {
    // Create a chainable mock that returns itself for all chainable methods
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereLike: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{}]),
      count: jest.fn().mockReturnThis(),
      then: undefined, // Prevent auto-resolution
    };

    // Make the mock function return mockQuery when called
    mockDb = jest.fn(() => mockQuery);
    
    // Also add the methods directly to mockDb for cases where it's used directly
    Object.keys(mockQuery).forEach(key => {
      if (typeof mockQuery[key] === 'function') {
        (mockDb as any)[key] = mockQuery[key];
      }
    });

    venueModel = new VenueModel(mockDb);
  });

  describe('findBySlug()', () => {
    it('should find venue by slug', async () => {
      const mockVenue = {
        id: uuidv4(),
        slug: 'test-venue',
        name: 'Test Venue',
        venue_type: 'theater',
        max_capacity: 100,
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        email: 'test@test.com',
        tenant_id: uuidv4(),
      };

      mockQuery.first.mockResolvedValue(mockVenue);

      const result = await venueModel.findBySlug('test-venue');

      expect(mockDb).toHaveBeenCalledWith('venues');
      expect(mockQuery.where).toHaveBeenCalledWith({ slug: 'test-venue' });
      expect(mockQuery.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBeDefined();
      expect(result?.slug).toBe('test-venue');
    });

    it('should return null for non-existent slug', async () => {
      mockQuery.first.mockResolvedValue(null);

      const result = await venueModel.findBySlug('non-existent');

      expect(result).toBeNull();
    });

    it('should transform data from database format', async () => {
      const mockVenue = {
        id: uuidv4(),
        slug: 'test-venue',
        name: 'Test Venue',
        venue_type: 'theater',
        max_capacity: 200,
        address_line1: '123 Main St',
        city: 'Test City',
        state_province: 'TS',
        postal_code: '12345',
        country_code: 'US',
        email: 'test@venue.com',
        tenant_id: uuidv4(),
        status: 'ACTIVE',
      };

      mockQuery.first.mockResolvedValue(mockVenue);

      const result = await venueModel.findBySlug('test-venue');

      expect(result?.address).toBeDefined();
      expect(result?.address?.street).toBe('123 Main St');
      expect(result?.capacity).toBe(200);
      expect(result?.type).toBe('theater');
    });
  });

  describe('createWithDefaults()', () => {
    it('should create venue with default values', async () => {
      const venueData: Partial<IVenue> = {
        name: 'New Venue',
        tenant_id: uuidv4(),
        email: 'new@venue.com',
        venue_type: 'theater',
        max_capacity: 500,
        address_line1: '456 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
      };

      const mockCreated = {
        id: uuidv4(),
        ...venueData,
        slug: 'new-venue',
        status: 'ACTIVE',
        is_verified: false,
        average_rating: 0.00,
        total_reviews: 0,
        total_events: 0,
        total_tickets_sold: 0,
        royalty_percentage: 2.50,
        age_restriction: 0,
        timezone: 'UTC',
      };

      mockQuery.returning.mockResolvedValue([mockCreated]);

      const result = await venueModel.createWithDefaults(venueData);

      expect(mockDb).toHaveBeenCalledWith('venues');
      expect(result).toBeDefined();
    });

    it('should generate slug from name', async () => {
      const venueData: Partial<IVenue> = {
        name: 'Test Venue With Spaces',
        tenant_id: uuidv4(),
        email: 'test@test.com',
        venue_type: 'theater',
        max_capacity: 100,
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
      };

      mockQuery.returning.mockResolvedValue([{ ...venueData, slug: 'test-venue-with-spaces' }]);

      await venueModel.createWithDefaults(venueData);

      expect(mockQuery.insert).toHaveBeenCalled();
      expect(mockQuery.returning).toHaveBeenCalled();
    });

    it('should use provided slug if given', async () => {
      const venueData: Partial<IVenue> = {
        name: 'Test Venue',
        slug: 'custom-slug',
        tenant_id: uuidv4(),
        email: 'test@test.com',
        venue_type: 'theater',
        max_capacity: 100,
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
      };

      mockQuery.returning.mockResolvedValue([venueData]);

      await venueModel.createWithDefaults(venueData);

      expect(mockQuery.insert).toHaveBeenCalled();
      expect(mockQuery.returning).toHaveBeenCalled();
    });
  });

  describe('transformation methods', () => {
    it('should transform legacy address object to flat columns', async () => {
      const venueData: Partial<IVenue> = {
        name: 'Test',
        tenant_id: uuidv4(),
        email: 'test@test.com',
        venue_type: 'theater',
        max_capacity: 100,
        address: {
          street: '123 Main St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        }
      };

      mockQuery.returning.mockResolvedValue([{
        ...venueData,
        address_line1: '123 Main St',
        city: 'Test City',
        state_province: 'TS',
        postal_code: '12345',
        country_code: 'US'
      }]);

      await venueModel.createWithDefaults(venueData);

      expect(mockQuery.insert).toHaveBeenCalled();
      expect(mockQuery.returning).toHaveBeenCalled();
    });

    it('should parse image_gallery JSON string', async () => {
      const mockVenue = {
        id: uuidv4(),
        slug: 'test',
        name: 'Test',
        venue_type: 'theater',
        max_capacity: 100,
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        email: 'test@test.com',
        tenant_id: uuidv4(),
        image_gallery: '["image1.jpg", "image2.jpg"]'
      };

      mockQuery.first.mockResolvedValue(mockVenue);

      const result = await venueModel.findBySlug('test');

      expect(Array.isArray(result?.image_gallery)).toBe(true);
      expect(result?.image_gallery).toHaveLength(2);
    });

    it('should handle invalid image_gallery JSON', async () => {
      const mockVenue = {
        id: uuidv4(),
        slug: 'test',
        name: 'Test',
        venue_type: 'theater',
        max_capacity: 100,
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        email: 'test@test.com',
        tenant_id: uuidv4(),
        image_gallery: 'invalid-json'
      };

      mockQuery.first.mockResolvedValue(mockVenue);

      const result = await venueModel.findBySlug('test');

      expect(Array.isArray(result?.image_gallery)).toBe(true);
      expect(result?.image_gallery).toHaveLength(0);
    });
  });

  describe('getActiveVenues()', () => {
    it('should retrieve only active venues', async () => {
      const mockVenues = [
        { id: uuidv4(), status: 'ACTIVE', name: 'Venue 1', venue_type: 'theater', max_capacity: 100 },
        { id: uuidv4(), status: 'ACTIVE', name: 'Venue 2', venue_type: 'arena', max_capacity: 200 },
      ];

      // Make the chain resolve to mockVenues at the end
      mockQuery.offset.mockResolvedValue(mockVenues);

      const result = await venueModel.getActiveVenues();

      expect(mockDb).toHaveBeenCalled();
      expect(result.length).toBe(mockVenues.length);
      expect(result[0].id).toBe(mockVenues[0].id);
      expect(result[0].name).toBe(mockVenues[0].name);
    });
  });

  describe('getVenuesByType()', () => {
    it('should filter venues by type', async () => {
      const mockVenues = [
        { id: uuidv4(), venue_type: 'theater', status: 'ACTIVE', name: 'Theater 1' },
        { id: uuidv4(), venue_type: 'theater', status: 'ACTIVE', name: 'Theater 2' },
      ];

      mockQuery.offset.mockResolvedValue(mockVenues);

      const result = await venueModel.getVenuesByType('theater');

      expect(mockDb).toHaveBeenCalled();
      expect(result.length).toBe(mockVenues.length);
      expect(result[0].id).toBe(mockVenues[0].id);
      expect(result[0].name).toBe(mockVenues[0].name);
    });
  });

  describe('searchVenues()', () => {
    beforeEach(() => {
      // Setup for search - make limit return an array (the final step before .map)
      mockQuery.limit.mockReturnValue({
        offset: jest.fn().mockResolvedValue([])
      });
    });

    it('should search venues by name', async () => {
      const mockVenues = [
        { id: uuidv4(), name: 'Test Venue', venue_type: 'theater', max_capacity: 100, address_line1: '123 St', city: 'City', state_province: 'ST', country_code: 'US' }
      ];

      mockQuery.limit.mockReturnValue({
        offset: jest.fn().mockResolvedValue(mockVenues)
      });

      mockQuery.where.mockImplementation(function(this: any, arg: any) {
        if (typeof arg === 'function') {
          arg.call(mockQuery);
        }
        return mockQuery;
      });

      const result = await venueModel.searchVenues('test', {});

      expect(mockDb).toHaveBeenCalledWith('venues');
      expect(mockQuery.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should apply type filter', async () => {
      mockQuery.where.mockImplementation(function(this: any, arg: any) {
        if (typeof arg === 'function') {
          arg.call(mockQuery);
        }
        return mockQuery;
      });

      await venueModel.searchVenues('', { type: 'theater' });

      expect(mockQuery.where).toHaveBeenCalled();
    });

    it('should apply city filter', async () => {
      mockQuery.where.mockImplementation(function(this: any, arg: any) {
        if (typeof arg === 'function') {
          arg.call(mockQuery);
        }
        return mockQuery;
      });

      await venueModel.searchVenues('', { city: 'New York' });

      expect(mockQuery.where).toHaveBeenCalled();
    });

    it('should apply pagination', async () => {
      mockQuery.where.mockImplementation(function(this: any, arg: any) {
        if (typeof arg === 'function') {
          arg.call(mockQuery);
        }
        return mockQuery;
      });

      const limitMock = jest.fn().mockReturnValue({
        offset: jest.fn().mockResolvedValue([])
      });
      mockQuery.limit = limitMock;

      await venueModel.searchVenues('', { limit: 10, offset: 20 });

      expect(limitMock).toHaveBeenCalledWith(10);
    });

    it('should apply sorting', async () => {
      mockQuery.where.mockImplementation(function(this: any, arg: any) {
        if (typeof arg === 'function') {
          arg.call(mockQuery);
        }
        return mockQuery;
      });

      await venueModel.searchVenues('', { sort_by: 'created_at', sort_order: 'desc' });

      expect(mockQuery.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });
  });

  describe('updateOnboardingStatus()', () => {
    it('should update onboarding status', async () => {
      const venueId = uuidv4();
      mockQuery.returning.mockResolvedValue([{
        id: venueId,
        metadata: { onboarding_status: 'completed' }
      }]);

      const result = await venueModel.updateOnboardingStatus(venueId, 'completed');

      expect(result).toBe(true);
    });
  });

  describe('getVenueStats()', () => {
    it('should return venue with stats', async () => {
      const mockVenue = {
        id: uuidv4(),
        name: 'Test Venue',
        venue_type: 'theater',
        max_capacity: 100,
        total_events: 10,
        total_tickets_sold: 500,
        average_rating: 4.5,
        total_reviews: 20,
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        email: 'test@test.com',
        tenant_id: uuidv4(),
      };

      mockQuery.first.mockResolvedValue(mockVenue);

      const result = await venueModel.getVenueStats(mockVenue.id);

      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.stats.totalEvents).toBe(10);
      expect(result.stats.totalTicketsSold).toBe(500);
      expect(result.stats.averageRating).toBe(4.5);
    });

    it('should return null for non-existent venue', async () => {
      mockQuery.first.mockResolvedValue(null);

      const result = await venueModel.getVenueStats(uuidv4());

      expect(result).toBeNull();
    });
  });
});
