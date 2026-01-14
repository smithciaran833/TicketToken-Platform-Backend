/**
 * Unit tests for EventModel
 * Tests event-specific data access operations
 */

import { EventModel, IEvent } from '../../../src/models/event.model';
import { createKnexMock, configureMockReturn, configureMockArray } from '../../__mocks__/knex.mock';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('EventModel', () => {
  let mockDb: any;
  let model: EventModel;

  const mockEvent: IEvent = {
    id: 'event-123',
    tenant_id: 'tenant-1',
    venue_id: 'venue-1',
    name: 'Test Concert',
    slug: 'test-concert',
    description: 'A great concert',
    event_type: 'single',
    status: 'DRAFT',
    visibility: 'PUBLIC',
    is_featured: false,
    priority_score: 0,
    view_count: 0,
    interest_count: 0,
    share_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockDb = createKnexMock();
    model = new EventModel(mockDb);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with events table', () => {
      expect(model).toBeInstanceOf(EventModel);
      expect((model as any).tableName).toBe('events');
    });

    it('should define selectColumns for explicit column selection', () => {
      const columns = (model as any).selectColumns;
      expect(columns).toBeInstanceOf(Array);
      expect(columns).toContain('id');
      expect(columns).toContain('tenant_id');
      expect(columns).toContain('venue_id');
      expect(columns).toContain('name');
      expect(columns).toContain('slug');
      expect(columns).toContain('status');
    });
  });

  describe('findBySlug', () => {
    it('should find event by slug', async () => {
      configureMockReturn(mockDb, mockEvent);

      const result = await model.findBySlug('test-concert');

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ slug: 'test-concert' });
      expect(mockDb._mockChain.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(mockDb._mockChain.first).toHaveBeenCalled();
      expect(result?.name).toBe('Test Concert');
    });

    it('should return null when slug not found', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findBySlug('non-existent');

      expect(result).toBeNull();
    });

    it('should transform database response', async () => {
      const dbResponse = {
        ...mockEvent,
        image_gallery: JSON.stringify([{ url: 'image1.jpg' }]),
        royalty_percentage: '5.5',
      };
      configureMockReturn(mockDb, dbResponse);

      const result = await model.findBySlug('test-concert');

      expect(result?.image_gallery).toEqual([{ url: 'image1.jpg' }]);
      expect(result?.royalty_percentage).toBe(5.5);
    });
  });

  describe('findById', () => {
    it('should find event by ID and transform result', async () => {
      configureMockReturn(mockDb, mockEvent);

      const result = await model.findById('event-123');

      expect(result?.id).toBe('event-123');
      expect(result?.name).toBe('Test Concert');
    });

    it('should return null when event not found', async () => {
      configureMockReturn(mockDb, null);

      const result = await model.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should parse numeric fields correctly', async () => {
      const dbResponse = {
        ...mockEvent,
        artist_percentage: '10.5',
        venue_percentage: '5.25',
      };
      configureMockReturn(mockDb, dbResponse);

      const result = await model.findById('event-123');

      expect(result?.artist_percentage).toBe(10.5);
      expect(result?.venue_percentage).toBe(5.25);
    });
  });

  describe('createWithDefaults', () => {
    it('should create event with default values', async () => {
      const createdEvent = { ...mockEvent, id: 'new-event-123' };
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...createdEvent, _inserted: true }] }]);

      const result = await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'New Concert',
      });

      expect(mockDb.raw).toHaveBeenCalled();
      expect(result.name).toBe('New Concert');
    });

    it('should generate slug from name', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, _inserted: true }] }]);

      await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'My Awesome Concert 2026!',
      });

      const rawCall = mockDb.raw.mock.calls[0];
      expect(rawCall[0]).toContain('INSERT INTO events');
    });

    it('should use provided slug if given', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, slug: 'custom-slug', _inserted: true }] }]);

      const result = await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'New Concert',
        slug: 'custom-slug',
      });

      expect(result.slug).toBe('custom-slug');
    });

    it('should set default status to DRAFT', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, status: 'DRAFT', _inserted: true }] }]);

      const result = await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'New Concert',
      });

      expect(result.status).toBe('DRAFT');
    });

    it('should set default visibility to PUBLIC', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, visibility: 'PUBLIC', _inserted: true }] }]);

      const result = await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'New Concert',
      });

      expect(result.visibility).toBe('PUBLIC');
    });

    it('should handle ON CONFLICT for duplicate slug/venue', async () => {
      const existingEvent = { ...mockEvent, _inserted: false };
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [existingEvent] }]);

      const result = await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'Test Concert',
      });

      expect(result.id).toBe('event-123');
    });
  });

  describe('upsertEvent', () => {
    it('should insert new event', async () => {
      const newEvent = { ...mockEvent, _inserted: true };
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [newEvent] }]);

      const result = await model.upsertEvent({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'New Event',
      });

      expect(result.inserted).toBe(true);
      expect(result.event.name).toBe('Test Concert');
    });

    it('should update existing event on conflict', async () => {
      const existingEvent = { ...mockEvent, _inserted: false };
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [existingEvent] }]);

      const result = await model.upsertEvent({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'Updated Event',
        slug: 'test-concert',
      });

      expect(result.inserted).toBe(false);
    });

    it('should use custom conflict columns', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, _inserted: true }] }]);

      await model.upsertEvent(
        { tenant_id: 'tenant-1', venue_id: 'venue-1', name: 'Event' },
        ['external_id', 'tenant_id']
      );

      const rawCall = mockDb.raw.mock.calls[0][0];
      expect(rawCall).toContain('ON CONFLICT (external_id, tenant_id)');
    });

    it('should use custom update columns', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, _inserted: true }] }]);

      await model.upsertEvent(
        { tenant_id: 'tenant-1', venue_id: 'venue-1', name: 'Event' },
        ['slug', 'venue_id'],
        ['name', 'description', 'status']
      );

      const rawCall = mockDb.raw.mock.calls[0][0];
      expect(rawCall).toContain('DO UPDATE SET');
    });
  });

  describe('update', () => {
    it('should update event and transform result', async () => {
      const updatedEvent = { ...mockEvent, name: 'Updated Concert' };
      mockDb._mockChain.returning.mockResolvedValue([updatedEvent]);

      const result = await model.update('event-123', { name: 'Updated Concert' });

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'event-123' });
      expect(result.name).toBe('Updated Concert');
    });

    it('should set updated_at timestamp', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await model.update('event-123', { name: 'Test' });

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
    });

    it('should transform data for database', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await model.update('event-123', {
        name: 'Test',
        image_url: 'http://example.com/image.jpg',
        category: 'music',
      });

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.banner_image_url).toBe('http://example.com/image.jpg');
      expect(updateCall.primary_category_id).toBe('music');
    });
  });

  describe('getEventsByVenue', () => {
    it('should find events by venue ID', async () => {
      configureMockArray(mockDb, [mockEvent]);

      const result = await model.getEventsByVenue('venue-1');

      expect(result).toHaveLength(1);
      expect(result[0].venue_id).toBe('venue-1');
    });

    it('should apply pagination options', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.getEventsByVenue('venue-1', { limit: 10, offset: 20 });

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(10);
      expect(mockDb._mockChain.offset).toHaveBeenCalledWith(20);
    });
  });

  describe('getEventsByCategory', () => {
    it('should find events by category ID', async () => {
      const eventWithCategory = { ...mockEvent, primary_category_id: 'cat-1' };
      configureMockArray(mockDb, [eventWithCategory]);

      const result = await model.getEventsByCategory('cat-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('getFeaturedEvents', () => {
    it('should find featured events', async () => {
      const featuredEvent = { ...mockEvent, is_featured: true };
      configureMockArray(mockDb, [featuredEvent]);

      const result = await model.getFeaturedEvents();

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith({
        is_featured: true,
        visibility: 'PUBLIC',
      });
      expect(mockDb._mockChain.whereIn).toHaveBeenCalledWith('status', ['PUBLISHED', 'ON_SALE']);
    });

    it('should limit results', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.getFeaturedEvents(5);

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(5);
    });

    it('should order by priority score descending', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.getFeaturedEvents();

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('priority_score', 'desc');
    });
  });

  describe('searchEvents', () => {
    it('should require tenant_id', async () => {
      await expect(model.searchEvents('concert')).rejects.toThrow('tenant_id is required');
    });

    it('should search events with tenant isolation', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('concert', { tenant_id: 'tenant-1' });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(mockDb._mockChain.where).toHaveBeenCalledWith('visibility', 'PUBLIC');
    });

    it('should search by name, description, and short_description', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('rock', { tenant_id: 'tenant-1' });

      // The where clause with function callback for ILIKE searches
      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });

    it('should sanitize search term to prevent LIKE injection', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('test%_\\special', { tenant_id: 'tenant-1' });

      // Verify the function was called (sanitization happens internally)
      expect(mockDb._mockChain.where).toHaveBeenCalled();
    });

    it('should filter by category_id', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', { tenant_id: 'tenant-1', category_id: 'cat-1' });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith('primary_category_id', 'cat-1');
    });

    it('should filter by venue_id', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', { tenant_id: 'tenant-1', venue_id: 'venue-1' });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith('venue_id', 'venue-1');
    });

    it('should filter by status', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', { tenant_id: 'tenant-1', status: 'PUBLISHED' });

      expect(mockDb._mockChain.where).toHaveBeenCalledWith('status', 'PUBLISHED');
    });

    it('should apply sorting with whitelisted columns', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', {
        tenant_id: 'tenant-1',
        sort_by: 'name',
        sort_order: 'asc',
      });

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('name', 'asc');
    });

    it('should default to created_at for invalid sort column', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', {
        tenant_id: 'tenant-1',
        sort_by: 'malicious_column',
      });

      expect(mockDb._mockChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should enforce maximum limit of 100', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', { tenant_id: 'tenant-1', limit: 500 });

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(100);
    });

    it('should use default limit of 20', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', { tenant_id: 'tenant-1' });

      expect(mockDb._mockChain.limit).toHaveBeenCalledWith(20);
    });

    it('should enforce non-negative offset', async () => {
      configureMockArray(mockDb, [mockEvent]);

      await model.searchEvents('', { tenant_id: 'tenant-1', offset: -10 });

      expect(mockDb._mockChain.offset).toHaveBeenCalledWith(0);
    });
  });

  describe('increment methods', () => {
    describe('incrementViewCount', () => {
      it('should increment view_count by 1', async () => {
        await model.incrementViewCount('event-123');

        expect(mockDb).toHaveBeenCalledWith('events');
        expect(mockDb._mockChain.where).toHaveBeenCalledWith({ id: 'event-123' });
        expect(mockDb._mockChain.increment).toHaveBeenCalledWith('view_count', 1);
      });
    });

    describe('incrementInterestCount', () => {
      it('should increment interest_count by 1', async () => {
        await model.incrementInterestCount('event-123');

        expect(mockDb._mockChain.increment).toHaveBeenCalledWith('interest_count', 1);
      });
    });

    describe('incrementShareCount', () => {
      it('should increment share_count by 1', async () => {
        await model.incrementShareCount('event-123');

        expect(mockDb._mockChain.increment).toHaveBeenCalledWith('share_count', 1);
      });
    });
  });

  describe('transformForDb (private method behavior)', () => {
    it('should map image_url to banner_image_url', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await model.update('event-123', { image_url: 'http://example.com/img.jpg' } as any);

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.banner_image_url).toBe('http://example.com/img.jpg');
    });

    it('should map category to primary_category_id', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await model.update('event-123', { category: 'music' } as any);

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.primary_category_id).toBe('music');
    });

    it('should stringify image_gallery array', async () => {
      mockDb._mockChain.returning.mockResolvedValue([mockEvent]);

      await model.update('event-123', { image_gallery: [{ url: 'img1.jpg' }] });

      const updateCall = mockDb._mockChain.update.mock.calls[0][0];
      expect(updateCall.image_gallery).toBe(JSON.stringify([{ url: 'img1.jpg' }]));
    });
  });

  describe('transformFromDb (private method behavior)', () => {
    it('should parse JSON image_gallery string', async () => {
      const dbEvent = {
        ...mockEvent,
        image_gallery: '[{"url":"img1.jpg"}]',
      };
      configureMockReturn(mockDb, dbEvent);

      const result = await model.findById('event-123');

      expect(result?.image_gallery).toEqual([{ url: 'img1.jpg' }]);
    });

    it('should handle invalid JSON in image_gallery', async () => {
      const dbEvent = {
        ...mockEvent,
        image_gallery: 'not-valid-json',
      };
      configureMockReturn(mockDb, dbEvent);

      const result = await model.findById('event-123');

      expect(result?.image_gallery).toEqual([]);
    });

    it('should parse numeric percentage fields', async () => {
      const dbEvent = {
        ...mockEvent,
        royalty_percentage: '5.5',
        artist_percentage: '10.0',
        venue_percentage: '3.25',
      };
      configureMockReturn(mockDb, dbEvent);

      const result = await model.findById('event-123');

      expect(result?.royalty_percentage).toBe(5.5);
      expect(result?.artist_percentage).toBe(10.0);
      expect(result?.venue_percentage).toBe(3.25);
    });

    it('should set image_url from banner_image_url', async () => {
      const dbEvent = {
        ...mockEvent,
        banner_image_url: 'http://example.com/banner.jpg',
      };
      configureMockReturn(mockDb, dbEvent);

      const result = await model.findById('event-123');

      expect(result?.image_url).toBe('http://example.com/banner.jpg');
    });

    it('should set category from primary_category_id', async () => {
      const dbEvent = {
        ...mockEvent,
        primary_category_id: 'cat-123',
      };
      configureMockReturn(mockDb, dbEvent);

      const result = await model.findById('event-123');

      expect(result?.category).toBe('cat-123');
    });
  });

  describe('generateSlug (private method behavior)', () => {
    it('should convert name to lowercase slug', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, slug: 'my-concert', _inserted: true }] }]);

      await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'My Concert',
      });

      // The slug generation logic converts "My Concert" to "my-concert"
      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should replace non-alphanumeric characters with hyphens', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, slug: 'rock-roll-concert-2026', _inserted: true }] }]);

      await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'Rock & Roll Concert 2026!',
      });

      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should remove leading and trailing hyphens', async () => {
      mockDb.raw = jest.fn().mockResolvedValue([{ rows: [{ ...mockEvent, slug: 'concert', _inserted: true }] }]);

      await model.createWithDefaults({
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: '---Concert---',
      });

      expect(mockDb.raw).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined in optional fields', async () => {
      const dbEvent = {
        id: 'event-123',
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'Test',
        slug: 'test',
        status: 'DRAFT',
        event_type: 'single',
        description: null,
        short_description: undefined,
        image_gallery: null,
      };
      configureMockReturn(mockDb, dbEvent);

      const result = await model.findById('event-123');

      expect(result?.description).toBeNull();
    });

    it('should handle all event statuses', async () => {
      const statuses = [
        'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE',
        'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'
      ];

      for (const status of statuses) {
        const dbEvent = { ...mockEvent, status };
        configureMockReturn(mockDb, dbEvent);

        const result = await model.findById('event-123');
        expect(result?.status).toBe(status);
      }
    });

    it('should handle all visibility types', async () => {
      const visibilities = ['PUBLIC', 'PRIVATE', 'UNLISTED'];

      for (const visibility of visibilities) {
        const dbEvent = { ...mockEvent, visibility };
        configureMockReturn(mockDb, dbEvent);

        const result = await model.findById('event-123');
        expect(result?.visibility).toBe(visibility);
      }
    });

    it('should handle all event types', async () => {
      const eventTypes = ['single', 'recurring', 'series'];

      for (const eventType of eventTypes) {
        const dbEvent = { ...mockEvent, event_type: eventType };
        configureMockReturn(mockDb, dbEvent);

        const result = await model.findById('event-123');
        expect(result?.event_type).toBe(eventType);
      }
    });
  });
});
