/**
 * InfluxDB Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

const mockWritePoint = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockUseDefaultTags = jest.fn();

const mockQueryRows = jest.fn();

jest.mock('@influxdata/influxdb-client', () => ({
  InfluxDB: jest.fn().mockImplementation(() => ({
    getWriteApi: jest.fn().mockReturnValue({
      writePoint: mockWritePoint,
      flush: mockFlush,
      close: mockClose,
      useDefaultTags: mockUseDefaultTags,
    }),
    getQueryApi: jest.fn().mockReturnValue({
      queryRows: mockQueryRows,
    }),
  })),
  Point: jest.fn().mockImplementation(() => ({
    tag: jest.fn().mockReturnThis(),
    floatField: jest.fn().mockReturnThis(),
    stringField: jest.fn().mockReturnThis(),
    booleanField: jest.fn().mockReturnThis(),
    timestamp: jest.fn().mockReturnThis(),
  })),
  flux: jest.fn(),
  fluxDuration: jest.fn(),
}));

// Must import after mocks
import { InfluxDBService } from '../../../src/services/influxdb.service';
import { Point } from '@influxdata/influxdb-client';

describe('InfluxDBService', () => {
  let service: InfluxDBService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = InfluxDBService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = InfluxDBService.getInstance();
      const instance2 = InfluxDBService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('writeMetric', () => {
    it('should create point with required fields', async () => {
      await service.writeMetric('venue-123', 'revenue', 1000);

      expect(Point).toHaveBeenCalledWith('revenue');
      expect(mockWritePoint).toHaveBeenCalled();
    });

    it('should add venue_id tag', async () => {
      await service.writeMetric('venue-456', 'sales', 50);

      const pointInstance = (Point as jest.Mock).mock.results[0].value;
      expect(pointInstance.tag).toHaveBeenCalledWith('venue_id', 'venue-456');
    });

    it('should add value as float field', async () => {
      await service.writeMetric('venue-123', 'revenue', 1500.50);

      const pointInstance = (Point as jest.Mock).mock.results[0].value;
      expect(pointInstance.floatField).toHaveBeenCalledWith('value', 1500.50);
    });

    it('should add custom timestamp', async () => {
      const timestamp = new Date('2024-01-15T10:30:00Z');
      await service.writeMetric('venue-123', 'revenue', 1000, undefined, undefined, timestamp);

      const pointInstance = (Point as jest.Mock).mock.results[0].value;
      expect(pointInstance.timestamp).toHaveBeenCalledWith(timestamp);
    });

    it('should add dimensions as tags', async () => {
      await service.writeMetric('venue-123', 'sales', 10, {
        event_type: 'concert',
        category: 'vip',
      });

      const pointInstance = (Point as jest.Mock).mock.results[0].value;
      expect(pointInstance.tag).toHaveBeenCalledWith('event_type', 'concert');
      expect(pointInstance.tag).toHaveBeenCalledWith('category', 'vip');
    });

    it('should add number metadata as float fields', async () => {
      await service.writeMetric('venue-123', 'sales', 10, undefined, {
        quantity: 5,
      });

      const pointInstance = (Point as jest.Mock).mock.results[0].value;
      expect(pointInstance.floatField).toHaveBeenCalledWith('quantity', 5);
    });

    it('should add string metadata as string fields', async () => {
      await service.writeMetric('venue-123', 'sales', 10, undefined, {
        description: 'VIP ticket',
      });

      const pointInstance = (Point as jest.Mock).mock.results[0].value;
      expect(pointInstance.stringField).toHaveBeenCalledWith('description', 'VIP ticket');
    });

    it('should add boolean metadata as boolean fields', async () => {
      await service.writeMetric('venue-123', 'sales', 10, undefined, {
        isPromotional: true,
      });

      const pointInstance = (Point as jest.Mock).mock.results[0].value;
      expect(pointInstance.booleanField).toHaveBeenCalledWith('isPromotional', true);
    });

    it('should set isConnected to true on success', async () => {
      await service.writeMetric('venue-123', 'revenue', 1000);

      expect(service.getConnectionStatus()).toBe(true);
    });

    it('should throw and set isConnected to false on error', async () => {
      mockWritePoint.mockImplementationOnce(() => {
        throw new Error('Write failed');
      });

      await expect(
        service.writeMetric('venue-123', 'revenue', 1000)
      ).rejects.toThrow('Write failed');

      expect(service.getConnectionStatus()).toBe(false);
    });
  });

  describe('bulkWriteMetrics', () => {
    it('should write multiple metrics', async () => {
      const metrics = [
        { venueId: 'venue-1', metricType: 'revenue' as any, value: 1000 },
        { venueId: 'venue-2', metricType: 'sales' as any, value: 50 },
      ];

      await service.bulkWriteMetrics(metrics);

      expect(Point).toHaveBeenCalledTimes(2);
      expect(mockWritePoint).toHaveBeenCalledTimes(2);
    });

    it('should handle empty array', async () => {
      await service.bulkWriteMetrics([]);

      expect(mockWritePoint).not.toHaveBeenCalled();
    });

    it('should throw on error', async () => {
      mockWritePoint.mockImplementationOnce(() => {
        throw new Error('Bulk write failed');
      });

      const metrics = [{ venueId: 'venue-1', metricType: 'revenue' as any, value: 1000 }];

      await expect(service.bulkWriteMetrics(metrics)).rejects.toThrow('Bulk write failed');
    });
  });

  describe('flush', () => {
    it('should flush write buffer', async () => {
      await service.flush();

      expect(mockFlush).toHaveBeenCalled();
    });

    it('should throw on flush error', async () => {
      mockFlush.mockRejectedValueOnce(new Error('Flush failed'));

      await expect(service.flush()).rejects.toThrow('Flush failed');
    });
  });

  describe('close', () => {
    it('should close connection', async () => {
      await service.close();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should set isConnected to false', async () => {
      await service.writeMetric('venue-123', 'revenue', 1000); // Set connected
      await service.close();

      expect(service.getConnectionStatus()).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return true on successful write and flush', async () => {
      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockWritePoint).toHaveBeenCalled();
      expect(mockFlush).toHaveBeenCalled();
    });

    it('should return false on error', async () => {
      mockFlush.mockRejectedValueOnce(new Error('Health check failed'));

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('queryMetrics', () => {
    it('should execute flux query', async () => {
      mockQueryRows.mockImplementation((query, callbacks) => {
        callbacks.complete();
      });

      await service.queryMetrics(
        'venue-123',
        'revenue',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(mockQueryRows).toHaveBeenCalled();
    });

    it('should return results array', async () => {
      mockQueryRows.mockImplementation((query, callbacks) => {
        callbacks.next(
          ['2024-01-15', 1000],
          { toObject: () => ({ _time: '2024-01-15T00:00:00Z', _value: 1000 }) }
        );
        callbacks.complete();
      });

      const results = await service.queryMetrics(
        'venue-123',
        'revenue',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(results).toHaveLength(1);
      expect(results[0].value).toBe(1000);
    });

    it('should handle query error', async () => {
      mockQueryRows.mockImplementation((query, callbacks) => {
        callbacks.error(new Error('Query failed'));
      });

      await expect(
        service.queryMetrics(
          'venue-123',
          'revenue',
          new Date('2024-01-01'),
          new Date('2024-01-31')
        )
      ).rejects.toThrow('Query failed');
    });

    it('should apply granularity to window', async () => {
      mockQueryRows.mockImplementation((query, callbacks) => {
        callbacks.complete();
      });

      await service.queryMetrics(
        'venue-123',
        'revenue',
        new Date('2024-01-01'),
        new Date('2024-01-31'),
        { value: 1, unit: 'hour' }
      );

      const queryArg = mockQueryRows.mock.calls[0][0];
      expect(queryArg).toContain('1h');
    });
  });

  describe('aggregateMetrics', () => {
    it('should execute aggregation query', async () => {
      mockQueryRows.mockImplementation((query, callbacks) => {
        callbacks.next(
          ['sum', 5000],
          { toObject: () => ({ _value: 5000 }) }
        );
        callbacks.complete();
      });

      const result = await service.aggregateMetrics(
        'venue-123',
        'revenue',
        'sum',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toEqual({ sum: 5000 });
    });

    it('should map avg to mean in flux', async () => {
      mockQueryRows.mockImplementation((query, callbacks) => {
        callbacks.complete();
      });

      await service.aggregateMetrics(
        'venue-123',
        'revenue',
        'avg',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      const queryArg = mockQueryRows.mock.calls[0][0];
      expect(queryArg).toContain('mean()');
    });

    it('should handle aggregation error', async () => {
      mockQueryRows.mockImplementation((query, callbacks) => {
        callbacks.error(new Error('Aggregation failed'));
      });

      await expect(
        service.aggregateMetrics(
          'venue-123',
          'revenue',
          'sum',
          new Date('2024-01-01'),
          new Date('2024-01-31')
        )
      ).rejects.toThrow('Aggregation failed');
    });
  });
});
