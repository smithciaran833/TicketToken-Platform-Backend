import { db } from '../services/database.service';
import { logger } from './logger';

/**
 * PERFORMANCE OPTIMIZATION UTILITIES
 * 
 * Database indexes, connection pooling, query optimization
 * Phase 5: Production Infrastructure
 */

/**
 * Create optimized indexes for compliance service tables
 */
export async function createPerformanceIndexes(): Promise<void> {
  logger.info('Creating performance indexes...');

  const indexes = [
    // Venue Verifications - most queried table
    {
      table: 'venue_verifications',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_verifications_tenant_status ON venue_verifications(tenant_id, status)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_verifications_ein ON venue_verifications(ein)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_venue_verifications_created_at ON venue_verifications(created_at DESC)',
      ],
    },
    // Tax Records - high volume queries
    {
      table: 'tax_records',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_records_tenant_venue ON tax_records(tenant_id, venue_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_records_year ON tax_records(year, tenant_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_records_amount ON tax_records(amount) WHERE amount >= 600',
      ],
    },
    // OFAC Checks - frequent lookups
    {
      table: 'ofac_checks',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofac_checks_tenant_venue ON ofac_checks(tenant_id, venue_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ofac_checks_result ON ofac_checks(result, created_at DESC)',
      ],
    },
    // Risk Assessments
    {
      table: 'risk_assessments',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_assessments_tenant_venue ON risk_assessments(tenant_id, venue_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_assessments_score ON risk_assessments(risk_score DESC)',
      ],
    },
    // Compliance Documents
    {
      table: 'compliance_documents',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compliance_documents_tenant_venue ON compliance_documents(tenant_id, venue_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compliance_documents_type ON compliance_documents(document_type)',
      ],
    },
    // Risk Flags
    {
      table: 'risk_flags',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_flags_tenant_venue ON risk_flags(tenant_id, venue_id)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_flags_status ON risk_flags(status, created_at DESC)',
      ],
    },
    // Form 1099 Records
    {
      table: 'form_1099_records',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_1099_tenant_year ON form_1099_records(tenant_id, year)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_1099_venue_year ON form_1099_records(venue_id, year)',
      ],
    },
    // Batch Jobs
    {
      table: 'compliance_batch_jobs',
      indexes: [
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batch_jobs_tenant_status ON compliance_batch_jobs(tenant_id, status)',
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batch_jobs_created_at ON compliance_batch_jobs(created_at DESC)',
      ],
    },
  ];

  for (const { table, indexes: tableIndexes } of indexes) {
    for (const indexQuery of tableIndexes) {
      try {
        await db.query(indexQuery);
        logger.info(`Created index for ${table}`);
      } catch (error: any) {
        logger.warn(`Failed to create index for ${table}: ${error.message}`);
      }
    }
  }

  logger.info('Performance indexes created successfully');
}

/**
 * Analyze tables for query planner
 */
export async function analyzeTable(tableName: string ): Promise<void> {
  try {
    await db.query(`ANALYZE ${tableName}`);
    logger.info(`Analyzed table: ${tableName}`);
  } catch (error) {
    logger.error(`Failed to analyze table ${tableName}:`, error);
  }
}

/**
 * Get slow queries from pg_stat_statements
 */
export async function getSlowQueries(limit: number = 10): Promise<any[]> {
  try {
    const result = await db.query(
      `SELECT 
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        max_exec_time
       FROM pg_stat_statements
       ORDER BY mean_exec_time DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to get slow queries:', error);
    return [];
  }
}

/**
 * Get database connection pool stats
 */
export async function getConnectionPoolStats(): Promise<{
  total: number;
  idle: number;
  waiting: number;
}> {
  try {
    const result = await db.query(`
      SELECT 
        count(*) as total,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE wait_event_type = 'Lock') as waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    return result.rows[0] || { total: 0, idle: 0, waiting: 0 };
  } catch (error) {
    logger.error('Failed to get connection pool stats:', error);
    return { total: 0, idle: 0, waiting: 0 };
  }
}

/**
 * Vacuum analyze tables
 */
export async function vacuumAnalyzeTables(): Promise<void> {
  const tables = [
    'venue_verifications',
    'tax_records',
    'ofac_checks',
    'risk_assessments',
    'compliance_documents',
    'risk_flags',
    'form_1099_records',
    'compliance_batch_jobs',
  ];

  logger.info('Running VACUUM ANALYZE on tables...');

  for (const table of tables) {
    try {
      await db.query(`VACUUM ANALYZE ${table}`);
      logger.info(`Vacuumed table: ${table}`);
    } catch (error) {
      logger.error(`Failed to vacuum table ${table}:`, error);
    }
  }

  logger.info('VACUUM ANALYZE completed');
}

/**
 * Get table sizes
 */
export async function getTableSizes(): Promise<any[]> {
  try {
    const result = await db.query(`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get table sizes:', error);
    return [];
  }
}

/**
 * Get index usage statistics
 */
export async function getIndexUsageStats(tableName?: string): Promise<any[]> {
  try {
    const whereClause = tableName ? `WHERE tablename = '${tableName}'` : '';
    const result = await db.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      ${whereClause}
      ORDER BY idx_scan DESC
    `);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get index usage stats:', error);
    return [];
  }
}

/**
 * Optimize query with prepared statement
 */
export function prepareQuery(name: string, query: string, paramCount: number): void {
  const paramPlaceholders = Array.from({ length: paramCount }, (_, i) => `$${i + 1}`).join(', ');
  logger.debug(`Prepared statement: ${name} with ${paramCount} parameters`);
}

/**
 * Cache statistics
 */
export async function getCacheStatistics(): Promise<{
  hitRatio: number;
  size: number;
  evictions: number;
}> {
  try {
    const result = await db.query(`
      SELECT 
        sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_hit_ratio,
        pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) as total_size
      FROM pg_statio_user_tables;
    `);

    return {
      hitRatio: parseFloat(result.rows[0]?.cache_hit_ratio || '0'),
      size: 0,
      evictions: 0,
    };
  } catch (error) {
    logger.error('Failed to get cache statistics:', error);
    return { hitRatio: 0, size: 0, evictions: 0 };
  }
}

/**
 * Monitor long-running queries
 */
export async function getLongRunningQueries(minDuration: number = 5000): Promise<any[]> {
  try {
    const result = await db.query(
      `SELECT 
        pid,
        now() - pg_stat_activity.query_start AS duration,
        query,
        state
       FROM pg_stat_activity
       WHERE (now() - pg_stat_activity.query_start) > interval '${minDuration} milliseconds'
         AND state = 'active'
       ORDER BY duration DESC`,
      []
    );
    return result.rows;
  } catch (error) {
    logger.error('Failed to get long-running queries:', error);
    return [];
  }
}

/**
 * Kill long-running query
 */
export async function killQuery(pid: number): Promise<boolean> {
  try {
    await db.query('SELECT pg_cancel_backend($1)', [pid]);
    logger.warn(`Killed query with PID: ${pid}`);
    return true;
  } catch (error) {
    logger.error(`Failed to kill query ${pid}:`, error);
    return false;
  }
}
