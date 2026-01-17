/**
 * Metric Model Unit Tests
 */

const mockFirst = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockWhereBetween = jest.fn().mockReturnThis();
const mockInsert = jest.fn().mockReturnThis();
const mockReturning = jest.fn();
const mockDelete = jest.fn();
const mockOrderBy = jest.fn().mockReturnThis();
const mockLimit = jest.fn();
const mockOffset = jest.fn();
const mockSelect = jest.fn().mockReturnThis();
const mockRaw = jest.fn();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  whereBetween: mockWhereBetween,
  first: mockFirst,
  insert: mockInsert,
  returning: mockReturning,
  delete: mockDelete,
  orderBy: mockOrderBy,
  limit: mockLimit,
  offset: mockOffset,
  select: mockSelect,
}));
mockDb.raw = mockRaw;

jest.mock('../../../../src/config/database', () => ({
  getDb: () => mockDb,
}));

import { MetricModel, Metric } from '../../../../src/models/postgres/metric.model';

describe('MetricModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnThis();
    mockWhereBetween.mockReturnThis();
    mockInsert.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockReturnThis();
    mockSelect.mockReturnThis();
  });

  describe('create', () => {
    it('should create metric and return it', async () => {
      const metricData = {
        tenant_id: 'tenant-1',
        metric_type: 'revenue',
        entity_type: 'venue',
        entity_id: 'venue-1',
        dimensions: {},
        value: 1000,
        unit: 'USD',
        metadata: {},
        timestamp: new Date(),
      };
      const created = { id: 'metric-1', ...metricData };
      mockReturning.mockResolvedValue([created]);

      const result = await MetricModel.create(metricData as any);

      expect(result).toEqual(created);
      expect(mockDb).toHaveBeenCalledWith('analytics_metrics');
      expect(mockInsert).toHaveBeenCalledWith(metricData);
    });
  });

  describe('createMetric (legacy)', () => {
    it('should create metric with legacy field names', async () => {
      const legacyData = {
        venueId: 'venue-1',
        metricType: 'sales',
        value: 500,
        unit: 'count',
      };
      mockReturning.mockResolvedValue([{ id: 'metric-1' }]);

      await MetricModel.createMetric(legacyData);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'venue-1',
          metric_type: 'sales',
          value: 500,
          unit: 'count',
        })
      );
    });
  });

  describe('findById', () => {
    it('should find metric by id and tenant', async () => {
      const metric = { id: 'metric-1', tenant_id: 'tenant-1' };
      mockFirst.mockResolvedValue(metric);

      const result = await MetricModel.findById('metric-1', 'tenant-1');

      expect(result).toEqual(metric);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'metric-1', tenant_id: 'tenant-1' });
    });

    it('should return null if not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await MetricModel.findById('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('findByEntity', () => {
    it('should find metrics by entity', async () => {
      const metrics = [{ id: 'metric-1' }, { id: 'metric-2' }];
      // When no pagination, orderBy is terminal
      mockOrderBy.mockResolvedValue(metrics);

      const result = await MetricModel.findByEntity('event', 'event-1', 'tenant-1');

      expect(result).toEqual(metrics);
      expect(mockWhere).toHaveBeenCalledWith({
        entity_type: 'event',
        entity_id: 'event-1',
        tenant_id: 'tenant-1',
      });
      expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    });

    it('should apply pagination', async () => {
      mockOffset.mockResolvedValue([]);

      await MetricModel.findByEntity('event', 'event-1', 'tenant-1', {
        limit: 50,
        offset: 100,
      });

      expect(mockLimit).toHaveBeenCalledWith(50);
      expect(mockOffset).toHaveBeenCalledWith(100);
    });
  });

  describe('findByType', () => {
    it('should find metrics by type', async () => {
      const metrics = [{ id: 'metric-1', metric_type: 'revenue' }];
      // When no options, orderBy is terminal
      mockOrderBy.mockResolvedValue(metrics);

      const result = await MetricModel.findByType('revenue', 'tenant-1');

      expect(result).toEqual(metrics);
      expect(mockWhere).toHaveBeenCalledWith({
        metric_type: 'revenue',
        tenant_id: 'tenant-1',
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      // When date range provided, orderBy returns chainable, then where calls, then limit is terminal
      mockOrderBy.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      await MetricModel.findByType('revenue', 'tenant-1', { startDate, endDate, limit: 100 });

      expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    });

    it('should apply limit', async () => {
      // When only limit, orderBy returns chainable then limit is terminal
      mockOrderBy.mockReturnValue({
        limit: jest.fn().mockResolvedValue([]),
      });

      await MetricModel.findByType('revenue', 'tenant-1', { limit: 100 });

      expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
    });
  });

  describe('getMetrics (legacy)', () => {
    it('should call findByType with date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');
      // getMetrics calls findByType with startDate and endDate
      // Chain: where().orderBy().where().where() - no limit so last where is terminal
      mockOrderBy.mockReturnValue({
        where: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await MetricModel.getMetrics('venue-1', 'revenue', startDate, endDate);

      expect(mockWhere).toHaveBeenCalledWith({
        metric_type: 'revenue',
        tenant_id: 'venue-1',
      });
    });
  });

  describe('aggregateMetrics (legacy)', () => {
    it('should aggregate metrics', async () => {
      const aggregated = {
        sum: 5000,
        avg: 250,
        min: 100,
        max: 500,
        count: 20,
      };
      mockFirst.mockResolvedValue(aggregated);

      const result = await MetricModel.aggregateMetrics(
        'venue-1',
        'revenue',
        'sum',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(result).toEqual(aggregated);
      expect(mockWhere).toHaveBeenCalledWith({
        tenant_id: 'venue-1',
        metric_type: 'revenue',
      });
      expect(mockWhereBetween).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalled();
    });
  });

  describe('bulkInsert (legacy)', () => {
    it('should insert multiple metrics', async () => {
      const metrics = [
        { venueId: 'venue-1', metricType: 'revenue', value: 100 },
        { venueId: 'venue-1', metricType: 'revenue', value: 200 },
      ];
      mockReturning.mockResolvedValue([]);

      await MetricModel.bulkInsert(metrics);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ tenant_id: 'venue-1', metric_type: 'revenue' }),
        ])
      );
    });
  });

  describe('delete', () => {
    it('should delete metric', async () => {
      mockDelete.mockResolvedValue(1);

      const result = await MetricModel.delete('metric-1', 'tenant-1');

      expect(result).toBe(true);
    });
  });

  describe('deleteOld', () => {
    it('should delete old metrics', async () => {
      mockDelete.mockResolvedValue(100);

      const result = await MetricModel.deleteOld(30, 'tenant-1');

      expect(result).toBe(100);
      expect(mockWhere).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(mockWhere).toHaveBeenCalledWith('timestamp', '<', expect.any(Date));
    });
  });
});
