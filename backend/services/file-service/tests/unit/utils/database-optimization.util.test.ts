/**
 * Unit Tests for Database Optimization Utilities
 * Tests query optimization helpers, batch operations, and database utilities
 */

import {
  createOptimizationIndexes,
  batchQuery,
  bulkInsert,
  bulkUpdate,
  QueryAnalyzer,
  queryAnalyzer,
  getOptimizedPoolConfig,
  vacuumAnalyze,
  getTableStats,
  explainQuery,
} from '../../../src/utils/database-optimization.util';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('utils/database-optimization', () => {
  let mockLogger: any;
  let mockDb: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = require('../../../src/utils/logger').logger;

    // Mock query builder
    mockQueryBuilder = {
      clone: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      toSQL: jest.fn().mockReturnValue({
        sql: 'SELECT * FROM test',
        bindings: [],
      }),
    };

    // Mock database instance
    mockDb = jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue([]),
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue(1),
    });
    mockDb.schema = {
      raw: jest.fn().mockResolvedValue(undefined),
    };
    mockDb.raw = jest.fn().mockResolvedValue({ rows: [] });
    mockDb.transaction = jest.fn((callback) => callback(mockDb));
  });

  describe('createOptimizationIndexes', () => {
    it('should create all optimization indexes successfully', async () => {
      await createOptimizationIndexes(mockDb);

      expect(mockDb.schema.raw).toHaveBeenCalledTimes(4);
      expect(mockLogger.info).toHaveBeenCalledWith('Creating optimization indexes...');
      expect(mockLogger.info).toHaveBeenCalledWith('✅ Optimization indexes created successfully');
    });

    it('should create files table indexes', async () => {
      await createOptimizationIndexes(mockDb);

      const firstCall = mockDb.schema.raw.mock.calls[0][0];
      expect(firstCall).toContain('idx_files_uploaded_by');
      expect(firstCall).toContain('idx_files_content_type');
      expect(firstCall).toContain('idx_files_created_at');
      expect(firstCall).toContain('idx_files_status');
      expect(firstCall).toContain('idx_files_deleted_at');
      expect(firstCall).toContain('idx_files_composite');
    });

    it('should create av_scans table indexes', async () => {
      await createOptimizationIndexes(mockDb);

      const secondCall = mockDb.schema.raw.mock.calls[1][0];
      expect(secondCall).toContain('idx_av_scans_file_id');
      expect(secondCall).toContain('idx_av_scans_result');
      expect(secondCall).toContain('idx_av_scans_scanned_at');
    });

    it('should create quarantined_files table indexes', async () => {
      await createOptimizationIndexes(mockDb);

      const thirdCall = mockDb.schema.raw.mock.calls[2][0];
      expect(thirdCall).toContain('idx_quarantined_file_id');
      expect(thirdCall).toContain('idx_quarantined_at');
      expect(thirdCall).toContain('idx_quarantined_deleted');
    });

    it('should create file_shares table indexes', async () => {
      await createOptimizationIndexes(mockDb);

      const fourthCall = mockDb.schema.raw.mock.calls[3][0];
      expect(fourthCall).toContain('idx_file_shares_file_id');
      expect(fourthCall).toContain('idx_file_shares_shared_with');
    });

    it('should handle errors and log them', async () => {
      const error = new Error('Index creation failed');
      mockDb.schema.raw.mockRejectedValueOnce(error);

      await expect(createOptimizationIndexes(mockDb)).rejects.toThrow('Index creation failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error },
        'Failed to create optimization indexes'
      );
    });

    it('should use IF NOT EXISTS for safe index creation', async () => {
      await createOptimizationIndexes(mockDb);

      mockDb.schema.raw.mock.calls.forEach((call: any) => {
        expect(call[0]).toContain('IF NOT EXISTS');
      });
    });
  });

  describe('batchQuery', () => {
    it('should yield batches of records', async () => {
      const mockRecords = [
        [{ id: 1 }, { id: 2 }],
        [{ id: 3 }, { id: 4 }],
        [],
      ];
      let callCount = 0;

      mockQueryBuilder.clone.mockReturnValue({
        ...mockQueryBuilder,
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
      });

      // Mock the async query results
      const clonedQuery = mockQueryBuilder.clone();
      clonedQuery.limit().offset = jest.fn().mockImplementation(function() {
        return Promise.resolve(mockRecords[callCount++]);
      });

      const batches: any[] = [];
      for await (const batch of batchQuery(mockQueryBuilder, 2)) {
        batches.push(batch);
      }

      expect(batches.length).toBeGreaterThan(0);
    });

    it('should use default batch size of 1000', async () => {
      mockQueryBuilder.clone.mockReturnValue({
        ...mockQueryBuilder,
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      });

      const generator = batchQuery(mockQueryBuilder);
      await generator.next();

      const clonedQuery = mockQueryBuilder.clone();
      expect(clonedQuery.limit).toBeDefined();
    });

    it('should handle custom batch size', async () => {
      mockQueryBuilder.clone.mockReturnValue({
        ...mockQueryBuilder,
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      });

      const generator = batchQuery(mockQueryBuilder, 500);
      await generator.next();

      const clonedQuery = mockQueryBuilder.clone();
      expect(clonedQuery.limit).toBeDefined();
    });

    it('should stop when no more records are returned', async () => {
      mockQueryBuilder.clone.mockReturnValue({
        ...mockQueryBuilder,
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      });

      const batches: any[] = [];
      for await (const batch of batchQuery(mockQueryBuilder, 100)) {
        batches.push(batch);
      }

      expect(batches.length).toBe(0);
    });

    it('should increment offset correctly', async () => {
      const mockResults = [
        [{ id: 1 }, { id: 2 }, { id: 3 }],
        [{ id: 4 }, { id: 5 }, { id: 6 }],
        [],
      ];
      let callIndex = 0;

      const mockOffset = jest.fn().mockImplementation(function() {
        return Promise.resolve(mockResults[callIndex++]);
      });

      mockQueryBuilder.clone.mockReturnValue({
        ...mockQueryBuilder,
        limit: jest.fn().mockReturnThis(),
        offset: mockOffset,
      });

      const batches: any[] = [];
      for await (const batch of batchQuery(mockQueryBuilder, 3)) {
        batches.push(batch);
      }

      // Should have called with offset 0, 3, 6
      expect(mockOffset).toHaveBeenCalled();
    });
  });

  describe('bulkInsert', () => {
    it('should insert records in chunks', async () => {
      const records = Array.from({ length: 1500 }, (_, i) => ({ id: i }));

      const result = await bulkInsert(mockDb, 'test_table', records, 500);

      expect(result).toBe(1500);
      expect(mockDb).toHaveBeenCalledTimes(3); // 1500 / 500 = 3 chunks
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bulk inserted 1500/1500 records into test_table'
      );
    });

    it('should return 0 for empty records array', async () => {
      const result = await bulkInsert(mockDb, 'test_table', []);

      expect(result).toBe(0);
      expect(mockDb).not.toHaveBeenCalled();
    });

    it('should use default chunk size of 500', async () => {
      const records = Array.from({ length: 600 }, (_, i) => ({ id: i }));

      await bulkInsert(mockDb, 'test_table', records);

      expect(mockDb).toHaveBeenCalledTimes(2); // 600 / 500 = 2 chunks
    });

    it('should handle custom chunk size', async () => {
      const records = Array.from({ length: 300 }, (_, i) => ({ id: i }));

      await bulkInsert(mockDb, 'test_table', records, 100);

      expect(mockDb).toHaveBeenCalledTimes(3); // 300 / 100 = 3 chunks
    });

    it('should continue on chunk failure and log error', async () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

      mockDb.mockImplementationOnce(() => ({
        insert: jest.fn().mockRejectedValueOnce(new Error('Chunk 1 failed')),
      }));

      mockDb.mockImplementationOnce(() => ({
        insert: jest.fn().mockResolvedValueOnce([]),
      }));

      const result = await bulkInsert(mockDb, 'test_table', records, 500);

      // Should continue despite first chunk failing
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          offset: 0,
        }),
        'Failed to insert chunk'
      );
      expect(result).toBe(500); // Only second chunk succeeded
    });

    it('should insert exact chunk when records fit perfectly', async () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

      await bulkInsert(mockDb, 'test_table', records, 500);

      expect(mockDb).toHaveBeenCalledTimes(2);
    });

    it('should handle records not divisible by chunk size', async () => {
      const records = Array.from({ length: 550 }, (_, i) => ({ id: i }));

      await bulkInsert(mockDb, 'test_table', records, 500);

      expect(mockDb).toHaveBeenCalledTimes(2); // 500 + 50
    });
  });

  describe('bulkUpdate', () => {
    it('should update records in chunks', async () => {
      const records = Array.from({ length: 300 }, (_, i) => ({
        id: `id-${i}`,
        updates: { name: `Name ${i}` },
      }));

      const result = await bulkUpdate(mockDb, 'test_table', records, 100);

      expect(result).toBe(300);
      expect(mockDb.transaction).toHaveBeenCalledTimes(3); // 300 / 100 = 3 chunks
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Bulk updated 300/300 records in test_table'
      );
    });

    it('should return 0 for empty records array', async () => {
      const result = await bulkUpdate(mockDb, 'test_table', []);

      expect(result).toBe(0);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should use default chunk size of 100', async () => {
      const records = Array.from({ length: 250 }, (_, i) => ({
        id: `id-${i}`,
        updates: { name: `Name ${i}` },
      }));

      await bulkUpdate(mockDb, 'test_table', records);

      expect(mockDb.transaction).toHaveBeenCalledTimes(3); // 250 / 100 = 3 chunks
    });

    it('should use transactions for each chunk', async () => {
      const records = [
        { id: '1', updates: { name: 'Name 1' } },
        { id: '2', updates: { name: 'Name 2' } },
      ];

      await bulkUpdate(mockDb, 'test_table', records, 10);

      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should continue on chunk failure and log error', async () => {
      const records = Array.from({ length: 200 }, (_, i) => ({
        id: `id-${i}`,
        updates: { name: `Name ${i}` },
      }));

      mockDb.transaction
        .mockRejectedValueOnce(new Error('Transaction failed'))
        .mockImplementation((callback: any) => callback(mockDb));

      const result = await bulkUpdate(mockDb, 'test_table', records, 100);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          offset: 0,
        }),
        'Failed to update chunk'
      );
      expect(result).toBe(100); // Only second chunk succeeded
    });

    it('should handle custom chunk size', async () => {
      const records = Array.from({ length: 50 }, (_, i) => ({
        id: `id-${i}`,
        updates: { status: 'active' },
      }));

      await bulkUpdate(mockDb, 'test_table', records, 25);

      expect(mockDb.transaction).toHaveBeenCalledTimes(2); // 50 / 25 = 2 chunks
    });
  });

  describe('QueryAnalyzer', () => {
    let analyzer: QueryAnalyzer;

    beforeEach(() => {
      analyzer = new QueryAnalyzer();
    });

    describe('logQuery', () => {
      it('should log queries and track them', () => {
        analyzer.logQuery('SELECT * FROM users', 500);
        analyzer.logQuery('SELECT * FROM orders', 1200);

        const stats = analyzer.getStats();
        expect(stats.count).toBe(2);
      });

      it('should warn about slow queries', () => {
        analyzer.logQuery('SELECT * FROM huge_table', 2000);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            duration: 2000,
          }),
          expect.stringContaining('Slow query detected')
        );
      });

      it('should not warn about fast queries', () => {
        analyzer.logQuery('SELECT * FROM small_table', 50);

        expect(mockLogger.warn).not.toHaveBeenCalled();
      });

      it('should keep only last 100 queries', () => {
        for (let i = 0; i < 150; i++) {
          analyzer.logQuery(`SELECT * FROM table${i}`, 100);
        }

        const stats = analyzer.getStats();
        expect(stats.count).toBe(100);
      });

      it('should truncate long queries in logs', () => {
        const longQuery = 'SELECT * FROM table WHERE '.repeat(50);
        analyzer.logQuery(longQuery, 1500);

        const slowQueries = analyzer.getSlowQueries();
        expect(slowQueries[0]!.query.length).toBeLessThanOrEqual(200);
      });
    });

    describe('getStats', () => {
      it('should return zero stats for no queries', () => {
        const stats = analyzer.getStats();

        expect(stats).toEqual({
          count: 0,
          avgDuration: 0,
          maxDuration: 0,
          slowQueries: 0,
        });
      });

      it('should calculate average duration correctly', () => {
        analyzer.logQuery('Query 1', 100);
        analyzer.logQuery('Query 2', 200);
        analyzer.logQuery('Query 3', 300);

        const stats = analyzer.getStats();
        expect(stats.avgDuration).toBe(200); // (100 + 200 + 300) / 3
      });

      it('should track max duration', () => {
        analyzer.logQuery('Query 1', 500);
        analyzer.logQuery('Query 2', 2000);
        analyzer.logQuery('Query 3', 800);

        const stats = analyzer.getStats();
        expect(stats.maxDuration).toBe(2000);
      });

      it('should count slow queries correctly', () => {
        analyzer.logQuery('Fast 1', 500);
        analyzer.logQuery('Slow 1', 1500);
        analyzer.logQuery('Fast 2', 300);
        analyzer.logQuery('Slow 2', 2000);

        const stats = analyzer.getStats();
        expect(stats.slowQueries).toBe(2);
      });

      it('should round average duration', () => {
        analyzer.logQuery('Query 1', 100);
        analyzer.logQuery('Query 2', 150);
        analyzer.logQuery('Query 3', 175);

        const stats = analyzer.getStats();
        expect(Number.isInteger(stats.avgDuration)).toBe(true);
      });
    });

    describe('getSlowQueries', () => {
      it('should return slow queries sorted by duration', () => {
        analyzer.logQuery('Slow 1', 1500);
        analyzer.logQuery('Fast', 500);
        analyzer.logQuery('Slow 2', 2000);
        analyzer.logQuery('Slow 3', 1200);

        const slowQueries = analyzer.getSlowQueries();

        expect(slowQueries.length).toBe(3);
        expect(slowQueries[0]!.duration).toBe(2000);
        expect(slowQueries[1]!.duration).toBe(1500);
        expect(slowQueries[2]!.duration).toBe(1200);
      });

      it('should limit results to specified count', () => {
        for (let i = 0; i < 20; i++) {
          analyzer.logQuery(`Query ${i}`, 1100 + i * 10);
        }

        const slowQueries = analyzer.getSlowQueries(5);
        expect(slowQueries.length).toBe(5);
      });

      it('should use default limit of 10', () => {
        for (let i = 0; i < 20; i++) {
          analyzer.logQuery(`Query ${i}`, 1100 + i * 10);
        }

        const slowQueries = analyzer.getSlowQueries();
        expect(slowQueries.length).toBeLessThanOrEqual(10);
      });

      it('should include query, duration, and timestamp', () => {
        analyzer.logQuery('SELECT * FROM test', 1500);

        const slowQueries = analyzer.getSlowQueries();

        expect(slowQueries[0]).toHaveProperty('query');
        expect(slowQueries[0]).toHaveProperty('duration');
        expect(slowQueries[0]).toHaveProperty('timestamp');
        expect(slowQueries[0]!.timestamp).toBeInstanceOf(Date);
      });

      it('should return empty array when no slow queries', () => {
        analyzer.logQuery('Fast query', 50);

        const slowQueries = analyzer.getSlowQueries();
        expect(slowQueries).toEqual([]);
      });
    });
  });

  describe('queryAnalyzer singleton', () => {
    it('should be a QueryAnalyzer instance', () => {
      expect(queryAnalyzer).toBeInstanceOf(QueryAnalyzer);
    });

    it('should be usable directly', () => {
      queryAnalyzer.logQuery('SELECT * FROM test', 100);

      const stats = queryAnalyzer.getStats();
      expect(stats.count).toBeGreaterThan(0);
    });
  });

  describe('getOptimizedPoolConfig', () => {
    it('should return production config when NODE_ENV is production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const config = getOptimizedPoolConfig();

      expect(config.min).toBe(5);
      expect(config.max).toBe(20);
      expect(config.acquireTimeoutMillis).toBe(30000);
      expect(config.idleTimeoutMillis).toBe(30000);
      expect(config.reapIntervalMillis).toBe(1000);
      expect(config.createRetryIntervalMillis).toBe(200);
      expect(config.propagateCreateError).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

    it('should return development config when NODE_ENV is not production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const config = getOptimizedPoolConfig();

      expect(config.min).toBe(2);
      expect(config.max).toBe(10);
      expect(config.acquireTimeoutMillis).toBe(30000);
      expect(config.idleTimeoutMillis).toBe(30000);

      process.env.NODE_ENV = originalEnv;
    });

    it('should use development config when NODE_ENV is undefined', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const config = getOptimizedPoolConfig();

      expect(config.min).toBe(2);
      expect(config.max).toBe(10);

      process.env.NODE_ENV = originalEnv;
    });

    it('should return different configs for production vs development', () => {
      const originalEnv = process.env.NODE_ENV;

      process.env.NODE_ENV = 'production';
      const prodConfig = getOptimizedPoolConfig();

      process.env.NODE_ENV = 'development';
      const devConfig = getOptimizedPoolConfig();

      expect(prodConfig.min).toBeGreaterThan(devConfig.min);
      expect(prodConfig.max).toBeGreaterThan(devConfig.max);
      expect(prodConfig).toHaveProperty('reapIntervalMillis');
      expect(devConfig).not.toHaveProperty('reapIntervalMillis');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('vacuumAnalyze', () => {
    it('should vacuum and analyze specific table', async () => {
      await vacuumAnalyze(mockDb, 'users');

      expect(mockDb.raw).toHaveBeenCalledWith('VACUUM ANALYZE users');
      expect(mockLogger.info).toHaveBeenCalledWith('Vacuumed and analyzed table: users');
    });

    it('should vacuum and analyze entire database when no table specified', async () => {
      await vacuumAnalyze(mockDb);

      expect(mockDb.raw).toHaveBeenCalledWith('VACUUM ANALYZE');
      expect(mockLogger.info).toHaveBeenCalledWith('Vacuumed and analyzed entire database');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Vacuum failed');
      mockDb.raw.mockRejectedValueOnce(error);

      await vacuumAnalyze(mockDb, 'test_table');

      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error },
        'Vacuum analyze failed'
      );
    });

    it('should not throw error on failure', async () => {
      mockDb.raw.mockRejectedValueOnce(new Error('Failed'));

      await expect(vacuumAnalyze(mockDb)).resolves.not.toThrow();
    });
  });

  describe('getTableStats', () => {
    it('should return table statistics', async () => {
      const mockStats = {
        schemaname: 'public',
        tablename: 'users',
        total_size: '1 MB',
        table_size: '800 KB',
        indexes_size: '200 KB',
        row_count: 1000,
      };

      mockDb.raw.mockResolvedValueOnce({ rows: [mockStats] });

      const result = await getTableStats(mockDb, 'users');

      expect(result).toEqual(mockStats);
      expect(mockDb.raw).toHaveBeenCalled();
    });

    it('should return null when table not found', async () => {
      mockDb.raw.mockResolvedValueOnce({ rows: [] });

      const result = await getTableStats(mockDb, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should use parameterized query', async () => {
      mockDb.raw.mockResolvedValueOnce({ rows: [{}] });

      await getTableStats(mockDb, 'test_table');

      expect(mockDb.raw).toHaveBeenCalledWith(
        expect.any(String),
        ['test_table']
      );
    });

    it('should handle errors and log them', async () => {
      const error = new Error('Stats query failed');
      mockDb.raw.mockRejectedValueOnce(error);

      const result = await getTableStats(mockDb, 'test_table');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: error,
          tableName: 'test_table',
        }),
        'Failed to get stats for table'
      );
    });

    it('should query PostgreSQL system tables', async () => {
      mockDb.raw.mockResolvedValueOnce({ rows: [{}] });

      await getTableStats(mockDb, 'users');

      const query = mockDb.raw.mock.calls[0][0];
      expect(query).toContain('pg_stat_user_tables');
      expect(query).toContain('pg_total_relation_size');
      expect(query).toContain('pg_size_pretty');
    });
  });

  describe('explainQuery', () => {
    it('should run EXPLAIN ANALYZE on query', async () => {
      mockDb.raw.mockResolvedValueOnce({
        rows: [
          { 'QUERY PLAN': 'Seq Scan on users' },
          { 'QUERY PLAN': 'Planning Time: 0.1ms' },
        ],
      });

      const result = await explainQuery(mockDb, mockQueryBuilder);

      expect(result).toEqual([
        { 'QUERY PLAN': 'Seq Scan on users' },
        { 'QUERY PLAN': 'Planning Time: 0.1ms' },
      ]);
      expect(mockQueryBuilder.toSQL).toHaveBeenCalled();
      expect(mockDb.raw).toHaveBeenCalledWith(
        'EXPLAIN ANALYZE SELECT * FROM test',
        []
      );
    });

    it('should handle query with bindings', async () => {
      mockQueryBuilder.toSQL.mockReturnValueOnce({
        sql: 'SELECT * FROM users WHERE id = ?',
        bindings: [123],
      });

      mockDb.raw.mockResolvedValueOnce({ rows: [] });

      await explainQuery(mockDb, mockQueryBuilder);

      expect(mockDb.raw).toHaveBeenCalledWith(
        'EXPLAIN ANALYZE SELECT * FROM users WHERE id = ?',
        [123]
      );
    });

    it('should return null on error', async () => {
      const error = new Error('Explain failed');
      mockDb.raw.mockRejectedValueOnce(error);

      const result = await explainQuery(mockDb, mockQueryBuilder);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: error },
        'Explain query failed'
      );
    });

    it('should not throw on error', async () => {
      mockDb.raw.mockRejectedValueOnce(new Error('Failed'));

      await expect(explainQuery(mockDb, mockQueryBuilder)).resolves.not.toThrow();
    });

    it('should convert query builder to SQL', async () => {
      mockDb.raw.mockResolvedValueOnce({ rows: [] });

      await explainQuery(mockDb, mockQueryBuilder);

      expect(mockQueryBuilder.toSQL).toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should support complete optimization workflow', async () => {
      // 1. Create indexes
      await createOptimizationIndexes(mockDb);
      expect(mockDb.schema.raw).toHaveBeenCalled();

      // 2. Insert bulk data
      const records = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      await bulkInsert(mockDb, 'test_table', records);
      expect(mockDb).toHaveBeenCalled();

      // 3. Update bulk data
      const updates = records.map((r) => ({ id: r.id.toString(), updates: { status: 'active' } }));
      await bulkUpdate(mockDb, 'test_table', updates);
      expect(mockDb.transaction).toHaveBeenCalled();

      // 4. Vacuum and analyze
      await vacuumAnalyze(mockDb, 'test_table');
      expect(mockDb.raw).toHaveBeenCalled();

      // 5. Get stats
      mockDb.raw.mockResolvedValueOnce({ rows: [{ row_count: 100 }] });
      const stats = await getTableStats(mockDb, 'test_table');
      expect(stats).toBeDefined();
    });

    it('should handle errors gracefully in bulk operations', async () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

      // First chunk fails
      mockDb.mockImplementationOnce(() => ({
        insert: jest.fn().mockRejectedValueOnce(new Error('DB error')),
      }));

      const result = await bulkInsert(mockDb, 'test_table', records, 500);

      // Should continue with remaining chunks
      expect(mockLogger.error).toHaveBeenCalled();
      expect(result).toBeLessThan(1000);
    });
  });
});
