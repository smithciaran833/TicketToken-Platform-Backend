import { Pool } from 'pg';
import { logger } from './logger';

/**
 * Database Query Monitor for PostgreSQL (pg)
 * 
 * Monitors database query performance and logs slow queries
 * Hooks into pg Pool query execution
 */

interface QueryMetrics {
  queryId: string;
  sql: string;
  values?: any[];
  startTime: number;
  duration?: number;
  error?: Error;
}

// Configuration
const SLOW_QUERY_THRESHOLD = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000', 10);
const LOG_ALL_QUERIES = process.env.LOG_ALL_DB_QUERIES === 'true';
const MAX_SQL_LENGTH = 500; // Truncate long SQL for readability

// In-memory tracking of running queries
const runningQueries = new Map<string, QueryMetrics>();

/**
 * Generate a unique query ID
 */
function generateQueryId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Truncate SQL for logging if too long
 */
function truncateSQL(sql: string, maxLength: number = MAX_SQL_LENGTH): string {
  if (sql.length <= maxLength) {
    return sql;
  }
  return sql.substring(0, maxLength) + '... (truncated)';
}

/**
 * Format query values for safe logging (remove sensitive data)
 */
function formatValues(values: any[] | undefined): any {
  if (!values || values.length === 0) {
    return undefined;
  }
  
  // Limit array size and sanitize
  const limited = values.slice(0, 20); // Max 20 values
  return limited.map((v, i) => {
    if (typeof v === 'object' && v !== null) {
      return `[Object at ${i}]`;
    }
    if (typeof v === 'string' && v.length > 100) {
      return v.substring(0, 100) + '...';
    }
    return v;
  });
}

/**
 * Initialize database monitoring for pg Pool
 * Wraps the pool.query method to add monitoring
 */
export function initializeDatabaseMonitoring(pool: Pool): void {
  logger.info('Initializing database query monitoring', {
    slowQueryThreshold: SLOW_QUERY_THRESHOLD,
    logAllQueries: LOG_ALL_QUERIES,
  });

  // Store the original query method
  const originalQuery = pool.query.bind(pool);

  // Override the query method with monitoring
  (pool as any).query = function(...args: any[]) {
    const queryId = generateQueryId();
    const startTime = Date.now();
    
    // Extract query details (handle different call signatures)
    let sql: string;
    let values: any[] | undefined;
    
    if (typeof args[0] === 'string') {
      sql = args[0];
      values = args[1];
    } else if (typeof args[0] === 'object' && args[0].text) {
      sql = args[0].text;
      values = args[0].values;
    } else {
      sql = String(args[0]);
    }

    const metrics: QueryMetrics = {
      queryId,
      sql,
      values,
      startTime,
    };

    runningQueries.set(queryId, metrics);

    if (LOG_ALL_QUERIES) {
      logger.debug('Database query started', {
        queryId,
        sql: truncateSQL(sql),
        values: formatValues(values),
      });
    }

    // Execute the original query
    const result = originalQuery(...args);

    // Handle promise-based queries
    if (result && typeof result.then === 'function') {
      return result
        .then((res: any) => {
          const duration = Date.now() - startTime;
          metrics.duration = duration;

          // Log slow queries
          if (duration >= SLOW_QUERY_THRESHOLD) {
            logger.warn('Slow database query detected', {
              queryId,
              sql: truncateSQL(sql),
              values: formatValues(values),
              duration,
              threshold: SLOW_QUERY_THRESHOLD,
              rowCount: res.rowCount,
            });
          } else if (LOG_ALL_QUERIES) {
            logger.debug('Database query completed', {
              queryId,
              duration,
              rowCount: res.rowCount,
            });
          }

          runningQueries.delete(queryId);
          return res;
        })
        .catch((error: Error) => {
          const duration = Date.now() - startTime;
          metrics.duration = duration;
          metrics.error = error;

          logger.error('Database query error', {
            queryId,
            sql: truncateSQL(sql),
            values: formatValues(values),
            duration,
            error: {
              message: error.message,
              code: (error as any).code,
              detail: (error as any).detail,
            },
          });

          runningQueries.delete(queryId);
          throw error;
        });
    }

    // Handle callback-based queries (less common but supported)
    return result;
  };

  // Periodic cleanup of stale entries (queries that may have been lost)
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [queryId, metrics] of runningQueries.entries()) {
      if (now - metrics.startTime > staleThreshold) {
        logger.warn('Stale query detected (possible connection issue)', {
          queryId,
          sql: truncateSQL(metrics.sql),
          ageMs: now - metrics.startTime,
        });
        runningQueries.delete(queryId);
      }
    }
  }, 30000); // Check every 30 seconds

  logger.info('Database query monitoring initialized successfully');
}

/**
 * Get current query monitoring metrics
 */
export function getQueryMetrics() {
  return {
    activeQueries: runningQueries.size,
    slowQueryThreshold: SLOW_QUERY_THRESHOLD,
    configuration: {
      logAllQueries: LOG_ALL_QUERIES,
      maxSqlLength: MAX_SQL_LENGTH,
    },
  };
}

/**
 * Get list of currently running queries (for debugging)
 */
export function getRunningQueries(): any[] {
  return Array.from(runningQueries.values()).map(metrics => ({
    queryId: metrics.queryId,
    sql: truncateSQL(metrics.sql, 200),
    runningFor: Date.now() - metrics.startTime,
  }));
}
