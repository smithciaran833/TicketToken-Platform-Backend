import { Knex } from 'knex';
import { logger } from './logger';

/**
 * Database Query Optimization Utilities
 * Provides helpers for optimizing database queries
 */

/**
 * Add indexes to improve query performance
 */
export async function createOptimizationIndexes(db: Knex): Promise<void> {
  try {
    logger.info('Creating optimization indexes...');

    // Files table indexes
    await db.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
      CREATE INDEX IF NOT EXISTS idx_files_content_type ON files(content_type);
      CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_files_status ON files(status) WHERE status IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_files_composite ON files(uploaded_by, created_at DESC) WHERE deleted_at IS NULL;
    `);

    // AV scans indexes
    await db.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_av_scans_file_id ON av_scans(file_id);
      CREATE INDEX IF NOT EXISTS idx_av_scans_result ON av_scans(scan_result);
      CREATE INDEX IF NOT EXISTS idx_av_scans_scanned_at ON av_scans(scanned_at DESC);
    `);

    // Quarantined files indexes
    await db.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_quarantined_file_id ON quarantined_files(file_id);
      CREATE INDEX IF NOT EXISTS idx_quarantined_at ON quarantined_files(quarantined_at DESC);
      CREATE INDEX IF NOT EXISTS idx_quarantined_deleted ON quarantined_files(deleted_at) WHERE deleted_at IS NULL;
    `);

    // File shares indexes (if table exists)
    await db.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_file_shares_file_id ON file_shares(file_id);
      CREATE INDEX IF NOT EXISTS idx_file_shares_shared_with ON file_shares(shared_with_user_id);
    `);

    logger.info('✅ Optimization indexes created successfully');
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to create optimization indexes');
    throw error;
  }
}

/**
 * Batch query helper - fetches records in batches to avoid memory issues
 */
export async function* batchQuery<T>(
  query: Knex.QueryBuilder,
  batchSize: number = 1000
): AsyncGenerator<T[], void, unknown> {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await query
      .clone()
      .limit(batchSize)
      .offset(offset) as T[];

    if (batch.length === 0) {
      hasMore = false;
    } else {
      yield batch;
      offset += batchSize;
      
      if (batch.length < batchSize) {
        hasMore = false;
      }
    }
  }
}

/**
 * Bulk insert with conflict handling
 */
export async function bulkInsert(
  db: Knex,
  tableName: string,
  records: any[],
  chunkSize: number = 500
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  let insertedCount = 0;

  // Split into chunks to avoid exceeding parameter limits
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    
    try {
      await db(tableName).insert(chunk);
      insertedCount += chunk.length;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), offset: i }, 'Failed to insert chunk');
      // Continue with next chunk
    }
  }

  logger.info(`Bulk inserted ${insertedCount}/${records.length} records into ${tableName}`);
  return insertedCount;
}

/**
 * Bulk update records
 */
export async function bulkUpdate(
  db: Knex,
  tableName: string,
  records: Array<{ id: string; updates: any }>,
  chunkSize: number = 100
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  let updatedCount = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    
    try {
      // Use transaction for chunk
      await db.transaction(async (trx) => {
        for (const record of chunk) {
          await trx(tableName)
            .where({ id: record.id })
            .update(record.updates);
        }
      });
      
      updatedCount += chunk.length;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), offset: i }, 'Failed to update chunk');
    }
  }

  logger.info(`Bulk updated ${updatedCount}/${records.length} records in ${tableName}`);
  return updatedCount;
}

/**
 * Query performance analyzer
 */
export class QueryAnalyzer {
  private queries: Array<{ query: string; duration: number; timestamp: Date }> = [];
  private slowQueryThreshold: number = 1000; // 1 second

  logQuery(query: string, duration: number) {
    const entry = {
      query,
      duration,
      timestamp: new Date()
    };

    this.queries.push(entry);

    // Keep only last 100 queries
    if (this.queries.length > 100) {
      this.queries.shift();
    }

    // Log slow queries
    if (duration > this.slowQueryThreshold) {
      logger.warn({
        query: query.substring(0, 200),
        duration
      }, `Slow query detected (${duration}ms)`);
    }
  }

  getStats() {
    if (this.queries.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        maxDuration: 0,
        slowQueries: 0
      };
    }

    const durations = this.queries.map(q => q.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const slowQueries = this.queries.filter(q => q.duration > this.slowQueryThreshold).length;

    return {
      count: this.queries.length,
      avgDuration: Math.round(avgDuration),
      maxDuration,
      slowQueries
    };
  }

  getSlowQueries(limit: number = 10) {
    return this.queries
      .filter(q => q.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
      .map(q => ({
        query: q.query.substring(0, 200),
        duration: q.duration,
        timestamp: q.timestamp
      }));
  }
}

// Export singleton
export const queryAnalyzer = new QueryAnalyzer();

/**
 * Database connection pool configuration
 */
export function getOptimizedPoolConfig() {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return {
      min: 5,
      max: 20,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false
    };
  } else {
    return {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000
    };
  }
}

/**
 * Vacuum and analyze database (PostgreSQL specific)
 */
export async function vacuumAnalyze(db: Knex, tableName?: string): Promise<void> {
  try {
    if (tableName) {
      await db.raw(`VACUUM ANALYZE ${tableName}`);
      logger.info(`Vacuumed and analyzed table: ${tableName}`);
    } else {
      await db.raw('VACUUM ANALYZE');
      logger.info('Vacuumed and analyzed entire database');
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Vacuum analyze failed');
  }
}

/**
 * Get table statistics
 */
export async function getTableStats(db: Knex, tableName: string) {
  try {
    const stats = await db.raw(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size,
        n_live_tup AS row_count
      FROM pg_stat_user_tables
      WHERE tablename = ?
    `, [tableName]);

    return stats.rows[0] || null;
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)), tableName }, 'Failed to get stats for table');
    return null;
  }
}

/**
 * Explain query (for debugging)
 */
export async function explainQuery(db: Knex, query: Knex.QueryBuilder) {
  try {
    const sql = query.toSQL();
    const result = await db.raw(`EXPLAIN ANALYZE ${sql.sql}`, sql.bindings);
    return result.rows;
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Explain query failed');
    return null;
  }
}
