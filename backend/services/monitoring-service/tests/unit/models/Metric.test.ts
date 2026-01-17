import { MetricModel, IMetric } from '../../../src/models/Metric';

describe('MetricModel', () => {
  let metricModel: MetricModel;
  let mockDb: any;
  let mockQueryBuilder: any;

  const createMockMetric = (overrides: Partial<IMetric> = {}): IMetric => ({
    id: 'metric-123',
    name: 'cpu_usage',
    value: 75.5,
    unit: 'percent',
    service: 'api-service',
    tags: { host: 'server-01', env: 'production' },
    timestamp: new Date('2024-01-15T10:00:00Z'),
    created_at: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    // Create a self-referencing mock for chaining
    mockQueryBuilder = {
      insert: jest.fn(),
      select: jest.fn(),
      where: jest.fn(),
      first: jest.fn(),
      del: jest.fn(),
      returning: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
    };

    // Make all chainable methods return the builder
    mockQueryBuilder.insert.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.select.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);

    mockDb = jest.fn().mockReturnValue(mockQueryBuilder);
    metricModel = new MetricModel(mockDb);
  });

  describe('constructor', () => {
    it('should use provided db instance', () => {
      const customDb = jest.fn();
      const model = new MetricModel(customDb);

      expect(model).toBeInstanceOf(MetricModel);
    });

    it('should use default db when none provided', () => {
      expect(() => new MetricModel()).not.toThrow();
    });
  });

  describe('create', () => {
    it('should insert metric and return created record', async () => {
      const metricData: IMetric = {
        name: 'memory_usage',
        value: 65.2,
        unit: 'percent',
        service: 'worker-service',
        timestamp: new Date(),
      };

      const createdMetric = createMockMetric(metricData);
      mockQueryBuilder.returning.mockResolvedValue([createdMetric]);

      const result = await metricModel.create(metricData);

      expect(mockDb).toHaveBeenCalledWith('metrics');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(metricData);
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdMetric);
    });

    it('should handle various metric types', async () => {
      const metricNames = [
        'cpu_usage',
        'memory_usage',
        'disk_io',
        'network_bytes_in',
        'http_request_duration_ms',
        'database_connections',
      ];

      for (const name of metricNames) {
        const metricData: IMetric = {
          name,
          value: Math.random() * 100,
          service: 'test-service',
          timestamp: new Date(),
        };

        const createdMetric = createMockMetric(metricData);
        mockQueryBuilder.returning.mockResolvedValue([createdMetric]);

        const result = await metricModel.create(metricData);

        expect(result.name).toBe(name);
      }
    });

    it('should handle different units', async () => {
      const units = ['percent', 'bytes', 'milliseconds', 'count', 'bytes/sec', null];

      for (const unit of units) {
        const metricData: IMetric = {
          name: 'test_metric',
          value: 100,
          unit: unit ?? undefined,
          service: 'test-service',
          timestamp: new Date(),
        };

        const createdMetric = createMockMetric({ ...metricData, unit: unit ?? undefined });
        mockQueryBuilder.returning.mockResolvedValue([createdMetric]);

        const result = await metricModel.create(metricData);

        expect(result.unit).toBe(unit ?? undefined);
      }
    });

    it('should handle tags as JSON', async () => {
      const tags = {
        host: 'server-01',
        env: 'production',
        region: 'us-east-1',
        version: '1.2.3',
        custom_tag: 'value',
      };

      const metricData: IMetric = {
        name: 'tagged_metric',
        value: 42,
        service: 'tagged-service',
        tags,
        timestamp: new Date(),
      };

      const createdMetric = createMockMetric(metricData);
      mockQueryBuilder.returning.mockResolvedValue([createdMetric]);

      const result = await metricModel.create(metricData);

      expect(result.tags).toEqual(tags);
    });

    it('should handle negative values', async () => {
      const metricData: IMetric = {
        name: 'temperature',
        value: -15.5,
        unit: 'celsius',
        service: 'sensor-service',
        timestamp: new Date(),
      };

      const createdMetric = createMockMetric(metricData);
      mockQueryBuilder.returning.mockResolvedValue([createdMetric]);

      const result = await metricModel.create(metricData);

      expect(result.value).toBe(-15.5);
    });

    it('should handle zero values', async () => {
      const metricData: IMetric = {
        name: 'error_count',
        value: 0,
        service: 'error-free-service',
        timestamp: new Date(),
      };

      const createdMetric = createMockMetric(metricData);
      mockQueryBuilder.returning.mockResolvedValue([createdMetric]);

      const result = await metricModel.create(metricData);

      expect(result.value).toBe(0);
    });

    it('should handle very large values', async () => {
      const metricData: IMetric = {
        name: 'total_bytes',
        value: 9007199254740991, // Number.MAX_SAFE_INTEGER
        unit: 'bytes',
        service: 'storage-service',
        timestamp: new Date(),
      };

      const createdMetric = createMockMetric(metricData);
      mockQueryBuilder.returning.mockResolvedValue([createdMetric]);

      const result = await metricModel.create(metricData);

      expect(result.value).toBe(9007199254740991);
    });
  });

  describe('findById', () => {
    it('should return metric when found', async () => {
      const metric = createMockMetric();
      mockQueryBuilder.first.mockResolvedValue(metric);

      const result = await metricModel.findById('metric-123');

      expect(mockDb).toHaveBeenCalledWith('metrics');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'metric-123' });
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result).toEqual(metric);
    });

    it('should return null when metric not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await metricModel.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should return null when first() returns null', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await metricModel.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByService', () => {
    it('should return metrics for service ordered by timestamp desc', async () => {
      const metrics = [
        createMockMetric({ id: '1', timestamp: new Date('2024-01-15T12:00:00Z') }),
        createMockMetric({ id: '2', timestamp: new Date('2024-01-15T11:00:00Z') }),
        createMockMetric({ id: '3', timestamp: new Date('2024-01-15T10:00:00Z') }),
      ];

      // For findByService, orderBy is the terminal operation
      mockQueryBuilder.orderBy.mockResolvedValue(metrics);

      const result = await metricModel.findByService('api-service');

      expect(mockDb).toHaveBeenCalledWith('metrics');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ service: 'api-service' });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(result).toEqual(metrics);
    });

    it('should filter by startTime when provided', async () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      await metricModel.findByService('api-service', startTime);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ service: 'api-service' });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('timestamp', '>=', startTime);
    });

    it('should filter by endTime when provided', async () => {
      const endTime = new Date('2024-01-15T12:00:00Z');
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      await metricModel.findByService('api-service', undefined, endTime);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ service: 'api-service' });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('timestamp', '<=', endTime);
    });

    it('should filter by both startTime and endTime', async () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const endTime = new Date('2024-01-15T12:00:00Z');
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      await metricModel.findByService('api-service', startTime, endTime);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ service: 'api-service' });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('timestamp', '>=', startTime);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('timestamp', '<=', endTime);
    });

    it('should return empty array when no metrics found', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      const result = await metricModel.findByService('non-existent-service');

      expect(result).toEqual([]);
    });
  });

  describe('findByName', () => {
    it('should return metrics by name with default limit', async () => {
      const metrics = [
        createMockMetric({ id: '1', name: 'cpu_usage' }),
        createMockMetric({ id: '2', name: 'cpu_usage' }),
      ];

      // For findByName, limit is the terminal operation
      mockQueryBuilder.limit.mockResolvedValue(metrics);

      const result = await metricModel.findByName('cpu_usage');

      expect(mockDb).toHaveBeenCalledWith('metrics');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ name: 'cpu_usage' });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(100);
      expect(result).toEqual(metrics);
    });

    it('should respect custom limit parameter', async () => {
      mockQueryBuilder.limit.mockResolvedValue([]);

      await metricModel.findByName('cpu_usage', 50);

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('should handle limit of 1', async () => {
      const metric = createMockMetric();
      mockQueryBuilder.limit.mockResolvedValue([metric]);

      const result = await metricModel.findByName('cpu_usage', 1);

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(1);
      expect(result).toHaveLength(1);
    });

    it('should handle large limit', async () => {
      mockQueryBuilder.limit.mockResolvedValue([]);

      await metricModel.findByName('cpu_usage', 10000);

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10000);
    });

    it('should return empty array when no metrics found', async () => {
      mockQueryBuilder.limit.mockResolvedValue([]);

      const result = await metricModel.findByName('non-existent-metric');

      expect(result).toEqual([]);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete metrics older than specified date', async () => {
      const cutoffDate = new Date('2024-01-01T00:00:00Z');
      mockQueryBuilder.del.mockResolvedValue(150);

      const result = await metricModel.deleteOlderThan(cutoffDate);

      expect(mockDb).toHaveBeenCalledWith('metrics');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('timestamp', '<', cutoffDate);
      expect(mockQueryBuilder.del).toHaveBeenCalled();
      expect(result).toBe(150);
    });

    it('should return 0 when no metrics to delete', async () => {
      const cutoffDate = new Date('2020-01-01T00:00:00Z');
      mockQueryBuilder.del.mockResolvedValue(0);

      const result = await metricModel.deleteOlderThan(cutoffDate);

      expect(result).toBe(0);
    });

    it('should handle deletion of large number of records', async () => {
      const cutoffDate = new Date();
      mockQueryBuilder.del.mockResolvedValue(1000000);

      const result = await metricModel.deleteOlderThan(cutoffDate);

      expect(result).toBe(1000000);
    });

    it('should use correct comparison operator', async () => {
      const cutoffDate = new Date('2024-01-15T10:00:00Z');
      mockQueryBuilder.del.mockResolvedValue(10);

      await metricModel.deleteOlderThan(cutoffDate);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('timestamp', '<', cutoffDate);
    });
  });

  describe('table name', () => {
    it('should use metrics table for all operations', async () => {
      // Setup mocks for each operation type
      mockQueryBuilder.returning.mockResolvedValue([createMockMetric()]);
      mockQueryBuilder.first.mockResolvedValue(createMockMetric());
      mockQueryBuilder.del.mockResolvedValue(0);

      // create
      await metricModel.create(createMockMetric());
      expect(mockDb).toHaveBeenLastCalledWith('metrics');

      // findById
      await metricModel.findById('123');
      expect(mockDb).toHaveBeenLastCalledWith('metrics');

      // findByService - orderBy is terminal
      mockQueryBuilder.orderBy.mockResolvedValueOnce([]);
      await metricModel.findByService('service');
      expect(mockDb).toHaveBeenLastCalledWith('metrics');

      // findByName - need orderBy to return builder, limit is terminal
      mockQueryBuilder.orderBy.mockReturnValueOnce(mockQueryBuilder);
      mockQueryBuilder.limit.mockResolvedValueOnce([]);
      await metricModel.findByName('metric');
      expect(mockDb).toHaveBeenLastCalledWith('metrics');

      // deleteOlderThan
      await metricModel.deleteOlderThan(new Date());
      expect(mockDb).toHaveBeenLastCalledWith('metrics');
    });
  });

  describe('edge cases', () => {
    it('should handle metric with minimal required fields', async () => {
      const minimalMetric: IMetric = {
        name: 'minimal',
        value: 1,
        service: 'minimal-service',
        timestamp: new Date(),
      };

      mockQueryBuilder.returning.mockResolvedValue([minimalMetric]);

      const result = await metricModel.create(minimalMetric);

      expect(result.name).toBe('minimal');
      expect(result.unit).toBeUndefined();
      expect(result.tags).toBeUndefined();
    });

    it('should handle empty tags object', async () => {
      const metricData: IMetric = {
        name: 'no_tags',
        value: 50,
        service: 'test',
        tags: {},
        timestamp: new Date(),
      };

      mockQueryBuilder.returning.mockResolvedValue([metricData]);

      const result = await metricModel.create(metricData);

      expect(result.tags).toEqual({});
    });

    it('should handle floating point precision', async () => {
      const metricData: IMetric = {
        name: 'precise_metric',
        value: 0.1 + 0.2, // JavaScript floating point quirk
        service: 'test',
        timestamp: new Date(),
      };

      mockQueryBuilder.returning.mockResolvedValue([metricData]);

      const result = await metricModel.create(metricData);

      expect(result.value).toBeCloseTo(0.3, 10);
    });
  });
});
