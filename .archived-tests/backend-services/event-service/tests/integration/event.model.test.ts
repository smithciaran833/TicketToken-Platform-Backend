/**
 * EventModel Integration Tests
 * 
 * Tests the EventModel class against the actual database.
 * Verifies CRUD operations, transformations, and query methods.
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  db,
  pool,
  redis,
} from './setup';
import { EventModel, IEvent } from '../../src/models/event.model';
import { v4 as uuidv4 } from 'uuid';

// Test constants - must match setup.ts
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';
const TEST_VENUE_ID = '00000000-0000-0000-0000-000000000077';

describe('EventModel', () => {
  let context: TestContext;
  let eventModel: EventModel;

  beforeAll(async () => {
    context = await setupTestApp();
    eventModel = new EventModel(context.db);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await cleanDatabase(db);
  });

  // ==========================================================================
  // Helper: Create event directly via pool (bypasses model for test isolation)
  // ==========================================================================
  async function createEventDirect(overrides: Partial<IEvent> = {}): Promise<any> {
    const id = overrides.id || uuidv4();
    const slug = overrides.slug || `test-event-${id.slice(0, 8)}`;

    const result = await pool.query(
      `INSERT INTO events (
        id, tenant_id, venue_id, name, slug, description, status, event_type,
        visibility, is_featured, priority_score, age_restriction, is_virtual,
        is_hybrid, cancellation_deadline_hours, view_count, interest_count,
        share_count, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        id,
        overrides.tenant_id || TEST_TENANT_ID,
        overrides.venue_id || TEST_VENUE_ID,
        overrides.name || 'Test Event',
        slug,
        overrides.description || 'Test description',
        overrides.status || 'DRAFT',
        overrides.event_type || 'single',
        overrides.visibility || 'PUBLIC',
        overrides.is_featured ?? false,
        overrides.priority_score ?? 0,
        overrides.age_restriction ?? 0,
        overrides.is_virtual ?? false,
        overrides.is_hybrid ?? false,
        overrides.cancellation_deadline_hours ?? 24,
        overrides.view_count ?? 0,
        overrides.interest_count ?? 0,
        overrides.share_count ?? 0,
        overrides.created_by || TEST_USER_ID,
      ]
    );

    return result.rows[0];
  }

  // ==========================================================================
  // findById
  // ==========================================================================
  describe('findById', () => {
    it('should find event by id', async () => {
      const created = await createEventDirect({ name: 'Find By ID Event' });

      const event = await eventModel.findById(created.id);

      expect(event).toBeDefined();
      expect(event!.id).toBe(created.id);
      expect(event!.name).toBe('Find By ID Event');
    });

    it('should return null for non-existent event', async () => {
      const event = await eventModel.findById(uuidv4());

      expect(event).toBeNull();
    });

    it('should not find soft-deleted event', async () => {
      const created = await createEventDirect({ name: 'Deleted Event' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const event = await eventModel.findById(created.id);

      expect(event).toBeNull();
    });

    it('should transform database record with all fields', async () => {
      const created = await createEventDirect({
        name: 'Full Transform Event',
        description: 'Full description',
        short_description: 'Short desc',
        event_type: 'recurring',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        is_featured: true,
        priority_score: 100,
        age_restriction: 21,
        is_virtual: true,
        is_hybrid: false,
      });

      const event = await eventModel.findById(created.id);

      expect(event!.id).toBe(created.id);
      expect(event!.tenant_id).toBe(TEST_TENANT_ID);
      expect(event!.venue_id).toBe(TEST_VENUE_ID);
      expect(event!.name).toBe('Full Transform Event');
      expect(event!.description).toBe('Full description');
      expect(event!.short_description).toBe('Short desc');
      expect(event!.event_type).toBe('recurring');
      expect(event!.status).toBe('PUBLISHED');
      expect(event!.visibility).toBe('PUBLIC');
      expect(event!.is_featured).toBe(true);
      expect(event!.priority_score).toBe(100);
      expect(event!.age_restriction).toBe(21);
      expect(event!.is_virtual).toBe(true);
      expect(event!.is_hybrid).toBe(false);
    });

    it('should include legacy compatibility fields (image_url, category)', async () => {
      const categoryId = uuidv4();
      
      // First insert a category since there's an FK constraint
      await pool.query(
        `INSERT INTO event_categories (id, name, slug) VALUES ($1, $2, $3)`,
        [categoryId, 'Test Category', `test-cat-${categoryId.slice(0, 8)}`]
      );

      const id = uuidv4();
      await pool.query(
        `INSERT INTO events (
          id, tenant_id, venue_id, name, slug, status, event_type,
          banner_image_url, primary_category_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id, TEST_TENANT_ID, TEST_VENUE_ID, 'Legacy Event', `legacy-event-${id.slice(0,8)}`,
          'DRAFT', 'single', 'https://example.com/image.jpg', categoryId, TEST_USER_ID
        ]
      );

      const event = await eventModel.findById(id);

      // Legacy fields should be mapped
      expect(event!.image_url).toBe('https://example.com/image.jpg');
      expect(event!.category).toBe(categoryId);
    });
  });

  // ==========================================================================
  // findBySlug
  // ==========================================================================
  describe('findBySlug', () => {
    it('should find event by slug', async () => {
      await createEventDirect({ name: 'Slug Test Event', slug: 'slug-test-event' });

      const event = await eventModel.findBySlug('slug-test-event');

      expect(event).toBeDefined();
      expect(event!.slug).toBe('slug-test-event');
      expect(event!.name).toBe('Slug Test Event');
    });

    it('should return null for non-existent slug', async () => {
      const event = await eventModel.findBySlug('non-existent-slug');

      expect(event).toBeNull();
    });

    it('should not find soft-deleted event by slug', async () => {
      const created = await createEventDirect({ slug: 'deleted-slug-event' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const event = await eventModel.findBySlug('deleted-slug-event');

      expect(event).toBeNull();
    });
  });

  // ==========================================================================
  // createWithDefaults
  // ==========================================================================
  describe('createWithDefaults', () => {
    it('should create event with required fields', async () => {
      const eventData: Partial<IEvent> = {
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'New Event',
        created_by: TEST_USER_ID,
      };

      const event = await eventModel.createWithDefaults(eventData);

      expect(event.id).toBeDefined();
      expect(event.name).toBe('New Event');
      expect(event.tenant_id).toBe(TEST_TENANT_ID);
      expect(event.venue_id).toBe(TEST_VENUE_ID);

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM events WHERE id = $1', [event.id]);
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].name).toBe('New Event');
    });

    it('should generate slug from name', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'My Amazing Concert Event',
        created_by: TEST_USER_ID,
      });

      expect(event.slug).toBe('my-amazing-concert-event');
    });

    it('should use provided slug if given', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Custom Slug Event',
        slug: 'custom-slug',
        created_by: TEST_USER_ID,
      });

      expect(event.slug).toBe('custom-slug');
    });

    it('should set default status to DRAFT', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Default Status Event',
        created_by: TEST_USER_ID,
      });

      expect(event.status).toBe('DRAFT');
    });

    it('should set default event_type to single', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Default Type Event',
        created_by: TEST_USER_ID,
      });

      expect(event.event_type).toBe('single');
    });

    it('should set default visibility to PUBLIC', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Default Visibility Event',
        created_by: TEST_USER_ID,
      });

      expect(event.visibility).toBe('PUBLIC');
    });

    it('should set default counters to zero', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Default Counters Event',
        created_by: TEST_USER_ID,
      });

      expect(event.view_count).toBe(0);
      expect(event.interest_count).toBe(0);
      expect(event.share_count).toBe(0);
    });

    it('should set default cancellation_deadline_hours to 24', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Default Deadline Event',
        created_by: TEST_USER_ID,
      });

      expect(event.cancellation_deadline_hours).toBe(24);
    });

    it('should allow overriding defaults', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Override Defaults Event',
        status: 'PUBLISHED',
        event_type: 'recurring',
        visibility: 'PRIVATE',
        is_featured: true,
        priority_score: 50,
        created_by: TEST_USER_ID,
      });

      expect(event.status).toBe('PUBLISHED');
      expect(event.event_type).toBe('recurring');
      expect(event.visibility).toBe('PRIVATE');
      expect(event.is_featured).toBe(true);
      expect(event.priority_score).toBe(50);
    });

    it('should handle special characters in slug generation', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Event! With @Special# Characters$',
        created_by: TEST_USER_ID,
      });

      expect(event.slug).toBe('event-with-special-characters');
    });

    it('should handle leading/trailing dashes in slug', async () => {
      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: '---Event Name---',
        created_by: TEST_USER_ID,
      });

      expect(event.slug).toBe('event-name');
    });
  });

  // ==========================================================================
  // update
  // ==========================================================================
  describe('update', () => {
    it('should update event fields', async () => {
      const created = await createEventDirect({ name: 'Original Name' });

      const updated = await eventModel.update(created.id, {
        name: 'Updated Name',
        description: 'New description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('New description');

      // Verify in database
      const dbResult = await pool.query('SELECT * FROM events WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].name).toBe('Updated Name');
      expect(dbResult.rows[0].description).toBe('New description');
    });

    it('should update updated_at timestamp', async () => {
      const created = await createEventDirect({ name: 'Timestamp Event' });
      const originalUpdatedAt = created.updated_at;

      await new Promise(resolve => setTimeout(resolve, 50));

      const updated = await eventModel.update(created.id, { name: 'New Name' });

      expect(new Date(updated.updated_at!).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('should handle legacy image_url to banner_image_url mapping', async () => {
      const created = await createEventDirect({ name: 'Image URL Event' });

      const updated = await eventModel.update(created.id, {
        image_url: 'https://example.com/new-image.jpg',
      });

      expect(updated.banner_image_url).toBe('https://example.com/new-image.jpg');

      // Verify in database
      const dbResult = await pool.query('SELECT banner_image_url FROM events WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].banner_image_url).toBe('https://example.com/new-image.jpg');
    });

    it('should handle legacy category to primary_category_id mapping', async () => {
      const categoryId = uuidv4();
      
      // Insert category first (FK constraint)
      await pool.query(
        `INSERT INTO event_categories (id, name, slug) VALUES ($1, $2, $3)`,
        [categoryId, 'Update Category', `update-cat-${categoryId.slice(0, 8)}`]
      );

      const created = await createEventDirect({ name: 'Category Event' });

      const updated = await eventModel.update(created.id, {
        category: categoryId,
      });

      expect(updated.primary_category_id).toBe(categoryId);

      // Verify in database
      const dbResult = await pool.query('SELECT primary_category_id FROM events WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].primary_category_id).toBe(categoryId);
    });

    it('should not update soft-deleted event', async () => {
      const created = await createEventDirect({ name: 'Deleted Update Event' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const updated = await eventModel.update(created.id, { name: 'Should Not Update' });

      expect(updated).toBeUndefined();

      // Verify database unchanged
      const dbResult = await pool.query('SELECT name FROM events WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].name).toBe('Deleted Update Event');
    });
  });

  // ==========================================================================
  // delete (soft delete from BaseModel)
  // ==========================================================================
  describe('delete', () => {
    it('should soft delete event', async () => {
      const created = await createEventDirect({ name: 'Soft Delete Event' });

      const result = await eventModel.delete(created.id);

      expect(result).toBe(true);

      // Verify deleted_at is set in database
      const dbResult = await pool.query('SELECT deleted_at FROM events WHERE id = $1', [created.id]);
      expect(dbResult.rows[0].deleted_at).not.toBeNull();
    });

    it('should return false for non-existent event', async () => {
      const result = await eventModel.delete(uuidv4());

      expect(result).toBe(false);
    });

    it('should return false for already deleted event', async () => {
      const created = await createEventDirect({ name: 'Already Deleted Event' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const result = await eventModel.delete(created.id);

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // hardDelete
  // ==========================================================================
  describe('hardDelete', () => {
    it('should permanently delete event', async () => {
      const created = await createEventDirect({ name: 'Hard Delete Event' });

      const result = await eventModel.hardDelete(created.id);

      expect(result).toBe(true);

      // Verify completely gone from database
      const dbResult = await pool.query('SELECT * FROM events WHERE id = $1', [created.id]);
      expect(dbResult.rows.length).toBe(0);
    });

    it('should return false for non-existent event', async () => {
      const result = await eventModel.hardDelete(uuidv4());

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // findAll
  // ==========================================================================
  describe('findAll', () => {
    it('should find all events matching conditions', async () => {
      await createEventDirect({ name: 'Event 1', status: 'DRAFT' });
      await createEventDirect({ name: 'Event 2', status: 'DRAFT' });
      await createEventDirect({ name: 'Event 3', status: 'PUBLISHED' });

      const events = await eventModel.findAll({ status: 'DRAFT' });

      expect(events.length).toBe(2);
    });

    it('should exclude soft-deleted events by default', async () => {
      const created = await createEventDirect({ name: 'Deleted Event' });
      await createEventDirect({ name: 'Active Event' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const events = await eventModel.findAll({});

      expect(events.length).toBe(1);
      expect(events[0].name).toBe('Active Event');
    });

    it('should include soft-deleted events when includeDeleted is true', async () => {
      const created = await createEventDirect({ name: 'Deleted Event' });
      await createEventDirect({ name: 'Active Event' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const events = await eventModel.findAll({}, { includeDeleted: true });

      expect(events.length).toBe(2);
    });

    it('should respect limit option', async () => {
      await createEventDirect({ name: 'Event 1' });
      await createEventDirect({ name: 'Event 2' });
      await createEventDirect({ name: 'Event 3' });

      const events = await eventModel.findAll({}, { limit: 2 });

      expect(events.length).toBe(2);
    });

    it('should respect offset option', async () => {
      await createEventDirect({ name: 'Event 1' });
      await createEventDirect({ name: 'Event 2' });
      await createEventDirect({ name: 'Event 3' });

      const allEvents = await eventModel.findAll({});
      const offsetEvents = await eventModel.findAll({}, { offset: 1 });

      expect(offsetEvents.length).toBe(allEvents.length - 1);
    });
  });

  // ==========================================================================
  // findOne
  // ==========================================================================
  describe('findOne', () => {
    it('should find one event matching conditions', async () => {
      await createEventDirect({ name: 'Unique Event', status: 'PUBLISHED' });

      const event = await eventModel.findOne({ status: 'PUBLISHED' });

      expect(event).toBeDefined();
      expect(event!.name).toBe('Unique Event');
    });

    it('should return null when no match', async () => {
      const event = await eventModel.findOne({ status: 'CANCELLED' });

      expect(event).toBeNull();
    });

    it('should not find soft-deleted event', async () => {
      const created = await createEventDirect({ name: 'Deleted Find One', status: 'CANCELLED' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const event = await eventModel.findOne({ status: 'CANCELLED' });

      expect(event).toBeNull();
    });
  });

  // ==========================================================================
  // count
  // ==========================================================================
  describe('count', () => {
    it('should count events matching conditions', async () => {
      await createEventDirect({ name: 'Count 1', status: 'DRAFT' });
      await createEventDirect({ name: 'Count 2', status: 'DRAFT' });
      await createEventDirect({ name: 'Count 3', status: 'PUBLISHED' });

      const count = await eventModel.count({ status: 'DRAFT' });

      expect(count).toBe(2);
    });

    it('should return 0 for no matches', async () => {
      const count = await eventModel.count({ status: 'CANCELLED' });

      expect(count).toBe(0);
    });

    it('should exclude soft-deleted events', async () => {
      const created = await createEventDirect({ name: 'Deleted Count' });
      await createEventDirect({ name: 'Active Count' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const count = await eventModel.count({});

      expect(count).toBe(1);
    });
  });

  // ==========================================================================
  // exists
  // ==========================================================================
  describe('exists', () => {
    it('should return true when event exists', async () => {
      await createEventDirect({ name: 'Exists Event', status: 'PUBLISHED' });

      const exists = await eventModel.exists({ status: 'PUBLISHED' });

      expect(exists).toBe(true);
    });

    it('should return false when event does not exist', async () => {
      const exists = await eventModel.exists({ status: 'CANCELLED' });

      expect(exists).toBe(false);
    });

    it('should return false for soft-deleted event', async () => {
      const created = await createEventDirect({ name: 'Deleted Exists', status: 'CANCELLED' });

      await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = $1', [created.id]);

      const exists = await eventModel.exists({ status: 'CANCELLED' });

      expect(exists).toBe(false);
    });
  });

  // ==========================================================================
  // getEventsByVenue
  // ==========================================================================
  describe('getEventsByVenue', () => {
    it('should return events for specific venue', async () => {
      await createEventDirect({ name: 'Venue Event 1', venue_id: TEST_VENUE_ID });
      await createEventDirect({ name: 'Venue Event 2', venue_id: TEST_VENUE_ID });

      const events = await eventModel.getEventsByVenue(TEST_VENUE_ID);

      expect(events.length).toBe(2);
      events.forEach(e => expect(e.venue_id).toBe(TEST_VENUE_ID));
    });

    it('should return empty array for venue with no events', async () => {
      const events = await eventModel.getEventsByVenue(uuidv4());

      expect(events).toEqual([]);
    });

    it('should transform results properly', async () => {
      await createEventDirect({ name: 'Transform Venue Event', venue_id: TEST_VENUE_ID });

      const events = await eventModel.getEventsByVenue(TEST_VENUE_ID);

      expect(events[0].id).toBeDefined();
      expect(events[0].name).toBe('Transform Venue Event');
      expect(events[0].tenant_id).toBe(TEST_TENANT_ID);
    });
  });

  // ==========================================================================
  // getEventsByCategory
  // ==========================================================================
  describe('getEventsByCategory', () => {
    it('should return events for specific category', async () => {
      const categoryId = uuidv4();
      
      // Insert category (FK constraint)
      await pool.query(
        `INSERT INTO event_categories (id, name, slug) VALUES ($1, $2, $3)`,
        [categoryId, 'Test Category', `cat-${categoryId.slice(0, 8)}`]
      );

      // Insert events with category
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, primary_category_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [uuidv4(), TEST_TENANT_ID, TEST_VENUE_ID, 'Cat Event 1', `cat-event-1-${Date.now()}`, 'DRAFT', 'single', categoryId, TEST_USER_ID]
      );
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, primary_category_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [uuidv4(), TEST_TENANT_ID, TEST_VENUE_ID, 'Cat Event 2', `cat-event-2-${Date.now()}`, 'DRAFT', 'single', categoryId, TEST_USER_ID]
      );

      const events = await eventModel.getEventsByCategory(categoryId);

      expect(events.length).toBe(2);
      events.forEach(e => expect(e.primary_category_id).toBe(categoryId));
    });

    it('should return empty array for category with no events', async () => {
      const events = await eventModel.getEventsByCategory(uuidv4());

      expect(events).toEqual([]);
    });
  });

  // ==========================================================================
  // getFeaturedEvents
  // ==========================================================================
  describe('getFeaturedEvents', () => {
    it('should return featured public events with valid status', async () => {
      await createEventDirect({ name: 'Featured 1', is_featured: true, status: 'PUBLISHED', visibility: 'PUBLIC' });
      await createEventDirect({ name: 'Featured 2', is_featured: true, status: 'ON_SALE', visibility: 'PUBLIC' });
      await createEventDirect({ name: 'Not Featured', is_featured: false, status: 'PUBLISHED', visibility: 'PUBLIC' });

      const events = await eventModel.getFeaturedEvents();

      expect(events.length).toBe(2);
      events.forEach(e => expect(e.is_featured).toBe(true));
    });

    it('should not return private featured events', async () => {
      await createEventDirect({ name: 'Private Featured', is_featured: true, status: 'PUBLISHED', visibility: 'PRIVATE' });

      const events = await eventModel.getFeaturedEvents();

      expect(events.length).toBe(0);
    });

    it('should not return draft featured events', async () => {
      await createEventDirect({ name: 'Draft Featured', is_featured: true, status: 'DRAFT', visibility: 'PUBLIC' });

      const events = await eventModel.getFeaturedEvents();

      expect(events.length).toBe(0);
    });

    it('should order by priority_score descending', async () => {
      await createEventDirect({ name: 'Low Priority', is_featured: true, status: 'PUBLISHED', visibility: 'PUBLIC', priority_score: 10 });
      await createEventDirect({ name: 'High Priority', is_featured: true, status: 'PUBLISHED', visibility: 'PUBLIC', priority_score: 100 });

      const events = await eventModel.getFeaturedEvents();

      expect(events[0].name).toBe('High Priority');
      expect(events[1].name).toBe('Low Priority');
    });

    it('should respect limit parameter', async () => {
      await createEventDirect({ name: 'Featured 1', is_featured: true, status: 'PUBLISHED', visibility: 'PUBLIC' });
      await createEventDirect({ name: 'Featured 2', is_featured: true, status: 'PUBLISHED', visibility: 'PUBLIC' });
      await createEventDirect({ name: 'Featured 3', is_featured: true, status: 'PUBLISHED', visibility: 'PUBLIC' });

      const events = await eventModel.getFeaturedEvents(2);

      expect(events.length).toBe(2);
    });
  });

  // ==========================================================================
  // searchEvents
  // ==========================================================================
  describe('searchEvents', () => {
    beforeEach(async () => {
      await createEventDirect({ name: 'Rock Concert', description: 'Amazing rock show', status: 'PUBLISHED', visibility: 'PUBLIC' });
      await createEventDirect({ name: 'Jazz Night', description: 'Smooth jazz evening', status: 'PUBLISHED', visibility: 'PUBLIC' });
      await createEventDirect({ name: 'Comedy Show', short_description: 'Hilarious comedy', status: 'PUBLISHED', visibility: 'PUBLIC' });
    });

    it('should search by name (case insensitive)', async () => {
      const events = await eventModel.searchEvents('rock');

      expect(events.length).toBe(1);
      expect(events[0].name).toBe('Rock Concert');
    });

    it('should search by description', async () => {
      const events = await eventModel.searchEvents('jazz');

      expect(events.length).toBe(1);
      expect(events[0].name).toBe('Jazz Night');
    });

    it('should search by short_description', async () => {
      const events = await eventModel.searchEvents('comedy');

      expect(events.length).toBe(1);
      expect(events[0].name).toBe('Comedy Show');
    });

    it('should return all public events when search term is empty', async () => {
      const events = await eventModel.searchEvents('');

      expect(events.length).toBe(3);
    });

    it('should not return private events', async () => {
      await createEventDirect({ name: 'Private Rock', status: 'PUBLISHED', visibility: 'PRIVATE' });

      const events = await eventModel.searchEvents('Rock');

      expect(events.length).toBe(1);
      expect(events[0].visibility).toBe('PUBLIC');
    });

    it('should filter by venue_id', async () => {
      const events = await eventModel.searchEvents('', { venue_id: TEST_VENUE_ID });

      expect(events.length).toBe(3);
      events.forEach(e => expect(e.venue_id).toBe(TEST_VENUE_ID));
    });

    it('should filter by status', async () => {
      await createEventDirect({ name: 'Draft Event', status: 'DRAFT', visibility: 'PUBLIC' });

      const events = await eventModel.searchEvents('', { status: 'DRAFT' });

      expect(events.length).toBe(1);
      expect(events[0].name).toBe('Draft Event');
    });

    it('should respect limit', async () => {
      const events = await eventModel.searchEvents('', { limit: 2 });

      expect(events.length).toBe(2);
    });

    it('should respect offset', async () => {
      const allEvents = await eventModel.searchEvents('');
      const offsetEvents = await eventModel.searchEvents('', { offset: 1 });

      expect(offsetEvents.length).toBe(allEvents.length - 1);
    });

    it('should sort by name ascending', async () => {
      const events = await eventModel.searchEvents('', { sort_by: 'name', sort_order: 'asc' });

      expect(events[0].name).toBe('Comedy Show');
      expect(events[1].name).toBe('Jazz Night');
      expect(events[2].name).toBe('Rock Concert');
    });

    it('should sort by priority descending', async () => {
      await pool.query(`UPDATE events SET priority_score = 100 WHERE name = 'Jazz Night'`);

      const events = await eventModel.searchEvents('', { sort_by: 'priority', sort_order: 'desc' });

      expect(events[0].name).toBe('Jazz Night');
    });

    it('should sort by views descending', async () => {
      await pool.query(`UPDATE events SET view_count = 1000 WHERE name = 'Comedy Show'`);

      const events = await eventModel.searchEvents('', { sort_by: 'views', sort_order: 'desc' });

      expect(events[0].name).toBe('Comedy Show');
    });
  });

  // ==========================================================================
  // incrementViewCount
  // ==========================================================================
  describe('incrementViewCount', () => {
    it('should increment view count by 1', async () => {
      const created = await createEventDirect({ name: 'View Event', view_count: 5 });

      await eventModel.incrementViewCount(created.id);

      const result = await pool.query('SELECT view_count FROM events WHERE id = $1', [created.id]);
      expect(result.rows[0].view_count).toBe(6);
    });

    it('should increment multiple times correctly', async () => {
      const created = await createEventDirect({ name: 'Multi View Event', view_count: 0 });

      await eventModel.incrementViewCount(created.id);
      await eventModel.incrementViewCount(created.id);
      await eventModel.incrementViewCount(created.id);

      const result = await pool.query('SELECT view_count FROM events WHERE id = $1', [created.id]);
      expect(result.rows[0].view_count).toBe(3);
    });
  });

  // ==========================================================================
  // incrementInterestCount
  // ==========================================================================
  describe('incrementInterestCount', () => {
    it('should increment interest count by 1', async () => {
      const created = await createEventDirect({ name: 'Interest Event', interest_count: 10 });

      await eventModel.incrementInterestCount(created.id);

      const result = await pool.query('SELECT interest_count FROM events WHERE id = $1', [created.id]);
      expect(result.rows[0].interest_count).toBe(11);
    });
  });

  // ==========================================================================
  // incrementShareCount
  // ==========================================================================
  describe('incrementShareCount', () => {
    it('should increment share count by 1', async () => {
      const created = await createEventDirect({ name: 'Share Event', share_count: 20 });

      await eventModel.incrementShareCount(created.id);

      const result = await pool.query('SELECT share_count FROM events WHERE id = $1', [created.id]);
      expect(result.rows[0].share_count).toBe(21);
    });
  });

  // ==========================================================================
  // JSON field handling
  // ==========================================================================
  describe('JSON field handling', () => {
    it('should handle image_gallery JSONB field', async () => {
      const gallery = [
        { url: 'https://example.com/1.jpg', caption: 'Image 1' },
        { url: 'https://example.com/2.jpg', caption: 'Image 2' },
      ];

      const id = uuidv4();
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, image_gallery, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, TEST_TENANT_ID, TEST_VENUE_ID, 'Gallery Event', `gallery-${id.slice(0,8)}`, 'DRAFT', 'single', JSON.stringify(gallery), TEST_USER_ID]
      );

      const event = await eventModel.findById(id);

      expect(event!.image_gallery).toEqual(gallery);
    });

    it('should handle metadata JSONB field', async () => {
      const metadata = { custom_field: 'value', nested: { data: 123 } };

      const event = await eventModel.createWithDefaults({
        tenant_id: TEST_TENANT_ID,
        venue_id: TEST_VENUE_ID,
        name: 'Metadata Event',
        metadata,
        created_by: TEST_USER_ID,
      });

      const fetched = await eventModel.findById(event.id!);

      expect(fetched!.metadata).toEqual(metadata);
    });

    it('should handle accessibility_info JSONB field', async () => {
      const accessibilityInfo = { wheelchair: true, hearing_loop: false };

      const id = uuidv4();
      await pool.query(
        `INSERT INTO events (id, tenant_id, venue_id, name, slug, status, event_type, accessibility_info, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, TEST_TENANT_ID, TEST_VENUE_ID, 'Accessible Event', `accessible-${id.slice(0,8)}`, 'DRAFT', 'single', JSON.stringify(accessibilityInfo), TEST_USER_ID]
      );

      const event = await eventModel.findById(id);

      expect(event!.accessibility_info).toEqual(accessibilityInfo);
    });
  });
});
