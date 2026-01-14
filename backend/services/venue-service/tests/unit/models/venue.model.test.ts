/**
 * Unit tests for VenueModel
 * Tests venue CRUD operations with legacy field transformations
 */

import { createKnexMock, configureMockReturn } from '../../__mocks__/knex.mock';
import { VenueModel, IVenue } from '../../../src/models/venue.model';

describe('VenueModel', () => {
  let mockKnex: any;
  let venueModel: VenueModel;

  // Sample database row (what comes from DB)
  const sampleDbRow = {
    id: 'venue-123',
    tenant_id: 'tenant-456',
    name: 'Test Venue',
    slug: 'test-venue',
    description: 'A test venue',
    email: 'venue@test.com',
    phone: '555-1234',
    website: 'https://testvenue.com',
    address_line1: '123 Main St',
    address_line2: 'Suite 100',
    city: 'New York',
    state_province: 'NY',
    postal_code: '10001',
    country_code: 'US',
    latitude: '40.7128',
    longitude: '-74.0060',
    timezone: 'America/New_York',
    venue_type: 'theater',
    max_capacity: 500,
    standing_capacity: 300,
    seated_capacity: 500,
    vip_capacity: 50,
    logo_url: 'https://cdn.test.com/logo.png',
    cover_image_url: 'https://cdn.test.com/cover.png',
    image_gallery: '["img1.png", "img2.png"]',
    virtual_tour_url: 'https://tour.test.com',
    business_name: 'Test Venue LLC',
    business_registration: 'REG123',
    tax_id: 'TAX456',
    business_type: 'LLC',
    wallet_address: 'wallet123',
    collection_address: 'collection456',
    royalty_percentage: '2.50',
    stripe_connect_account_id: 'acct_123',
    stripe_connect_status: 'active',
    stripe_connect_charges_enabled: true,
    stripe_connect_payouts_enabled: true,
    stripe_connect_details_submitted: true,
    stripe_connect_capabilities: { card_payments: 'active' },
    stripe_connect_country: 'US',
    stripe_connect_onboarded_at: new Date('2024-01-01'),
    status: 'ACTIVE',
    is_verified: true,
    verified_at: new Date('2024-01-15'),
    verification_level: 'full',
    features: ['wifi', 'parking'],
    amenities: { bar: true, food: true },
    accessibility_features: ['wheelchair_ramp'],
    age_restriction: 21,
    dress_code: 'Smart casual',
    prohibited_items: ['weapons'],
    cancellation_policy: '24 hours',
    refund_policy: 'Full refund',
    social_media: { twitter: '@testvenue' },
    average_rating: '4.50',
    total_reviews: 100,
    total_events: 50,
    total_tickets_sold: 5000,
    metadata: { onboarding_status: 'completed' },
    tags: ['music', 'live'],
    created_by: 'user-123',
    updated_by: 'user-456',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
    deleted_at: null,
  };

  beforeEach(() => {
    mockKnex = createKnexMock();
    venueModel = new VenueModel(mockKnex);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with venues table name', () => {
      expect((venueModel as any).tableName).toBe('venues');
    });
  });

  describe('findBySlug', () => {
    it('should find venue by slug and transform result', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findBySlug('test-venue');

      expect(mockKnex).toHaveBeenCalledWith('venues');
      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ slug: 'test-venue' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBeDefined();
      expect(result?.name).toBe('Test Venue');
      expect(result?.address).toBeDefined();
    });

    it('should return null when venue not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await venueModel.findBySlug('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find venue by id and transform result', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('venue-123');
      expect(result?.address).toEqual({
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'US',
      });
    });

    it('should return null when venue not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await venueModel.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('transformFromDb (DB → API)', () => {
    it('should transform flat address columns to address object', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.address).toEqual({
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'US',
      });
    });

    it('should parse JSON image_gallery string', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.image_gallery).toEqual(['img1.png', 'img2.png']);
    });

    it('should handle invalid JSON in image_gallery', async () => {
      const rowWithBadJson = { ...sampleDbRow, image_gallery: 'invalid json' };
      mockKnex._mockChain.first.mockResolvedValue(rowWithBadJson);

      const result = await venueModel.findById('venue-123');

      expect(result?.image_gallery).toEqual([]);
    });

    it('should parse numeric strings to numbers', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.latitude).toBe(40.7128);
      expect(result?.longitude).toBe(-74.006);
      expect(result?.royalty_percentage).toBe(2.5);
      expect(result?.average_rating).toBe(4.5);
    });

    it('should map venue_type to type for legacy support', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.type).toBe('theater');
      expect(result?.venue_type).toBe('theater');
    });

    it('should map max_capacity to capacity for legacy support', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.capacity).toBe(500);
      expect(result?.max_capacity).toBe(500);
    });

    it('should derive is_active from status', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.is_active).toBe(true);
    });

    it('should derive onboarding_status from metadata', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.onboarding_status).toBe('completed');
    });

    it('should handle missing latitude/longitude', async () => {
      const rowWithoutCoords = { ...sampleDbRow, latitude: null, longitude: null };
      mockKnex._mockChain.first.mockResolvedValue(rowWithoutCoords);

      const result = await venueModel.findById('venue-123');

      expect(result?.latitude).toBeUndefined();
      expect(result?.longitude).toBeUndefined();
    });
  });

  describe('createWithDefaults', () => {
    it('should create venue with default values', async () => {
      const inputData: Partial<IVenue> = {
        tenant_id: 'tenant-123',
        name: 'New Venue',
        email: 'new@venue.com',
        address_line1: '456 Oak St',
        city: 'Los Angeles',
        state_province: 'CA',
        country_code: 'US',
        venue_type: 'concert_hall',
        max_capacity: 1000,
      };

      mockKnex._mockChain.returning.mockResolvedValue([{
        ...inputData,
        id: 'new-venue-id',
        slug: 'new-venue',
        status: 'ACTIVE',
        timezone: 'UTC',
        is_verified: false,
        average_rating: '0.00',
        total_reviews: 0,
        total_events: 0,
        total_tickets_sold: 0,
        royalty_percentage: '2.50',
        age_restriction: 0,
        created_at: new Date(),
      }]);

      const result = await venueModel.createWithDefaults(inputData);

      expect(mockKnex._mockChain.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.slug).toBe('new-venue');
    });

    it('should generate slug from name if not provided', async () => {
      const inputData: Partial<IVenue> = {
        tenant_id: 'tenant-123',
        name: 'My Awesome Venue!',
        email: 'awesome@venue.com',
        address_line1: '789 Elm St',
        city: 'Chicago',
        state_province: 'IL',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 5000,
      };

      mockKnex._mockChain.returning.mockResolvedValue([{
        ...inputData,
        id: 'venue-id',
        slug: 'my-awesome-venue',
        created_at: new Date(),
      }]);

      await venueModel.createWithDefaults(inputData);

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.slug).toBe('my-awesome-venue');
    });

    it('should use provided slug if present', async () => {
      const inputData: Partial<IVenue> = {
        tenant_id: 'tenant-123',
        name: 'Custom Venue',
        slug: 'custom-slug',
        email: 'custom@venue.com',
        address_line1: '101 Pine St',
        city: 'Miami',
        state_province: 'FL',
        country_code: 'US',
        venue_type: 'theater',
        max_capacity: 800,
      };

      mockKnex._mockChain.returning.mockResolvedValue([{
        ...inputData,
        id: 'venue-id',
        created_at: new Date(),
      }]);

      await venueModel.createWithDefaults(inputData);

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.slug).toBe('custom-slug');
    });

    it('should set default status to ACTIVE', async () => {
      const inputData: Partial<IVenue> = {
        tenant_id: 'tenant-123',
        name: 'Status Test Venue',
        email: 'status@venue.com',
        address_line1: '202 Cedar St',
        city: 'Seattle',
        state_province: 'WA',
        country_code: 'US',
        venue_type: 'nightclub',
        max_capacity: 300,
      };

      mockKnex._mockChain.returning.mockResolvedValue([{
        ...inputData,
        id: 'venue-id',
        slug: 'status-test-venue',
        status: 'ACTIVE',
        created_at: new Date(),
      }]);

      await venueModel.createWithDefaults(inputData);

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.status).toBe('ACTIVE');
    });

    it('should set default timezone to UTC', async () => {
      const inputData: Partial<IVenue> = {
        tenant_id: 'tenant-123',
        name: 'Timezone Test',
        email: 'tz@venue.com',
        address_line1: '303 Birch St',
        city: 'Denver',
        state_province: 'CO',
        country_code: 'US',
        venue_type: 'bar',
        max_capacity: 150,
      };

      mockKnex._mockChain.returning.mockResolvedValue([{
        ...inputData,
        id: 'venue-id',
        slug: 'timezone-test',
        timezone: 'UTC',
        created_at: new Date(),
      }]);

      await venueModel.createWithDefaults(inputData);

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.timezone).toBe('UTC');
    });
  });

  describe('transformForDb (API → DB)', () => {
    it('should transform address object to flat columns', async () => {
      const inputData: Partial<IVenue> = {
        name: 'Address Test',
        address: {
          street: '100 Broadway',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
          country: 'US',
        },
      };

      mockKnex._mockChain.returning.mockResolvedValue([{ id: 'venue-id', ...inputData }]);

      await venueModel.update('venue-id', inputData);

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.address_line1).toBe('100 Broadway');
      expect(updateCall.city).toBe('Boston');
      expect(updateCall.state_province).toBe('MA');
      expect(updateCall.postal_code).toBe('02101');
      expect(updateCall.country_code).toBe('US');
    });

    it('should use flat address fields when address object not provided', async () => {
      const inputData: Partial<IVenue> = {
        name: 'Flat Address Test',
        address_line1: '200 Market St',
        city: 'San Francisco',
        state_province: 'CA',
        postal_code: '94102',
        country_code: 'US',
      };

      mockKnex._mockChain.returning.mockResolvedValue([{ id: 'venue-id', ...inputData }]);

      await venueModel.update('venue-id', inputData);

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.address_line1).toBe('200 Market St');
      expect(updateCall.city).toBe('San Francisco');
    });

    it('should map type to venue_type', async () => {
      const inputData: Partial<IVenue> = {
        type: 'stadium',
      };

      mockKnex._mockChain.returning.mockResolvedValue([{ id: 'venue-id', venue_type: 'stadium' }]);

      await venueModel.update('venue-id', inputData);

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.venue_type).toBe('stadium');
    });

    it('should map capacity to max_capacity', async () => {
      const inputData: Partial<IVenue> = {
        capacity: 2000,
      };

      mockKnex._mockChain.returning.mockResolvedValue([{ id: 'venue-id', max_capacity: 2000 }]);

      await venueModel.update('venue-id', inputData);

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.max_capacity).toBe(2000);
    });

    it('should map is_active to status', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{ id: 'venue-id', status: 'INACTIVE' }]);

      await venueModel.update('venue-id', { is_active: false });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.status).toBe('INACTIVE');
    });

    it('should stringify image_gallery array', async () => {
      const inputData: Partial<IVenue> = {
        image_gallery: ['new1.png', 'new2.png'],
      };

      mockKnex._mockChain.returning.mockResolvedValue([{ id: 'venue-id' }]);

      await venueModel.update('venue-id', inputData);

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.image_gallery).toBe('["new1.png","new2.png"]');
    });
  });

  describe('update', () => {
    it('should update venue and return transformed result', async () => {
      const updateData: Partial<IVenue> = {
        name: 'Updated Venue Name',
        description: 'Updated description',
      };

      mockKnex._mockChain.returning.mockResolvedValue([{
        ...sampleDbRow,
        name: 'Updated Venue Name',
        description: 'Updated description',
      }]);

      const result = await venueModel.update('venue-123', updateData);

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ id: 'venue-123' });
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result.name).toBe('Updated Venue Name');
      expect(result.address).toBeDefined();
    });

    it('should set updated_at timestamp', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([sampleDbRow]);

      await venueModel.update('venue-123', { name: 'Test' });

      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('updateOnboardingStatus', () => {
    it('should update onboarding status in metadata', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{
        ...sampleDbRow,
        metadata: { onboarding_status: 'in_progress' },
      }]);

      const result = await venueModel.updateOnboardingStatus('venue-123', 'in_progress');

      expect(result).toBe(true);
      const updateCall = mockKnex._mockChain.update.mock.calls[0][0];
      expect(updateCall.metadata).toEqual({ onboarding_status: 'in_progress' });
    });

    it('should return false when venue not found', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([null]);

      const result = await venueModel.updateOnboardingStatus('non-existent', 'completed');

      expect(result).toBe(false);
    });
  });

  describe('canReceivePayments', () => {
    it('should return true when both charges and payouts are enabled', () => {
      const venue: IVenue = {
        ...sampleDbRow,
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: true,
      } as unknown as IVenue;

      const result = venueModel.canReceivePayments(venue);

      expect(result).toBe(true);
    });

    it('should return false when charges are disabled', () => {
      const venue: IVenue = {
        ...sampleDbRow,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: true,
      } as unknown as IVenue;

      const result = venueModel.canReceivePayments(venue);

      expect(result).toBe(false);
    });

    it('should return false when payouts are disabled', () => {
      const venue: IVenue = {
        ...sampleDbRow,
        stripe_connect_charges_enabled: true,
        stripe_connect_payouts_enabled: false,
      } as unknown as IVenue;

      const result = venueModel.canReceivePayments(venue);

      expect(result).toBe(false);
    });

    it('should return false when both are disabled', () => {
      const venue: IVenue = {
        ...sampleDbRow,
        stripe_connect_charges_enabled: false,
        stripe_connect_payouts_enabled: false,
      } as unknown as IVenue;

      const result = venueModel.canReceivePayments(venue);

      expect(result).toBe(false);
    });

    it('should return false when stripe fields are undefined', () => {
      const venue: IVenue = {
        tenant_id: 'tenant-123',
        name: 'No Stripe Venue',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        venue_type: 'bar',
        max_capacity: 100,
      } as IVenue;

      const result = venueModel.canReceivePayments(venue);

      expect(result).toBe(false);
    });
  });

  describe('getActiveVenues', () => {
    it('should return only active venues', async () => {
      const activeVenues = [sampleDbRow, { ...sampleDbRow, id: 'venue-456' }];
      configureMockReturn(mockKnex, activeVenues);

      const result = await venueModel.getActiveVenues();

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ status: 'ACTIVE' });
      expect(result).toHaveLength(2);
    });

    it('should apply pagination options', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.getActiveVenues({ limit: 10, offset: 5 });

      expect(mockKnex._mockChain.limit).toHaveBeenCalledWith(10);
      expect(mockKnex._mockChain.offset).toHaveBeenCalledWith(5);
    });
  });

  describe('getVenuesByType', () => {
    it('should return venues of specific type', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      const result = await venueModel.getVenuesByType('theater');

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith({ venue_type: 'theater', status: 'ACTIVE' });
      expect(result).toHaveLength(1);
    });
  });

  describe('searchVenues', () => {
    it('should search venues by text in name, city, description', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('test');

      expect(mockKnex).toHaveBeenCalledWith('venues');
      expect(mockKnex._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockKnex._mockChain.where).toHaveBeenCalled();
    });

    it('should apply type filter when provided', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('test', { type: 'theater' });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith('venue_type', 'theater');
    });

    it('should apply city filter when provided', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('', { city: 'New York' });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith('city', 'ilike', 'New York');
    });

    it('should apply state filter when provided', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('', { state: 'NY' });

      expect(mockKnex._mockChain.where).toHaveBeenCalledWith('state_province', 'ilike', 'NY');
    });

    it('should sort by name by default', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('test');

      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('name', 'asc');
    });

    it('should sort by capacity when specified', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('test', { sort_by: 'capacity', sort_order: 'desc' });

      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('max_capacity', 'desc');
    });

    it('should sort by rating when specified', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('test', { sort_by: 'rating' });

      expect(mockKnex._mockChain.orderBy).toHaveBeenCalledWith('average_rating', 'asc');
    });

    it('should apply pagination defaults', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('test');

      expect(mockKnex._mockChain.limit).toHaveBeenCalledWith(20);
      expect(mockKnex._mockChain.offset).toHaveBeenCalledWith(0);
    });

    it('should apply custom pagination', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      await venueModel.searchVenues('test', { limit: 50, offset: 100 });

      expect(mockKnex._mockChain.limit).toHaveBeenCalledWith(50);
      expect(mockKnex._mockChain.offset).toHaveBeenCalledWith(100);
    });

    it('should transform results', async () => {
      configureMockReturn(mockKnex, [sampleDbRow]);

      const result = await venueModel.searchVenues('test');

      expect(result[0].address).toBeDefined();
      expect(result[0].type).toBe('theater');
    });
  });

  describe('getVenueStats', () => {
    it('should return venue with stats', async () => {
      mockKnex._mockChain.first.mockResolvedValue(sampleDbRow);

      const result = await venueModel.getVenueStats('venue-123');

      expect(result).toBeDefined();
      expect(result.venue).toBeDefined();
      expect(result.stats).toEqual({
        totalEvents: 50,
        totalTicketsSold: 5000,
        totalRevenue: 0,
        activeStaff: 0,
        averageRating: 4.5,
        totalReviews: 100,
      });
    });

    it('should return null when venue not found', async () => {
      mockKnex._mockChain.first.mockResolvedValue(null);

      const result = await venueModel.getVenueStats('non-existent');

      expect(result).toBeNull();
    });

    it('should handle venues with no stats', async () => {
      const venueNoStats = {
        ...sampleDbRow,
        total_events: null,
        total_tickets_sold: null,
        average_rating: null,
        total_reviews: null,
      };
      mockKnex._mockChain.first.mockResolvedValue(venueNoStats);

      const result = await venueModel.getVenueStats('venue-123');

      expect(result.stats.totalEvents).toBe(0);
      expect(result.stats.totalTicketsSold).toBe(0);
      expect(result.stats.averageRating).toBe(0);
      expect(result.stats.totalReviews).toBe(0);
    });
  });

  describe('generateSlug (private method tested via createWithDefaults)', () => {
    it('should convert name to lowercase slug', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{
        id: 'venue-id',
        slug: 'my-venue-name',
      }]);

      await venueModel.createWithDefaults({
        tenant_id: 'tenant-123',
        name: 'My Venue Name',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        venue_type: 'bar',
        max_capacity: 100,
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.slug).toBe('my-venue-name');
    });

    it('should replace special characters with hyphens', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{
        id: 'venue-id',
        slug: 'the-venue-rocks',
      }]);

      await venueModel.createWithDefaults({
        tenant_id: 'tenant-123',
        name: 'The Venue & Rocks!',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        venue_type: 'bar',
        max_capacity: 100,
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.slug).toBe('the-venue-rocks');
    });

    it('should strip leading and trailing hyphens', async () => {
      mockKnex._mockChain.returning.mockResolvedValue([{
        id: 'venue-id',
        slug: 'venue-name',
      }]);

      await venueModel.createWithDefaults({
        tenant_id: 'tenant-123',
        name: '---Venue Name---',
        email: 'test@test.com',
        address_line1: '123 St',
        city: 'City',
        state_province: 'ST',
        country_code: 'US',
        venue_type: 'bar',
        max_capacity: 100,
      });

      const insertCall = mockKnex._mockChain.insert.mock.calls[0][0];
      expect(insertCall.slug).toBe('venue-name');
    });
  });

  describe('withTransaction', () => {
    it('should create new instance with transaction', () => {
      const trxMock = createKnexMock();
      const transactionalModel = venueModel.withTransaction(trxMock);

      expect(transactionalModel).toBeInstanceOf(VenueModel);
      expect((transactionalModel as any).db).toBe(trxMock);
    });
  });

  describe('edge cases', () => {
    it('should handle empty address object fields', async () => {
      const rowWithEmptyAddress = {
        ...sampleDbRow,
        address_line1: '',
        city: '',
        state_province: '',
        postal_code: '',
        country_code: '',
      };
      mockKnex._mockChain.first.mockResolvedValue(rowWithEmptyAddress);

      const result = await venueModel.findById('venue-123');

      // Note: transformFromDb defaults country to 'US' if empty
      expect(result?.address).toEqual({
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'US',
      });
    });

    it('should handle null metadata for onboarding_status', async () => {
      const rowNoMetadata = { ...sampleDbRow, metadata: null };
      mockKnex._mockChain.first.mockResolvedValue(rowNoMetadata);

      const result = await venueModel.findById('venue-123');

      expect(result?.onboarding_status).toBe('pending');
    });

    it('should handle INACTIVE status for is_active', async () => {
      const inactiveRow = { ...sampleDbRow, status: 'INACTIVE' };
      mockKnex._mockChain.first.mockResolvedValue(inactiveRow);

      const result = await venueModel.findById('venue-123');

      expect(result?.is_active).toBe(false);
    });
  });
});
