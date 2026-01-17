/**
 * Unit Tests for Performance Utilities
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Define typed mocks at module scope BEFORE jest.mock()
const mockDbQuery = jest.fn<(query: string, params?: any[]) => Promise<any>>();

jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Performance Utilities', () => {
  let performanceUtil: typeof import('../../../src/utils/performance.util');
  let logger: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [] });

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    performanceUtil = await import('../../../src/utils/performance.util');
  });

  afterEach(() => {
    jest.resetModules();
  });

  // ===========================================================================
  // createPerformanceIndexes
  // ===========================================================================
  describe('createPerformanceIndexes', () => {
    it('should create all indexes successfully', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await performanceUtil.createPerformanceIndexes();

      // Should have created indexes for 8 tables with multiple indexes each
      expect(mockDbQuery).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Creating performance indexes...');
      expect(logger.info).toHaveBeenCalledWith('Performance indexes created successfully');
    });

    it('should log warning on index creation failure', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('Index exists'));

      await performanceUtil.createPerformanceIndexes();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create index')
      );
    });

    it('should continue creating other indexes after failure', async () => {
      // Fail first, succeed rest
      mockDbQuery
        .mockRejectedValueOnce(new Error('Index exists'))
        .mockResolvedValue({ rows: [] });

      await performanceUtil.createPerformanceIndexes();

      // Should still complete
      expect(logger.info).toHaveBeenCalledWith('Performance indexes created successfully');
    });
  });

  // ===========================================================================
  // analyzeTable
  // ===========================================================================
  describe('analyzeTable', () => {
    it('should analyze table successfully', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await performanceUtil.analyzeTable('venue_verifications');

      expect(mockDbQuery).toHaveBeenCalledWith('ANALYZE venue_verifications');
      expect(logger.info).toHaveBeenCalledWith('Analyzed table: venue_verifications');
    });

    it('should log error on failure', async () => {
      mockDbQuery.mockRejectedValue(new Error('Table not found'));

      await performanceUtil.analyzeTable('nonexistent');

      expect(logger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to analyze table nonexistent:'
      );
    });
  });

  // ===========================================================================
  // getSlowQueries
  // ===========================================================================
  describe('getSlowQueries', () => {
    it('should return slow queries with default limit', async () => {
      const mockQueries = [
        { query: 'SELECT * FROM users', mean_exec_time: 1000 },
        { query: 'SELECT * FROM venues', mean_exec_time: 500 }
      ];
      mockDbQuery.mockResolvedValue({ rows: mockQueries });

      const result = await performanceUtil.getSlowQueries();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('pg_stat_statements'),
        [10]
      );
      expect(result).toEqual(mockQueries);
    });

    it('should accept custom limit', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await performanceUtil.getSlowQueries(5);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.any(String),
        [5]
      );
    });

    it('should return empty array on error', async () => {
      mockDbQuery.mockRejectedValue(new Error('Extension not installed'));

      const result = await performanceUtil.getSlowQueries();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // getConnectionPoolStats
  // ===========================================================================
  describe('getConnectionPoolStats', () => {
    it('should return connection pool stats', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{ total: 10, idle: 5, waiting: 2 }]
      });

      const result = await performanceUtil.getConnectionPoolStats();

      expect(result).toEqual({ total: 10, idle: 5, waiting: 2 });
    });

    it('should return defaults when no rows', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      const result = await performanceUtil.getConnectionPoolStats();

      expect(result).toEqual({ total: 0, idle: 0, waiting: 0 });
    });

    it('should return defaults on error', async () => {
      mockDbQuery.mockRejectedValue(new Error('Connection failed'));

      const result = await performanceUtil.getConnectionPoolStats();

      expect(result).toEqual({ total: 0, idle: 0, waiting: 0 });
    });
  });

  // ===========================================================================
  // vacuumAnalyzeTables
  // ===========================================================================
  describe('vacuumAnalyzeTables', () => {
    it('should vacuum all compliance tables', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await performanceUtil.vacuumAnalyzeTables();

      const expectedTables = [
        'venue_verifications',
        'tax_records',
        'ofac_checks',
        'risk_assessments',
        'compliance_documents',
        'risk_flags',
        'form_1099_records',
        'compliance_batch_jobs'
      ];

      expectedTables.forEach(table => {
        expect(mockDbQuery).toHaveBeenCalledWith(`VACUUM ANALYZE ${table}`);
      });

      expect(logger.info).toHaveBeenCalledWith('VACUUM ANALYZE completed');
    });

    it('should continue on individual table failure', async () => {
      mockDbQuery
        .mockRejectedValueOnce(new Error('Table locked'))
        .mockResolvedValue({ rows: [] });

      await performanceUtil.vacuumAnalyzeTables();

      expect(logger.error).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('VACUUM ANALYZE completed');
    });
  });

  // ===========================================================================
  // getTableSizes
  // ===========================================================================
  describe('getTableSizes', () => {
    it('should return table sizes', async () => {
      const mockSizes = [
        { schemaname: 'public', tablename: 'users', size: '100 MB' },
        { schemaname: 'public', tablename: 'venues', size: '50 MB' }
      ];
      mockDbQuery.mockResolvedValue({ rows: mockSizes });

      const result = await performanceUtil.getTableSizes();

      expect(result).toEqual(mockSizes);
    });

    it('should return empty array on error', async () => {
      mockDbQuery.mockRejectedValue(new Error('Query failed'));

      const result = await performanceUtil.getTableSizes();

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getIndexUsageStats
  // ===========================================================================
  describe('getIndexUsageStats', () => {
    it('should return all index stats without filter', async () => {
      const mockStats = [
        { tablename: 'users', indexname: 'idx_users_email', idx_scan: 1000 }
      ];
      mockDbQuery.mockResolvedValue({ rows: mockStats });

      const result = await performanceUtil.getIndexUsageStats();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('WHERE')
      );
      expect(result).toEqual(mockStats);
    });

    it('should filter by table name when provided', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await performanceUtil.getIndexUsageStats('users');

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE tablename = 'users'")
      );
    });

    it('should return empty array on error', async () => {
      mockDbQuery.mockRejectedValue(new Error('Query failed'));

      const result = await performanceUtil.getIndexUsageStats();

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // prepareQuery
  // ===========================================================================
  describe('prepareQuery', () => {
    it('should log prepared statement info', () => {
      performanceUtil.prepareQuery('get_user', 'SELECT * FROM users WHERE id = $1', 1);

      expect(logger.debug).toHaveBeenCalledWith(
        'Prepared statement: get_user with 1 parameters'
      );
    });

    it('should handle multiple parameters', () => {
      performanceUtil.prepareQuery('search_users', 'SELECT * FROM users WHERE name = $1 AND status = $2', 2);

      expect(logger.debug).toHaveBeenCalledWith(
        'Prepared statement: search_users with 2 parameters'
      );
    });
  });

  // ===========================================================================
  // getCacheStatistics
  // ===========================================================================
  describe('getCacheStatistics', () => {
    it('should return cache statistics', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{ cache_hit_ratio: '0.95', total_size: '500 MB' }]
      });

      const result = await performanceUtil.getCacheStatistics();

      expect(result).toEqual({
        hitRatio: 0.95,
        size: 0,
        evictions: 0
      });
    });

    it('should handle null cache_hit_ratio', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [{ cache_hit_ratio: null }]
      });

      const result = await performanceUtil.getCacheStatistics();

      expect(result.hitRatio).toBe(0);
    });

    it('should return defaults on error', async () => {
      mockDbQuery.mockRejectedValue(new Error('Query failed'));

      const result = await performanceUtil.getCacheStatistics();

      expect(result).toEqual({ hitRatio: 0, size: 0, evictions: 0 });
    });
  });

  // ===========================================================================
  // getLongRunningQueries
  // ===========================================================================
  describe('getLongRunningQueries', () => {
    it('should return long-running queries with default duration', async () => {
      const mockQueries = [
        { pid: 123, duration: '00:05:30', query: 'SELECT *', state: 'active' }
      ];
      mockDbQuery.mockResolvedValue({ rows: mockQueries });

      const result = await performanceUtil.getLongRunningQueries();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('5000 milliseconds'),
        []
      );
      expect(result).toEqual(mockQueries);
    });

    it('should accept custom duration threshold', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await performanceUtil.getLongRunningQueries(10000);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('10000 milliseconds'),
        []
      );
    });

    it('should return empty array on error', async () => {
      mockDbQuery.mockRejectedValue(new Error('Query failed'));

      const result = await performanceUtil.getLongRunningQueries();

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // killQuery
  // ===========================================================================
  describe('killQuery', () => {
    it('should kill query and return true on success', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      const result = await performanceUtil.killQuery(12345);

      expect(mockDbQuery).toHaveBeenCalledWith('SELECT pg_cancel_backend($1)', [12345]);
      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith('Killed query with PID: 12345');
    });

    it('should return false on error', async () => {
      mockDbQuery.mockRejectedValue(new Error('Permission denied'));

      const result = await performanceUtil.killQuery(99999);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
