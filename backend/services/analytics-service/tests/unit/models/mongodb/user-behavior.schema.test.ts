/**
 * User Behavior Schema Unit Tests
 */

import {
  UserBehaviorSchema,
  UserBehavior,
} from '../../../../src/models/mongodb/user-behavior.schema';

// Mock MongoDB
const mockInsertOne = jest.fn();
const mockFind = jest.fn();
const mockAggregate = jest.fn();

const mockCollection = {
  insertOne: mockInsertOne,
  find: mockFind,
  aggregate: mockAggregate,
};

jest.mock('../../../../src/config/mongodb', () => ({
  getMongoDB: jest.fn(() => ({
    collection: jest.fn(() => mockCollection),
  })),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'behavior-uuid-1234'),
}));

describe('UserBehaviorSchema', () => {
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

  describe('trackBehavior', () => {
    it('should track user behavior with ID and timestamp', async () => {
      const behavior: Omit<UserBehavior, 'id'> = {
        venueId: 'venue-1',
        userId: 'hashed-user-123',
        sessionId: 'session-456',
        timestamp: new Date(),
        eventType: 'page_view',
        pageUrl: '/products',
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await UserBehaviorSchema.trackBehavior(behavior);

      expect(result.id).toBe('behavior-uuid-1234');
      expect(result.eventType).toBe('page_view');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'behavior-uuid-1234',
          userId: 'hashed-user-123',
          timestamp: expect.any(Date),
        })
      );
    });

    it('should track behavior with device info', async () => {
      const behavior: Omit<UserBehavior, 'id'> = {
        venueId: 'venue-1',
        userId: 'user-1',
        sessionId: 'session-1',
        timestamp: new Date(),
        eventType: 'click',
        deviceInfo: {
          type: 'mobile',
          os: 'iOS',
          browser: 'Safari',
          userAgent: 'Mozilla/5.0...',
        },
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await UserBehaviorSchema.trackBehavior(behavior);

      expect(result.deviceInfo).toEqual({
        type: 'mobile',
        os: 'iOS',
        browser: 'Safari',
        userAgent: 'Mozilla/5.0...',
      });
    });

    it('should track behavior with geo info', async () => {
      const behavior: Omit<UserBehavior, 'id'> = {
        venueId: 'venue-1',
        userId: 'user-1',
        sessionId: 'session-1',
        timestamp: new Date(),
        eventType: 'page_view',
        geoInfo: {
          country: 'US',
          region: 'California',
          city: 'San Francisco',
        },
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await UserBehaviorSchema.trackBehavior(behavior);

      expect(result.geoInfo).toEqual({
        country: 'US',
        region: 'California',
        city: 'San Francisco',
      });
    });

    it('should track behavior with custom properties', async () => {
      const behavior: Omit<UserBehavior, 'id'> = {
        venueId: 'venue-1',
        userId: 'user-1',
        sessionId: 'session-1',
        timestamp: new Date(),
        eventType: 'search',
        properties: {
          query: 'concert tickets',
          filters: ['rock', 'pop'],
          resultsCount: 42,
        },
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await UserBehaviorSchema.trackBehavior(behavior);

      expect(result.properties).toEqual({
        query: 'concert tickets',
        filters: ['rock', 'pop'],
        resultsCount: 42,
      });
    });

    it('should track behavior with duration', async () => {
      const behavior: Omit<UserBehavior, 'id'> = {
        venueId: 'venue-1',
        userId: 'user-1',
        sessionId: 'session-1',
        timestamp: new Date(),
        eventType: 'video_watch',
        duration: 120000, // 2 minutes in ms
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await UserBehaviorSchema.trackBehavior(behavior);

      expect(result.duration).toBe(120000);
    });
  });

  describe('getUserJourney', () => {
    it('should get user journey with default limit', async () => {
      const journey = [
        { id: 'b1', eventType: 'page_view', userId: 'user-1' },
        { id: 'b2', eventType: 'click', userId: 'user-1' },
        { id: 'b3', eventType: 'purchase', userId: 'user-1' },
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(journey),
      });

      const result = await UserBehaviorSchema.getUserJourney('venue-1', 'user-1');

      expect(result).toEqual(journey);
      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        userId: 'user-1',
      });
    });

    it('should use custom limit', async () => {
      const mockLimit = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: mockLimit,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getUserJourney('venue-1', 'user-1', 50);

      expect(mockLimit).toHaveBeenCalledWith(50);
    });

    it('should sort by timestamp descending (most recent first)', async () => {
      const mockSort = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: mockSort,
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getUserJourney('venue-1', 'user-1');

      expect(mockSort).toHaveBeenCalledWith({ timestamp: -1 });
    });
  });

  describe('getSessionActivity', () => {
    it('should get all activity for session', async () => {
      const activity = [
        { id: 'b1', sessionId: 'session-1', eventType: 'session_start' },
        { id: 'b2', sessionId: 'session-1', eventType: 'page_view' },
        { id: 'b3', sessionId: 'session-1', eventType: 'session_end' },
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(activity),
      });

      const result = await UserBehaviorSchema.getSessionActivity('session-1');

      expect(result).toEqual(activity);
      expect(mockFind).toHaveBeenCalledWith({ sessionId: 'session-1' });
    });

    it('should sort by timestamp ascending (chronological order)', async () => {
      const mockSort = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: mockSort,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getSessionActivity('session-1');

      expect(mockSort).toHaveBeenCalledWith({ timestamp: 1 });
    });
  });

  describe('aggregateUserBehavior', () => {
    it('should run aggregation pipeline with venue filter', async () => {
      const pipeline = [
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.aggregateUserBehavior('venue-1', pipeline);

      expect(mockAggregate).toHaveBeenCalledWith([
        { $match: { venueId: 'venue-1' } },
        ...pipeline,
      ]);
    });

    it('should return aggregation results', async () => {
      const pipeline = [{ $group: { _id: '$deviceInfo.type', count: { $sum: 1 } } }];
      const results = [
        { _id: 'desktop', count: 500 },
        { _id: 'mobile', count: 300 },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(results),
      });

      const result = await UserBehaviorSchema.aggregateUserBehavior('venue-1', pipeline);

      expect(result).toEqual(results);
    });
  });

  describe('getPageViews', () => {
    it('should aggregate page views by URL', async () => {
      const pageViews = [
        { _id: '/home', views: 1000, uniqueUsers: 500 },
        { _id: '/products', views: 750, uniqueUsers: 400 },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(pageViews),
      });

      const result = await UserBehaviorSchema.getPageViews('venue-1');

      expect(result).toEqual(pageViews);
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getPageViews('venue-1', startDate, endDate);

      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline).toContainEqual({
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      });
    });

    it('should calculate unique users using $addToSet', async () => {
      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getPageViews('venue-1');

      const pipeline = mockAggregate.mock.calls[0][0];
      const venueMatchIndex = pipeline.findIndex((stage: any) => stage.$match?.venueId);
      const pipelineAfterVenueMatch = pipeline.slice(venueMatchIndex + 1);
      
      const groupStage = pipelineAfterVenueMatch.find((stage: any) => stage.$group);
      expect(groupStage.$group.uniqueUsers).toEqual({ $addToSet: '$userId' });
    });

    it('should sort by views descending', async () => {
      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getPageViews('venue-1');

      const pipeline = mockAggregate.mock.calls[0][0];
      const venueMatchIndex = pipeline.findIndex((stage: any) => stage.$match?.venueId);
      const pipelineAfterVenueMatch = pipeline.slice(venueMatchIndex + 1);
      
      expect(pipelineAfterVenueMatch).toContainEqual({ $sort: { views: -1 } });
    });
  });

  describe('getDeviceStats', () => {
    it('should aggregate device statistics', async () => {
      const deviceStats = [
        {
          _id: { type: 'mobile', os: 'iOS', browser: 'Safari' },
          count: 500,
          uniqueUsers: 300,
        },
        {
          _id: { type: 'desktop', os: 'Windows', browser: 'Chrome' },
          count: 400,
          uniqueUsers: 250,
        },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(deviceStats),
      });

      const result = await UserBehaviorSchema.getDeviceStats('venue-1');

      expect(result).toEqual(deviceStats);
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getDeviceStats('venue-1', startDate, endDate);

      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline).toContainEqual({
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      });
    });

    it('should group by device type, OS, and browser', async () => {
      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getDeviceStats('venue-1');

      const pipeline = mockAggregate.mock.calls[0][0];
      const venueMatchIndex = pipeline.findIndex((stage: any) => stage.$match?.venueId);
      const pipelineAfterVenueMatch = pipeline.slice(venueMatchIndex + 1);
      
      const groupStage = pipelineAfterVenueMatch.find((stage: any) => stage.$group);
      expect(groupStage.$group._id).toEqual({
        type: '$deviceInfo.type',
        os: '$deviceInfo.os',
        browser: '$deviceInfo.browser',
      });
    });

    it('should sort by count descending', async () => {
      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await UserBehaviorSchema.getDeviceStats('venue-1');

      const pipeline = mockAggregate.mock.calls[0][0];
      const venueMatchIndex = pipeline.findIndex((stage: any) => stage.$match?.venueId);
      const pipelineAfterVenueMatch = pipeline.slice(venueMatchIndex + 1);
      
      expect(pipelineAfterVenueMatch).toContainEqual({ $sort: { count: -1 } });
    });
  });
});
