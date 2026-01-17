/**
 * Raw Analytics Schema Unit Tests
 */

import {
  RawAnalyticsSchema,
  RawAnalyticsData,
} from '../../../../src/models/mongodb/raw-analytics.schema';

// Mock MongoDB
const mockInsertOne = jest.fn();
const mockInsertMany = jest.fn();
const mockUpdateOne = jest.fn();
const mockDeleteMany = jest.fn();
const mockFind = jest.fn();
const mockAggregate = jest.fn();

const mockCollection = {
  insertOne: mockInsertOne,
  insertMany: mockInsertMany,
  updateOne: mockUpdateOne,
  deleteMany: mockDeleteMany,
  find: mockFind,
  aggregate: mockAggregate,
};

jest.mock('../../../../src/config/mongodb', () => ({
  getMongoDB: jest.fn(() => ({
    collection: jest.fn(() => mockCollection),
  })),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'raw-uuid-1234'),
}));

describe('RawAnalyticsSchema', () => {
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

  describe('storeRawData', () => {
    it('should store raw data with defaults', async () => {
      const rawData: Omit<RawAnalyticsData, 'id'> = {
        venueId: 'venue-1',
        dataType: 'clickstream',
        source: 'web',
        timestamp: new Date(),
        data: { page: '/home', action: 'view' },
        processed: false,
        processingAttempts: 0,
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await RawAnalyticsSchema.storeRawData(rawData);

      expect(result.id).toBe('raw-uuid-1234');
      expect(result.processed).toBe(false);
      expect(result.processingAttempts).toBe(0);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'raw-uuid-1234',
          venueId: 'venue-1',
          processed: false,
          processingAttempts: 0,
        })
      );
    });

    it('should store complex data structures', async () => {
      const rawData: Omit<RawAnalyticsData, 'id'> = {
        venueId: 'venue-1',
        dataType: 'transaction',
        source: 'pos',
        timestamp: new Date(),
        data: {
          orderId: 'order-123',
          items: [
            { sku: 'ABC', quantity: 2, price: 50 },
            { sku: 'DEF', quantity: 1, price: 100 },
          ],
          total: 200,
        },
        processed: false,
        processingAttempts: 0,
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await RawAnalyticsSchema.storeRawData(rawData);

      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(200);
    });

    it('should include metadata if provided', async () => {
      const rawData: Omit<RawAnalyticsData, 'id'> = {
        venueId: 'venue-1',
        dataType: 'event',
        source: 'api',
        timestamp: new Date(),
        data: {},
        processed: false,
        processingAttempts: 0,
        metadata: { version: '1.0', apiKey: 'key-123' },
      };

      mockInsertOne.mockResolvedValue({ acknowledged: true });

      const result = await RawAnalyticsSchema.storeRawData(rawData);

      expect(result.metadata).toEqual({ version: '1.0', apiKey: 'key-123' });
    });
  });

  describe('bulkStoreRawData', () => {
    it('should store multiple raw data records', async () => {
      const dataArray: Omit<RawAnalyticsData, 'id'>[] = [
        {
          venueId: 'venue-1',
          dataType: 'event',
          source: 'web',
          timestamp: new Date(),
          data: { event: 'click' },
          processed: false,
          processingAttempts: 0,
        },
        {
          venueId: 'venue-1',
          dataType: 'event',
          source: 'mobile',
          timestamp: new Date(),
          data: { event: 'view' },
          processed: false,
          processingAttempts: 0,
        },
      ];

      mockInsertMany.mockResolvedValue({ acknowledged: true });

      await RawAnalyticsSchema.bulkStoreRawData(dataArray);

      expect(mockInsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ source: 'web' }),
          expect.objectContaining({ source: 'mobile' }),
        ])
      );
    });

    it('should add IDs, timestamps, and defaults to all records', async () => {
      const dataArray: Omit<RawAnalyticsData, 'id'>[] = [
        {
          venueId: 'venue-1',
          dataType: 'test',
          source: 'test',
          timestamp: new Date(),
          data: {},
          processed: false,
          processingAttempts: 0,
        },
      ];

      mockInsertMany.mockResolvedValue({ acknowledged: true });

      await RawAnalyticsSchema.bulkStoreRawData(dataArray);

      const insertedData = mockInsertMany.mock.calls[0][0];
      insertedData.forEach((record: any) => {
        expect(record.id).toBeDefined();
        expect(record.timestamp).toBeInstanceOf(Date);
        expect(record.processed).toBe(false);
        expect(record.processingAttempts).toBe(0);
      });
    });
  });

  describe('getUnprocessedData', () => {
    it('should get unprocessed data with default limits', async () => {
      const unprocessedData = [
        { id: 'r1', processed: false, processingAttempts: 0 },
        { id: 'r2', processed: false, processingAttempts: 1 },
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(unprocessedData),
      });

      const result = await RawAnalyticsSchema.getUnprocessedData();

      expect(result).toEqual(unprocessedData);
      expect(mockFind).toHaveBeenCalledWith({
        processed: false,
        processingAttempts: { $lt: 3 },
      });
    });

    it('should use custom limit and max attempts', async () => {
      const mockLimit = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: mockLimit,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await RawAnalyticsSchema.getUnprocessedData(50, 5);

      expect(mockFind).toHaveBeenCalledWith({
        processed: false,
        processingAttempts: { $lt: 5 },
      });
      expect(mockLimit).toHaveBeenCalledWith(50);
    });

    it('should sort by timestamp ascending (oldest first)', async () => {
      const mockSort = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: mockSort,
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await RawAnalyticsSchema.getUnprocessedData();

      expect(mockSort).toHaveBeenCalledWith({ timestamp: 1 });
    });
  });

  describe('markAsProcessed', () => {
    it('should mark as successfully processed', async () => {
      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      await RawAnalyticsSchema.markAsProcessed('raw-1', true);

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { id: 'raw-1' },
        {
          $inc: { processingAttempts: 1 },
          $set: { processed: true },
        }
      );
    });

    it('should mark as failed with error message', async () => {
      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      await RawAnalyticsSchema.markAsProcessed(
        'raw-2',
        false,
        'Processing failed: invalid data'
      );

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { id: 'raw-2' },
        {
          $inc: { processingAttempts: 1 },
          $set: { lastProcessingError: 'Processing failed: invalid data' },
        }
      );
    });

    it('should increment attempts regardless of success', async () => {
      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      await RawAnalyticsSchema.markAsProcessed('raw-3', true);
      await RawAnalyticsSchema.markAsProcessed('raw-4', false, 'error');

      expect(mockUpdateOne).toHaveBeenCalledTimes(2);
      expect(mockUpdateOne.mock.calls[0][1]).toHaveProperty('$inc', {
        processingAttempts: 1,
      });
      expect(mockUpdateOne.mock.calls[1][1]).toHaveProperty('$inc', {
        processingAttempts: 1,
      });
    });
  });

  describe('getRawDataByType', () => {
    it('should get raw data by type', async () => {
      const rawData = [
        { id: 'r1', dataType: 'clickstream', venueId: 'venue-1' },
        { id: 'r2', dataType: 'clickstream', venueId: 'venue-1' },
      ];

      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(rawData),
      });

      const result = await RawAnalyticsSchema.getRawDataByType(
        'venue-1',
        'clickstream'
      );

      expect(result).toEqual(rawData);
      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        dataType: 'clickstream',
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

      await RawAnalyticsSchema.getRawDataByType(
        'venue-1',
        'events',
        startDate,
        endDate
      );

      expect(mockFind).toHaveBeenCalledWith({
        venueId: 'venue-1',
        dataType: 'events',
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      });
    });

    it('should use custom limit', async () => {
      const mockLimit = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: mockLimit,
        toArray: jest.fn().mockResolvedValue([]),
      });

      await RawAnalyticsSchema.getRawDataByType(
        'venue-1',
        'type',
        undefined,
        undefined,
        500
      );

      expect(mockLimit).toHaveBeenCalledWith(500);
    });

    it('should sort by timestamp descending', async () => {
      const mockSort = jest.fn().mockReturnThis();
      mockFind.mockReturnValue({
        sort: mockSort,
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([]),
      });

      await RawAnalyticsSchema.getRawDataByType('venue-1', 'type');

      expect(mockSort).toHaveBeenCalledWith({ timestamp: -1 });
    });
  });

  describe('cleanupOldData', () => {
    it('should delete old processed data', async () => {
      mockDeleteMany.mockResolvedValue({ deletedCount: 150 });

      const result = await RawAnalyticsSchema.cleanupOldData(30);

      expect(result).toBe(150);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        timestamp: { $lt: expect.any(Date) },
        processed: true,
      });
    });

    it('should calculate correct cutoff date', async () => {
      mockDeleteMany.mockResolvedValue({ deletedCount: 0 });

      const beforeCleanup = Date.now();
      await RawAnalyticsSchema.cleanupOldData(7);
      const afterCleanup = Date.now();

      const cutoffDate = mockDeleteMany.mock.calls[0][0].timestamp.$lt;
      const expectedCutoff = new Date(beforeCleanup - 7 * 24 * 60 * 60 * 1000);

      expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(
        expectedCutoff.getTime() - 1000
      );
      expect(cutoffDate.getTime()).toBeLessThanOrEqual(afterCleanup);
    });

    it('should only delete processed records', async () => {
      mockDeleteMany.mockResolvedValue({ deletedCount: 10 });

      await RawAnalyticsSchema.cleanupOldData(90);

      expect(mockDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true })
      );
    });

    it('should return 0 if no records deleted', async () => {
      mockDeleteMany.mockResolvedValue({ deletedCount: undefined });

      const result = await RawAnalyticsSchema.cleanupOldData(30);

      expect(result).toBe(0);
    });
  });

  describe('getDataStats', () => {
    it('should aggregate data statistics', async () => {
      const stats = [
        {
          _id: { dataType: 'events', source: 'web', processed: true },
          count: 1000,
          oldestRecord: new Date('2024-01-01'),
          newestRecord: new Date('2024-12-31'),
        },
        {
          _id: { dataType: 'events', source: 'mobile', processed: false },
          count: 50,
          oldestRecord: new Date('2024-12-01'),
          newestRecord: new Date('2024-12-31'),
        },
      ];

      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(stats),
      });

      const result = await RawAnalyticsSchema.getDataStats('venue-1');

      expect(result).toEqual(stats);
      expect(mockAggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { venueId: 'venue-1' } },
          expect.objectContaining({ $group: expect.any(Object) }),
          { $sort: { count: -1 } },
        ])
      );
    });

    it('should group by dataType, source, and processed status', async () => {
      mockAggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });

      await RawAnalyticsSchema.getDataStats('venue-1');

      const pipeline = mockAggregate.mock.calls[0][0];
      const groupStage = pipeline.find((stage: any) => stage.$group);

      expect(groupStage.$group._id).toEqual({
        dataType: '$dataType',
        source: '$source',
        processed: '$processed',
      });
      expect(groupStage.$group).toHaveProperty('count');
      expect(groupStage.$group).toHaveProperty('oldestRecord');
      expect(groupStage.$group).toHaveProperty('newestRecord');
    });
  });
});
