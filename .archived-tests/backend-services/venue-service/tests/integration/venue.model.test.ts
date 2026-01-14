/**
 * VenueModel Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_VENUE_ID,
  db,
  pool
} from './setup';
import { VenueModel, IVenue } from '../../src/models/venue.model';
import { v4 as uuidv4 } from 'uuid';

describe('VenueModel', () => {
  let context: TestContext;
  let venueModel: VenueModel;

  beforeAll(async () => {
    context = await setupTestApp();
    venueModel = new VenueModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  // ==========================================================================
  // findById
  // ==========================================================================
  describe('findById', () => {
    it('should find venue by id', async () => {
      const venue = await venueModel.findById(TEST_VENUE_ID);

      expect(venue).toBeDefined();
      expect(venue!.id).toBe(TEST_VENUE_ID);
      expect(venue!.name).toBe('Test Venue');
    });

    it('should return null for non-existent venue', async () => {
      const venue = await venueModel.findById(uuidv4());

      expect(venue).toBeNull();
    });

    it('should transform database record to IVenue', async () => {
      const venue = await venueModel.findById(TEST_VENUE_ID);

      // Check all expected fields are present
      expect(venue!.id).toBeDefined();
      expect(venue!.tenant_id).toBeDefined();
      expect(venue!.name).toBeDefined();
      expect(venue!.slug).toBeDefined();
      expect(venue!.email).toBeDefined();
      expect(venue!.venue_type).toBeDefined();
      expect(venue!.max_capacity).toBeDefined();
    });

    it('should include legacy address object', async () => {
      const venue = await venueModel.findById(TEST_VENUE_ID);

      expect(venue!.address).toBeDefined();
      expect(venue!.address!.street).toBe(venue!.address_line1);
      expect(venue!.address!.city).toBe(venue!.city);
      expect(venue!.address!.state).toBe(venue!.state_province);
    });

    it('should include legacy type field', async () => {
      const venue = await venueModel.findById(TEST_VENUE_ID);

      expect(venue!.type).toBe(venue!.venue_type);
    });

    it('should include legacy capacity field', async () => {
      const venue = await venueModel.findById(TEST_VENUE_ID);

      expect(venue!.capacity).toBe(venue!.max_capacity);
    });

    it('should include is_active computed field', async () => {
      const venue = await venueModel.findById(TEST_VENUE_ID);

      expect(venue!.is_active).toBe(venue!.status === 'ACTIVE');
    });
  });

  // ==========================================================================
  // findBySlug
  // ==========================================================================
  describe('findBySlug', () => {
    it('should find venue by slug', async () => {
      const venue = await venueModel.findBySlug('test-venue');

      expect(venue).toBeDefined();
      expect(venue!.id).toBe(TEST_VENUE_ID);
      expect(venue!.slug).toBe('test-venue');
    });

    it('should return null for non-existent slug', async () => {
      const venue = await venueModel.findBySlug('non-existent-slug');

      expect(venue).toBeNull();
    });

    it('should not find soft-deleted venue', async () => {
      await pool.query('UPDATE venues SET deleted_at = NOW() WHERE id = $1', [TEST_VENUE_ID]);

      const venue = await venueModel.findBySlug('test-venue');

      expect(venue).toBeNull();

      // Restore
      await pool.query('UPDATE venues SET deleted_at = NULL WHERE id = $1', [TEST_VENUE_ID]);
    });
  });

  // ==========================================================================
  // createWithDefaults
  // ==========================================================================
  describe('createWithDefaults', () => {
    it('should create venue with required fields', async () => {
      const venueData: Partial<IVenue> = {
        tenant_id: TEST_TENANT_ID,
        name: 'New Test Venue',
        email: 'new@test.com',
        address_line1: '123 New St',
        city: 'New City',
        state_province: 'NC',
        country_code: 'US',
        venue_type: 'theater',
        max_capacity: 500
      };

      const venue = await venueModel.createWithDefaults(venueData);

      expect(venue.id).toBeDefined();
      expect(venue.name).toBe('New Test Venue');
      expect(venue.email).toBe('new@test.com');
      expect(venue.venue_type).toBe('theater');
      expect(venue.max_capacity).toBe(500);
    });

    it('should generate slug from name', async () => {
      const venue = await venueModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        name: 'My Amazing Venue',
        email: 'amazing@test.com',
        address_line1: '456 Amazing St',
        city: 'Amazing City',
        state_province: 'AC',
        country_code: 'US',
        venue_type: 'concert_hall',
        max_capacity: 1000
      });

      expect(venue.slug).toBe('my-amazing-venue');
    });

    it('should use provided slug if given', async () => {
      const venue = await venueModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        name: 'Custom Slug Venue',
        slug: 'custom-slug',
        email: 'custom@test.com',
        address_line1: '789 Custom St',
        city: 'Custom City',
        state_province: 'CC',
        country_code: 'US',
        venue_type: 'arena',
        max_capacity: 5000
      });

      expect(venue.slug).toBe('custom-slug');
    });

    it('should set default status to ACTIVE', async () => {
      const venue = await venueModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        name: 'Status Test Venue',
        email: 'status@test.com',
        address_line1: '111 Status St',
        city: 'Status City',
        state_province: 'SC',
        country_code: 'US',
        venue_type: 'bar',
        max_capacity: 100
      });

      expect(venue.status).toBe('ACTIVE');
    });

    it('should set default is_verified to false', async () => {
      const venue = await venueModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        name: 'Verify Test Venue',
        email: 'verify@test.com',
        address_line1: '222 Verify St',
        city: 'Verify City',
        state_province: 'VC',
        country_code: 'US',
        venue_type: 'nightclub',
        max_capacity: 200
      });

      expect(venue.is_verified).toBe(false);
    });

    it('should set default timezone to UTC', async () => {
      const venue = await venueModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        name: 'Timezone Test Venue',
        email: 'tz@test.com',
        address_line1: '333 TZ St',
        city: 'TZ City',
        state_province: 'TZ',
        country_code: 'US',
        venue_type: 'lounge',
        max_capacity: 150
      });

      expect(venue.timezone).toBe('UTC');
    });

    it('should set default stats to zero', async () => {
      const venue = await venueModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        name: 'Stats Test Venue',
        email: 'stats@test.com',
        address_line1: '444 Stats St',
        city: 'Stats City',
        state_province: 'ST',
        country_code: 'US',
        venue_type: 'restaurant',
        max_capacity: 80
      });

      expect(venue.total_events).toBe(0);
      expect(venue.total_tickets_sold).toBe(0);
      expect(venue.total_reviews).toBe(0);
    });
  });

  // ==========================================================================
  // update
  // ==========================================================================
  describe('update', () => {
    it('should update venue fields', async () => {
      const updated = await venueModel.update(TEST_VENUE_ID, {
        name: 'Updated Venue Name',
        max_capacity: 2000
      });

      expect(updated.name).toBe('Updated Venue Name');
      expect(updated.max_capacity).toBe(2000);
    });

    it('should handle legacy address format', async () => {
      const updated = await venueModel.update(TEST_VENUE_ID, {
        address: {
          street: '999 Legacy St',
          city: 'Legacy City',
          state: 'LC',
          zipCode: '99999'
        }
      });

      expect(updated.address_line1).toBe('999 Legacy St');
      expect(updated.city).toBe('Legacy City');
      expect(updated.state_province).toBe('LC');
      expect(updated.postal_code).toBe('99999');
    });

    it('should handle legacy type field', async () => {
      const updated = await venueModel.update(TEST_VENUE_ID, {
        type: 'stadium'
      });

      expect(updated.venue_type).toBe('stadium');
    });

    it('should handle legacy capacity field', async () => {
      const updated = await venueModel.update(TEST_VENUE_ID, {
        capacity: 3000
      });

      expect(updated.max_capacity).toBe(3000);
    });

    it('should handle is_active to status conversion', async () => {
      const updated = await venueModel.update(TEST_VENUE_ID, {
        is_active: false
      });

      expect(updated.status).toBe('INACTIVE');
    });

    it('should update updated_at timestamp', async () => {
      const before = await venueModel.findById(TEST_VENUE_ID);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = await venueModel.update(TEST_VENUE_ID, { name: 'Timestamp Test' });

      expect(new Date(updated.updated_at!).getTime()).toBeGreaterThan(
        new Date(before!.updated_at!).getTime()
      );
    });
  });

  // ==========================================================================
  // searchVenues
  // ==========================================================================
  describe('searchVenues', () => {
    it('should search by name', async () => {
      const venues = await venueModel.searchVenues('Test');

      expect(venues.length).toBeGreaterThan(0);
      expect(venues[0].name).toContain('Test');
    });

    it('should search by city', async () => {
      const venues = await venueModel.searchVenues('Test City');

      expect(venues.length).toBeGreaterThan(0);
    });

    it('should search by description', async () => {
      await pool.query(
        'UPDATE venues SET description = $1 WHERE id = $2',
        ['This is a unique searchable description', TEST_VENUE_ID]
      );

      const venues = await venueModel.searchVenues('unique searchable');

      expect(venues.length).toBeGreaterThan(0);
    });

    it('should filter by venue type', async () => {
      const venues = await venueModel.searchVenues('', { type: 'theater' });

      venues.forEach(v => {
        expect(v.venue_type).toBe('theater');
      });
    });

    it('should filter by city', async () => {
      const venues = await venueModel.searchVenues('', { city: 'Test City' });

      venues.forEach(v => {
        expect(v.city.toLowerCase()).toContain('test city');
      });
    });

    it('should filter by state', async () => {
      const venues = await venueModel.searchVenues('', { state: 'TS' });

      venues.forEach(v => {
        expect(v.state_province.toLowerCase()).toContain('ts');
      });
    });

    it('should respect limit', async () => {
      const venues = await venueModel.searchVenues('', { limit: 1 });

      expect(venues.length).toBeLessThanOrEqual(1);
    });

    it('should respect offset', async () => {
      const all = await venueModel.searchVenues('');
      const withOffset = await venueModel.searchVenues('', { offset: 1 });

      if (all.length > 1) {
        expect(withOffset.length).toBe(all.length - 1);
      }
    });

    it('should sort by name', async () => {
      const venues = await venueModel.searchVenues('', { sort_by: 'name', sort_order: 'asc' });

      for (let i = 1; i < venues.length; i++) {
        expect(venues[i].name >= venues[i - 1].name).toBe(true);
      }
    });

    it('should sort by capacity', async () => {
      // Create additional venue with different capacity
      await venueModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        name: 'Large Venue',
        email: 'large@test.com',
        address_line1: '123 Large St',
        city: 'Large City',
        state_province: 'LG',
        country_code: 'US',
        venue_type: 'stadium',
        max_capacity: 50000
      });

      const venues = await venueModel.searchVenues('', { sort_by: 'capacity', sort_order: 'desc' });

      for (let i = 1; i < venues.length; i++) {
        expect(venues[i].max_capacity <= venues[i - 1].max_capacity).toBe(true);
      }
    });

    it('should only return active venues', async () => {
      await pool.query('UPDATE venues SET status = $1 WHERE id = $2', ['INACTIVE', TEST_VENUE_ID]);

      const venues = await venueModel.searchVenues('Test');

      expect(venues.find(v => v.id === TEST_VENUE_ID)).toBeUndefined();

      // Restore
      await pool.query('UPDATE venues SET status = $1 WHERE id = $2', ['ACTIVE', TEST_VENUE_ID]);
    });
  });

  // ==========================================================================
  // getActiveVenues
  // ==========================================================================
  describe('getActiveVenues', () => {
    it('should return only active venues', async () => {
      const venues = await venueModel.getActiveVenues();

      venues.forEach(v => {
        expect(v.status).toBe('ACTIVE');
      });
    });

    it('should respect limit option', async () => {
      const venues = await venueModel.getActiveVenues({ limit: 1 });

      expect(venues.length).toBeLessThanOrEqual(1);
    });
  });

  // ==========================================================================
  // getVenuesByType
  // ==========================================================================
  describe('getVenuesByType', () => {
    it('should return venues of specific type', async () => {
      const venues = await venueModel.getVenuesByType('theater');

      venues.forEach(v => {
        expect(v.venue_type).toBe('theater');
      });
    });
  });

  // ==========================================================================
  // getVenueStats
  // ==========================================================================
  describe('getVenueStats', () => {
    it('should return venue with stats', async () => {
      const result = await venueModel.getVenueStats(TEST_VENUE_ID);

      expect(result).toBeDefined();
      expect(result.venue).toBeDefined();
      expect(result.venue.id).toBe(TEST_VENUE_ID);
      expect(result.stats).toBeDefined();
    });

    it('should include all stat fields', async () => {
      const result = await venueModel.getVenueStats(TEST_VENUE_ID);

      expect(result.stats.totalEvents).toBeDefined();
      expect(result.stats.totalTicketsSold).toBeDefined();
      expect(result.stats.totalRevenue).toBeDefined();
      expect(result.stats.activeStaff).toBeDefined();
      expect(result.stats.averageRating).toBeDefined();
      expect(result.stats.totalReviews).toBeDefined();
    });

    it('should return null for non-existent venue', async () => {
      const result = await venueModel.getVenueStats(uuidv4());

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // updateOnboardingStatus
  // ==========================================================================
  describe('updateOnboardingStatus', () => {
    it('should update onboarding status in metadata', async () => {
      const result = await venueModel.updateOnboardingStatus(TEST_VENUE_ID, 'in_progress');

      expect(result).toBe(true);

      const venue = await venueModel.findById(TEST_VENUE_ID);
      expect(venue!.onboarding_status).toBe('in_progress');
    });

    it('should handle completed status', async () => {
      await venueModel.updateOnboardingStatus(TEST_VENUE_ID, 'completed');

      const venue = await venueModel.findById(TEST_VENUE_ID);
      expect(venue!.onboarding_status).toBe('completed');
    });
  });

  // ==========================================================================
  // withTransaction
  // ==========================================================================
  describe('withTransaction', () => {
    it('should work within transaction', async () => {
      await context.db.transaction(async (trx) => {
        const trxModel = venueModel.withTransaction(trx);
        
        const venue = await trxModel.findById(TEST_VENUE_ID);
        expect(venue).toBeDefined();
        
        await trxModel.update(TEST_VENUE_ID, { name: 'Transaction Update' });
      });

      const venue = await venueModel.findById(TEST_VENUE_ID);
      expect(venue!.name).toBe('Transaction Update');
    });

    it('should rollback on error', async () => {
      const originalName = (await venueModel.findById(TEST_VENUE_ID))!.name;

      try {
        await context.db.transaction(async (trx) => {
          const trxModel = venueModel.withTransaction(trx);
          await trxModel.update(TEST_VENUE_ID, { name: 'Should Rollback' });
          throw new Error('Force rollback');
        });
      } catch (e) {
        // Expected
      }

      const venue = await venueModel.findById(TEST_VENUE_ID);
      expect(venue!.name).toBe(originalName);
    });
  });
});
