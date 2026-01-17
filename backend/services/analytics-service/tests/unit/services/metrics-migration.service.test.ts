/**
 * Metrics Migration Service Unit Tests
 */

const mockRecordUserAction = jest.fn().mockResolvedValue(undefined);
const mockRecordEventMetrics = jest.fn().mockResolvedValue(undefined);
const mockRecordSalesVelocity = jest.fn().mockResolvedValue(undefined);
const mockFlush = jest.fn().mockResolvedValue(undefined);
const mockGetEventSalesTimeSeries = jest.fn().mockResolvedValue([]);

jest.mock('../../../src/services/influxdb-metrics.service', () => ({
  InfluxDBMetricsService: jest.fn().mockImplementation(() => ({
    recordUserAction: mockRecordUserAction,
    recordEventMetrics: mockRecordEventMetrics,
    recordSalesVelocity: mockRecordSalesVelocity,
    flush: mockFlush,
    getEventSalesTimeSeries: mockGetEventSalesTimeSeries,
  })),
}));

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockInsertOne = jest.fn().mockResolvedValue({ insertedId: 'doc-1' });
const mockFind = jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
const mockCountDocuments = jest.fn().mockResolvedValue(0);

const mockCollection = jest.fn().mockReturnValue({
  insertOne: mockInsertOne,
  find: mockFind,
  countDocuments: mockCountDocuments,
});

const mockDb = jest.fn().mockReturnValue({
  collection: mockCollection,
});

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    db: mockDb,
  })),
}));

import { MetricsMigrationService } from '../../../src/services/metrics-migration.service';

describe('MetricsMigrationService', () => {
  let service: MetricsMigrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MetricsMigrationService();
  });

  afterEach(async () => {
    await service.close();
  });

  describe('constructor', () => {
    it('should create InfluxDB service', () => {
      expect((service as any).influxService).toBeDefined();
    });

    it('should create MongoDB client', () => {
      expect((service as any).mongoClient).toBeDefined();
    });

    it('should start disconnected', () => {
      expect((service as any).isConnected).toBe(false);
    });
  });

  describe('ensureConnected', () => {
    it('should connect on first call', async () => {
      await (service as any).ensureConnected();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect((service as any).isConnected).toBe(true);
    });

    it('should not reconnect if already connected', async () => {
      await (service as any).ensureConnected();
      await (service as any).ensureConnected();

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('should close MongoDB connection', async () => {
      await (service as any).ensureConnected();
      await service.close();

      expect(mockClose).toHaveBeenCalled();
      expect((service as any).isConnected).toBe(false);
    });

    it('should not close if not connected', async () => {
      await service.close();

      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('recordMetric', () => {
    describe('user_action', () => {
      it('should write to InfluxDB', async () => {
        const payload = { userId: 'user-1', action: 'click', eventId: 'event-1' };

        await service.recordMetric({ type: 'user_action', payload });

        expect(mockRecordUserAction).toHaveBeenCalledWith(payload);
      });

      it('should write to MongoDB user_behavior collection', async () => {
        const payload = { userId: 'user-1', action: 'click' };

        await service.recordMetric({ type: 'user_action', payload });

        expect(mockCollection).toHaveBeenCalledWith('user_behavior');
        expect(mockInsertOne).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            action: 'click',
            migrated_to_influx: true,
          })
        );
      });
    });

    describe('event_metric', () => {
      it('should write to InfluxDB', async () => {
        const payload = { eventId: 'event-1', ticketsSold: 100 };

        await service.recordMetric({ type: 'event_metric', payload });

        expect(mockRecordEventMetrics).toHaveBeenCalledWith(payload);
      });

      it('should write to MongoDB event_analytics collection', async () => {
        const payload = { eventId: 'event-1', ticketsSold: 100 };

        await service.recordMetric({ type: 'event_metric', payload });

        expect(mockCollection).toHaveBeenCalledWith('event_analytics');
      });
    });

    describe('sales_velocity', () => {
      it('should write to InfluxDB', async () => {
        const payload = { eventId: 'event-1', velocity: 50 };

        await service.recordMetric({ type: 'sales_velocity', payload });

        expect(mockRecordSalesVelocity).toHaveBeenCalledWith(payload);
      });

      it('should write to MongoDB event_analytics collection', async () => {
        const payload = { eventId: 'event-1', velocity: 50 };

        await service.recordMetric({ type: 'sales_velocity', payload });

        expect(mockCollection).toHaveBeenCalledWith('event_analytics');
      });
    });

    it('should handle InfluxDB errors gracefully', async () => {
      mockRecordUserAction.mockRejectedValueOnce(new Error('InfluxDB error'));

      await expect(
        service.recordMetric({ type: 'user_action', payload: {} })
      ).resolves.not.toThrow();
    });

    it('should handle MongoDB errors gracefully', async () => {
      mockInsertOne.mockRejectedValueOnce(new Error('MongoDB error'));

      await expect(
        service.recordMetric({ type: 'user_action', payload: {} })
      ).resolves.not.toThrow();
    });

    it('should include timestamp in MongoDB document', async () => {
      await service.recordMetric({ type: 'user_action', payload: { userId: 'user-1' } });

      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('migrateHistoricalData', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    beforeEach(() => {
      mockFind.mockReturnValue({
        toArray: jest.fn()
          .mockResolvedValueOnce([
            { user_id: 'user-1', action: 'click', event_id: 'event-1', venue_id: 'venue-1', duration_ms: 100 },
            { user_id: 'user-2', action: 'view', event_id: 'event-1', venue_id: 'venue-1', duration_ms: 200 },
          ])
          .mockResolvedValueOnce([
            { event_id: 'event-1', venue_id: 'venue-1', tickets_sold: 100, revenue_cents: 10000, capacity: 500 },
          ]),
      });
    });

    it('should migrate user_behavior collection', async () => {
      await service.migrateHistoricalData(startDate, endDate);

      expect(mockRecordUserAction).toHaveBeenCalledTimes(2);
      expect(mockRecordUserAction).toHaveBeenCalledWith({
        userId: 'user-1',
        action: 'click',
        eventId: 'event-1',
        venueId: 'venue-1',
        durationMs: 100,
      });
    });

    it('should migrate event_analytics collection', async () => {
      await service.migrateHistoricalData(startDate, endDate);

      expect(mockRecordEventMetrics).toHaveBeenCalled();
    });

    it('should flush after migration', async () => {
      await service.migrateHistoricalData(startDate, endDate);

      expect(mockFlush).toHaveBeenCalled();
    });

    it('should query with date range', async () => {
      await service.migrateHistoricalData(startDate, endDate);

      expect(mockFind).toHaveBeenCalledWith({
        timestamp: { $gte: startDate, $lte: endDate },
      });
    });
  });

  describe('validateMigration', () => {
    it('should compare MongoDB and InfluxDB counts', async () => {
      mockCountDocuments.mockResolvedValueOnce(10);
      mockGetEventSalesTimeSeries.mockResolvedValueOnce([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const result = await service.validateMigration('event-1', new Date('2024-01-15'));

      expect(result.mongodb_count).toBe(10);
      expect(result.influxdb_count).toBe(10);
      expect(result.match).toBe(true);
    });

    it('should report mismatch', async () => {
      mockCountDocuments.mockResolvedValueOnce(10);
      mockGetEventSalesTimeSeries.mockResolvedValueOnce([1, 2, 3, 4, 5]);

      const result = await service.validateMigration('event-1', new Date('2024-01-15'));

      expect(result.match).toBe(false);
    });

    it('should include date in result', async () => {
      const date = new Date('2024-01-15');
      mockCountDocuments.mockResolvedValueOnce(0);

      const result = await service.validateMigration('event-1', date);

      expect(result.date).toBe('2024-01-15');
    });

    it('should query MongoDB with date range', async () => {
      const date = new Date('2024-01-15');
      mockCountDocuments.mockResolvedValueOnce(0);

      await service.validateMigration('event-1', date);

      expect(mockCountDocuments).toHaveBeenCalledWith({
        event_id: 'event-1',
        timestamp: expect.objectContaining({
          $gte: expect.any(Date),
          $lt: expect.any(Date),
        }),
      });
    });

    it('should query InfluxDB for 24 hours', async () => {
      mockCountDocuments.mockResolvedValueOnce(0);

      await service.validateMigration('event-1', new Date('2024-01-15'));

      expect(mockGetEventSalesTimeSeries).toHaveBeenCalledWith('event-1', 24);
    });
  });
});
