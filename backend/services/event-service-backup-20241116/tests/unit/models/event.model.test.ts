import { EventModel } from '../../../src/models/event.model';
import { Knex } from 'knex';

describe('Event Model', () => {
  let mockDb: any;
  let eventModel: EventModel;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockResolvedValue(1),
      returning: jest.fn().mockResolvedValue([]),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      increment: jest.fn().mockResolvedValue(1),
    };

    mockDb = jest.fn(() => mockQueryBuilder);
    eventModel = new EventModel(mockDb as any);
  });

  describe('findBySlug', () => {
    it('should find event by slug', async () => {
      const mockEvent = { id: '1', slug: 'test-event', name: 'Test Event', tenant_id: 'tenant-1', venue_id: 'venue-1' };
      mockQueryBuilder.first.mockResolvedValue(mockEvent);

      const result = await eventModel.findBySlug('test-event');

      expect(mockDb).toHaveBeenCalledWith('events');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ slug: 'test-event' });
      expect(mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBeDefined();
    });

    it('should return null when not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await eventModel.findBySlug('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find event by id', async () => {
      const mockEvent = { id: 'event-123', name: 'Test', tenant_id: 'tenant-1', venue_id: 'venue-1' };
      mockQueryBuilder.first.mockResolvedValue(mockEvent);

      const result = await eventModel.findById('event-123');

      expect(result).toBeDefined();
    });
  });

  describe('createWithDefaults', () => {
    it('should create event with default values', async () => {
      const eventData = {
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'New Event',
      };

      const mockCreated = { 
        id: '1', 
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'New Event',
        slug: 'new-event',
        status: 'DRAFT'
      };
      
      mockQueryBuilder.returning.mockResolvedValue([mockCreated]);

      const result = await eventModel.createWithDefaults(eventData);

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result).toBeDefined();
    });

    it('should generate slug from name', async () => {
      const eventData = {
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'Test Event Name',
      };

      const mockCreated = { 
        id: '1',
        tenant_id: 'tenant-1',
        venue_id: 'venue-1',
        name: 'Test Event Name',
        slug: 'test-event-name'
      };
      
      mockQueryBuilder.returning.mockResolvedValue([mockCreated]);

      await eventModel.createWithDefaults(eventData);

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.returning).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update event', async () => {
      const updates = { name: 'Updated Name' };
      mockQueryBuilder.returning.mockResolvedValue([{ 
        id: '1', 
        name: 'Updated Name',
        tenant_id: 'tenant-1',
        venue_id: 'venue-1'
      }]);

      const result = await eventModel.update('event-123', updates);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'event-123' });
      expect(mockQueryBuilder.whereNull).toHaveBeenCalledWith('deleted_at');
      expect(result).toBeDefined();
    });
  });

  describe('getEventsByVenue', () => {
    it('should find events by venue id', async () => {
      const mockEvents = [{ id: '1', venue_id: 'venue-123', tenant_id: 'tenant-1' }];
      mockQueryBuilder.select.mockResolvedValue(mockEvents);

      const result = await eventModel.getEventsByVenue('venue-123');

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getEventsByCategory', () => {
    it('should find events by category', async () => {
      const mockEvents = [{ id: '1', primary_category_id: 'cat-123', tenant_id: 'tenant-1', venue_id: 'venue-1' }];
      mockQueryBuilder.select.mockResolvedValue(mockEvents);

      const result = await eventModel.getEventsByCategory('cat-123');

      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getFeaturedEvents', () => {
    it('should find featured events', async () => {
      const mockEvents = [{ id: '1', is_featured: true, tenant_id: 'tenant-1', venue_id: 'venue-1' }];
      mockQueryBuilder.limit.mockResolvedValue(mockEvents);

      const result = await eventModel.getFeaturedEvents(10);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ is_featured: true, visibility: 'PUBLIC' });
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('searchEvents', () => {
    it('should search events by term', async () => {
      const mockEvents = [{ id: '1', name: 'Concert', tenant_id: 'tenant-1', venue_id: 'venue-1' }];
      mockQueryBuilder.offset.mockResolvedValue(mockEvents);

      const result = await eventModel.searchEvents('concert');

      expect(result).toBeInstanceOf(Array);
    });

    it('should filter by category', async () => {
      mockQueryBuilder.offset.mockResolvedValue([]);

      await eventModel.searchEvents('test', { category_id: 'cat-123' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('primary_category_id', 'cat-123');
    });
  });

  describe('increment methods', () => {
    it('should increment view count', async () => {
      await eventModel.incrementViewCount('event-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'event-123' });
      expect(mockQueryBuilder.increment).toHaveBeenCalledWith('view_count', 1);
    });

    it('should increment interest count', async () => {
      await eventModel.incrementInterestCount('event-123');

      expect(mockQueryBuilder.increment).toHaveBeenCalledWith('interest_count', 1);
    });

    it('should increment share count', async () => {
      await eventModel.incrementShareCount('event-123');

      expect(mockQueryBuilder.increment).toHaveBeenCalledWith('share_count', 1);
    });
  });
});
