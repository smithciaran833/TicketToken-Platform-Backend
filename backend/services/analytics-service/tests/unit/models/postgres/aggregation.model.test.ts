/**
 * Aggregation Model Unit Tests
 */

const mockFirst = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockInsert = jest.fn().mockReturnThis();
const mockOnConflict = jest.fn().mockReturnThis();
const mockMerge = jest.fn().mockReturnThis();
const mockReturning = jest.fn();
const mockDelete = jest.fn();
const mockOrderBy = jest.fn().mockReturnThis();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
  insert: mockInsert,
  onConflict: mockOnConflict,
  merge: mockMerge,
  returning: mockReturning,
  delete: mockDelete,
  orderBy: mockOrderBy,
}));

jest.mock('../../../../src/config/database', () => ({
  getDb: () => mockDb,
}));

import { AggregationModel, Aggregation } from '../../../../src/models/postgres/aggregation.model';

describe('AggregationModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnThis();
    mockInsert.mockReturnThis();
    mockOnConflict.mockReturnThis();
    mockMerge.mockReturnThis();
    mockOrderBy.mockReturnThis();
  });

  describe('create', () => {
    it('should create aggregation and return it', async () => {
      const aggregationData = {
        tenant_id: 'tenant-1',
        aggregation_type: 'sum',
        metric_type: 'revenue',
        entity_type: 'venue',
        dimensions: {},
        time_period: 'daily',
        period_start: new Date('2024-01-01'),
        period_end: new Date('2024-01-02'),
        value: 1000,
        unit: 'USD',
        sample_count: 50,
        metadata: {},
      };
      const created = { id: 'agg-1', ...aggregationData };
      mockReturning.mockResolvedValue([created]);

      const result = await AggregationModel.create(aggregationData as any);

      expect(result).toEqual(created);
      expect(mockDb).toHaveBeenCalledWith('analytics_aggregations');
      expect(mockInsert).toHaveBeenCalledWith(aggregationData);
      expect(mockReturning).toHaveBeenCalledWith('*');
    });
  });

  describe('upsert', () => {
    it('should upsert aggregation on conflict', async () => {
      const aggregationData = {
        tenant_id: 'tenant-1',
        aggregation_type: 'sum',
        metric_type: 'revenue',
        entity_type: 'venue',
        entity_id: 'venue-1',
        dimensions: {},
        time_period: 'daily',
        period_start: new Date('2024-01-01'),
        period_end: new Date('2024-01-02'),
        value: 2000,
        unit: 'USD',
        sample_count: 100,
        metadata: {},
      };
      const upserted = { id: 'agg-1', ...aggregationData };
      mockReturning.mockResolvedValue([upserted]);

      const result = await AggregationModel.upsert(aggregationData as any);

      expect(result).toEqual(upserted);
      expect(mockInsert).toHaveBeenCalledWith(aggregationData);
      expect(mockOnConflict).toHaveBeenCalledWith([
        'tenant_id',
        'aggregation_type',
        'metric_type',
        'entity_type',
        'entity_id',
        'time_period',
        'period_start',
      ]);
      expect(mockMerge).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find aggregation by id and tenant', async () => {
      const aggregation = { id: 'agg-1', tenant_id: 'tenant-1', value: 1000 };
      mockFirst.mockResolvedValue(aggregation);

      const result = await AggregationModel.findById('agg-1', 'tenant-1');

      expect(result).toEqual(aggregation);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'agg-1', tenant_id: 'tenant-1' });
    });

    it('should return null if not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await AggregationModel.findById('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('findByPeriod', () => {
    it('should find aggregations by period', async () => {
      const aggregations = [{ id: 'agg-1' }, { id: 'agg-2' }];
      mockOrderBy.mockResolvedValue(aggregations);

      const result = await AggregationModel.findByPeriod(
        'daily',
        new Date('2024-01-01'),
        'tenant-1'
      );

      expect(result).toEqual(aggregations);
      expect(mockWhere).toHaveBeenCalledWith({
        time_period: 'daily',
        period_start: expect.any(Date),
        tenant_id: 'tenant-1',
      });
    });

    it('should filter by metricType', async () => {
      mockOrderBy.mockResolvedValue([]);

      await AggregationModel.findByPeriod('daily', new Date(), 'tenant-1', {
        metricType: 'revenue',
      });

      expect(mockWhere).toHaveBeenCalledWith('metric_type', 'revenue');
    });

    it('should filter by entityType', async () => {
      mockOrderBy.mockResolvedValue([]);

      await AggregationModel.findByPeriod('daily', new Date(), 'tenant-1', {
        entityType: 'event',
      });

      expect(mockWhere).toHaveBeenCalledWith('entity_type', 'event');
    });

    it('should filter by entityId', async () => {
      mockOrderBy.mockResolvedValue([]);

      await AggregationModel.findByPeriod('daily', new Date(), 'tenant-1', {
        entityId: 'event-123',
      });

      expect(mockWhere).toHaveBeenCalledWith('entity_id', 'event-123');
    });
  });

  describe('findByDateRange', () => {
    it('should find aggregations within date range', async () => {
      const aggregations = [{ id: 'agg-1' }];
      mockOrderBy.mockResolvedValue(aggregations);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await AggregationModel.findByDateRange(startDate, endDate, 'tenant-1');

      expect(result).toEqual(aggregations);
      expect(mockWhere).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(mockWhere).toHaveBeenCalledWith('period_start', '>=', startDate);
      expect(mockWhere).toHaveBeenCalledWith('period_end', '<=', endDate);
    });

    it('should filter by metricType', async () => {
      mockOrderBy.mockResolvedValue([]);

      await AggregationModel.findByDateRange(new Date(), new Date(), 'tenant-1', {
        metricType: 'revenue',
      });

      expect(mockWhere).toHaveBeenCalledWith('metric_type', 'revenue');
    });

    it('should filter by timePeriod', async () => {
      mockOrderBy.mockResolvedValue([]);

      await AggregationModel.findByDateRange(new Date(), new Date(), 'tenant-1', {
        timePeriod: 'hourly',
      });

      expect(mockWhere).toHaveBeenCalledWith('time_period', 'hourly');
    });
  });

  describe('delete', () => {
    it('should delete aggregation and return true', async () => {
      mockDelete.mockResolvedValue(1);

      const result = await AggregationModel.delete('agg-1', 'tenant-1');

      expect(result).toBe(true);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'agg-1', tenant_id: 'tenant-1' });
    });

    it('should return false if not found', async () => {
      mockDelete.mockResolvedValue(0);

      const result = await AggregationModel.delete('non-existent', 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('upsertAggregation (legacy)', () => {
    it('should call upsert with transformed data', async () => {
      const legacyData = {
        aggregationType: 'sum',
        metricType: 'revenue',
        entityType: 'venue',
        entityId: 'venue-1',
        timePeriod: 'daily',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-02'),
        value: 1000,
        unit: 'USD',
        sampleCount: 50,
      };
      mockReturning.mockResolvedValue([{ id: 'agg-1' }]);

      await AggregationModel.upsertAggregation('venue-1', legacyData);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'venue-1',
          aggregation_type: 'sum',
          metric_type: 'revenue',
          value: 1000,
        })
      );
    });
  });
});
