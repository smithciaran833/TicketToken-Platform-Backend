/**
 * Event Schema Unit Tests
 */

import { EventSchema } from '../../../../src/models/mongodb/event.schema';
import { AnalyticsEvent } from '../../../../src/types';

// Mock MongoDB
const mockInsertOne = jest.fn();
const mockInsertMany = jest.fn();
const mockFind = jest.fn();
const mockAggregate = jest.fn();

const mockCollection = {
  insertOne: mockInsertOne,
  insertMany: mockInsertMany,
  find: mockFind,
  aggregate: mockAggregate,
};

jest.mock('../../../../src/config/mongodb', () => ({
  getMongoDB: jest.fn(() => ({
    collection: jest.fn(() => mockCollection),
  })),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'event-uuid-1234'),
}));

describe('EventSchema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFind.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([]),
    });
    mockAggregate.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([]),
    });
  });

  describe('createEvent', () => {
    it('should create event with ID and timestamp', async () => {
      const eventData: Omit<AnalyticsEvent, 'id'> = {
        venueId: 'venue-1',
        eventType: 'page_view',
        userId: 'user-1',
        eventId: 'event-1',
        timestamp: new Date(),
        properties: { page: '/home' },
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await EventSchema.createEvent(eventData);

      expect(result.id).toBe('event-uuid-1234');
      expect(result.eventType).toBe('page_view');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'event-uuid-1234',
          eventType: 'page_view',
          timestamp: expect.any(Date),
        })
      );
    });

    it('should preserve all event properties', async () => {
      const eventData: Omit<AnalyticsEvent, 'id'> = {
        venueId: 'venue-2',
        eventType: 'purchase',
        userId: 'user-2',
        eventId: 'event-2',
        timestamp: new Date(),
        properties: {
          amount: 99.99,
          currency: 'USD',
          items: ['item1', 'item2'],
        },
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await EventSchema.createEvent(eventData);

      expect(result.properties).toEqual(eventData.properties);
      expect(result.properties.items).toHaveLength(2);
    });
  });

  describe('bulkCreateEvents', () => {
    it('should create multiple events', async () => {
      const events: Omit<AnalyticsEvent, 'id'>[] = [
        {
          venueId: 'venue-1',
          eventType: 'click',
          userId: 'user-1',
          eventId: 'event-1',
          timestamp: new Date(),
        },
        {
          venueId: 'venue-1',
          eventType: 'view',
          userId: 'user-2',
          eventId: 'event-2',
          timestamp: new Date(),
        },
      ];

      mockInsertMany.mockResolvedValue({ acknowledged: true });

      await EventSchema.bulkCreateEvents(events);

      expect(mockInsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'click' }),
          expect.objectContaining({ eventType: 'view' }),
        ])
      );
    });

    it('should add IDs and timestamps to all events', async () => {
      const events: Omit<AnalyticsEvent, 'id'>[] = [
        {
          venueId: 'venue-1',
          eventType: 'test',
          userId: 'user-1',
          eventId: 'event-1',
          timestamp: new Date(),
        },
      ];

      mockInsertMany.mockResolvedValue({ acknowledged: true });

      await EventSchema.bulkCreateEvents(events);

      const insertedData = mockInsertMany.mock.calls[0][0];
      insertedData.forEach((event: any) => {
        expect(event.id).toBeDefined();
        expect(event.timestamp).toBeInstanceOf(Date);
      });
    });
  });

  describe('getEvents', () => {
    it('should get all events for venue', async () => {
      const events = [
        { id: 'e1', eventType: 'view', venueId: 'venue-1' },
        { id: 'e2', eventType: 'click', venueId: 'venue-1' },
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(events),
      });

      const result = await EventSchema.getEvents('venue-1');

      expect(result).toEqual(events);
      expect(mockFind).toHaveBeenCalledWith({ venueId: 'venue-1' });
    });

    it('should filter by event type', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1', { eventType: 'purchase' });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        eventType: 'purchase',
      });
    });

    it('should filter by user ID', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1', { userId: 'user-123' });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        userId: 'user-123',
      });
    });

    it('should filter by event ID', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1', { eventId: 'event-456' });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        eventId: 'event-456',
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1', { startDate, endDate });

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      });
    });

    it('should apply custom limit', async () => {
      const mockLimit = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: mockLimit,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1', { limit: 50 });

      expect(mockLimit).toHaveBeenCalledWith(50);
    });

    it('should use default limit of 1000', async () => {
      const mockLimit = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: mockLimit,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1');

      expect(mockLimit).toHaveBeenCalledWith(1000);
    });

    it('should sort by timestamp descending', async () => {
      const mockSort = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: mockSort,
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1');

      expect(mockSort).toHaveBeenCalledWith({ timestamp: -1 });
    });

    it('should combine multiple filters', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEvents('venue-1', {
        eventType: 'purchase',
        userId: 'user-123',
        startDate: new Date('2024-01-01'),
        limit: 100,
      });

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-1',
          eventType: 'purchase',
          userId: 'user-123',
          timestamp: expect.any(Object),
        })
      );
    });
  });

  describe('aggregateEvents', () => {
    it('should run aggregation pipeline with venue filter', async () => {
      const pipeline = [
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.aggregateEvents('venue-1', pipeline);

      expect(mockAggregate).toHaveBeenCalledWith([
        { $match: { venueId: 'venue-1' } },
        ...pipeline,
      ]);
    });

    it('should return aggregation results', async () => {
      const pipeline = [{ $group: { _id: '$eventType', count: { $sum: 1 } } }];
      const results = [
        { _id: 'view', count: 100 },
        { _id: 'click', count: 50 },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(results),
      });

      const result = await EventSchema.aggregateEvents('venue-1', pipeline);

      expect(result).toEqual(results);
    });
  });

  describe('getEventCounts', () => {
    it('should count events grouped by field', async () => {
      const counts = [
        { _id: 'page_view', count: 500 },
        { _id: 'click', count: 100 },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(counts),
      });

      const result = await EventSchema.getEventCounts('venue-1', 'eventType');

      expect(result).toEqual(counts);
      expect(mockAggregate).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEventCounts('venue-1', 'eventType', startDate, endDate);

      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline).toEqual(
        expect.arrayContaining([
          { $match: { venueId: 'venue-1' } },
          expect.objectContaining({
            $match: {
              timestamp: { $gte: startDate, $lte: endDate },
            },
          }),
        ])
      );
    });

    it('should sort by count descending', async () => {
      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await EventSchema.getEventCounts('venue-1', 'userId');

      const pipeline = mockAggregate.mock.calls[0][0];
      const venueMatchIndex = pipeline.findIndex((stage: any) => stage.$match?.venueId);
      const pipelineAfterVenueMatch = pipeline.slice(venueMatchIndex + 1);
      
      expect(pipelineAfterVenueMatch).toContainEqual({ $sort: { count: -1 } });
    });
  });
});
