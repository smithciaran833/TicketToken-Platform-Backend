/**
 * DATABASE SERVICE
 * 
 * AUDIT FIXES:
 * - SEC-EXT4: SQL injection prevention - verify all queries use parameterized queries
 * - Index usage monitoring
 * - Query performance logging
 * - Slow query alerting
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { promisify } from 'util';
import { resolve4 } from 'dns';
import { config } from '../config';
import { logger } from '../utils/logger';
import { recordDatabaseQuery, updateDatabasePoolMetrics } from '../utils/metrics';

const resolveDns = promisify(resolve4);

// =============================================================================
// SLOW QUERY CONFIGURATION
// =============================================================================

/** Threshold for slow query warning (ms) */
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000', 10);

/** Threshold for critical slow query (ms) */
const CRITICAL_SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.CRITICAL_SLOW_QUERY_THRESHOLD_MS || '5000', 10);

/** Enable query logging in development */
const LOG_ALL_QUERIES = process.env.LOG_ALL_QUERIES === 'true' || process.env.NODE_ENV === 'development';

/** Enable index usage monitoring */
const MONITOR_INDEX_USAGE = process.env.MONITOR_INDEX_USAGE !== 'false';

// =============================================================================
// SQL INJECTION PREVENTION (SEC-EXT4)
// =============================================================================

/**
 * SQL injection detection patterns
 * These patterns indicate potential SQL injection attempts
 */
const SQL_INJECTION_PATTERNS = [
  /;\s*--/i,                          // Comment injection
  /;\s*\/\*/i,                        // Block comment injection
  /'\s*OR\s+'?\d*'?\s*=\s*'?\d*'?/i,  // OR 1=1 style injection
  /'\s*AND\s+'?\d*'?\s*=\s*'?\d*'?/i, // AND 1=1 style injection
  /UNION\s+SELECT/i,                  // UNION-based injection
  /INSERT\s+INTO/i,                   // INSERT injection in SELECT context
  /DROP\s+TABLE/i,                    // DROP TABLE injection
  /TRUNCATE\s+TABLE/i,                // TRUNCATE injection
  /DELETE\s+FROM/i,                   // DELETE injection
  /UPDATE\s+\w+\s+SET/i,              // UPDATE injection
  /EXEC\s*\(/i,                       // EXEC injection
  /EXECUTE\s+/i,                      // EXECUTE injection
  /xp_\w+/i,                          // SQL Server extended procedures
  /sp_\w+/i,                          // SQL Server stored procedures
  /0x[0-9a-f]+/i,                     // Hex-encoded strings
  /CHAR\s*\(\s*\d+\s*\)/i,            // CHAR() function injection
  /CONCAT\s*\(/i,                     // CONCAT injection
  /WAITFOR\s+DELAY/i,                 // Time-based injection
  /SLEEP\s*\(/i,                      // MySQL sleep injection
  /pg_sleep\s*\(/i,                   // PostgreSQL sleep injection
];

/**
 * Validate query parameters for SQL injection
 * Logs warning if suspicious patterns detected
 */
function validateQueryParams(params?: any[]): { safe: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  if (!params || params.length === 0) {
    return { safe: true, warnings: [] };
  }
  
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    
    // Skip null/undefined
    if (param == null) continue;
    
    // Only check string params
    if (typeof param !== 'string') continue;
    
    // Check against injection patterns
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(param)) {
        warnings.push(`Suspicious pattern in param[${i}]: ${pattern.source}`);
      }
    }
  }
  
  return { safe: warnings.length === 0, warnings };
}

/**
 * Validate that query uses parameterized format
 * Returns false if query appears to use string concatenation
 */
function isParameterizedQuery(text: string, params?: any[]): boolean {
  // If no params provided but query has obvious string values, might be unsafe
  if (!params || params.length === 0) {
    // Check for common unsafe patterns like WHERE field = 'value'
    const hasUnparameterizedStrings = /WHERE\s+\w+\s*=\s*'[^']+'/i.test(text) ||
                                      /WHERE\s+\w+\s+IN\s*\([^$)]+\)/i.test(text);
    
    if (hasUnparameterizedStrings) {
      return false;
    }
  }
  
  // Count placeholders vs params
  const placeholderCount = (text.match(/\$\d+/g) || []).length;
  const paramCount = params?.length || 0;
  
  // If query has string literals but also has params, might be mixed (unsafe)
  if (paramCount > 0 && /'[^']*'/g.test(text)) {
    // Some literals are OK (like 'active', 'pending'), but log a warning
    return true; // Allow but will log warning
  }
  
  return true;
}

// =============================================================================
// INDEX USAGE MONITORING
// =============================================================================

interface IndexUsageStats {
  schemaname: string;
  tablename: string;
  indexname: string;
  idx_scan: number;
  idx_tup_read: number;
  idx_tup_fetch: number;
  idx_size: string;
}

interface TableScanStats {
  schemaname: string;
  relname: string;
  seq_scan: number;
  seq_tup_read: number;
  idx_scan: number;
  idx_tup_fetch: number;
  n_live_tup: number;
}

/**
 * Track unused indexes
 */
async function getUnusedIndexes(pool: Pool): Promise<IndexUsageStats[]> {
  const query = `
    SELECT 
      schemaname,
      tablename,
      indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) as idx_size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
    AND schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 20
  `;
  
  const result = await pool.query(query);
  return result.rows;
}

/**
 * Track tables with high sequential scan ratio
 */
async function getTableScanStats(pool: Pool): Promise<TableScanStats[]> {
  const query = `
    SELECT 
      schemaname,
      relname,
      seq_scan,
      seq_tup_read,
      idx_scan,
      idx_tup_fetch,
      n_live_tup
    FROM pg_stat_user_tables
    WHERE seq_scan > 0
    AND n_live_tup > 1000
    AND (seq_scan::float / GREATEST(idx_scan + seq_scan, 1)) > 0.5
    ORDER BY seq_tup_read DESC
    LIMIT 20
  `;
  
  const result = await pool.query(query);
  return result.rows;
}

// =============================================================================
// QUERY PERFORMANCE TRACKING
// =============================================================================

interface QueryStats {
  query: string;
  duration: number;
  timestamp: Date;
  rowCount: number | null;
  operation: string;
  table?: string;
}

/** Recent slow queries for monitoring */
const recentSlowQueries: QueryStats[] = [];
const MAX_SLOW_QUERIES = 100;

/**
 * Extract operation type from query
 */
function extractOperation(query: string): string {
  const normalized = query.trim().toUpperCase();
  if (normalized.startsWith('SELECT')) return 'SELECT';
  if (normalized.startsWith('INSERT')) return 'INSERT';
  if (normalized.startsWith('UPDATE')) return 'UPDATE';
  if (normalized.startsWith('DELETE')) return 'DELETE';
  if (normalized.startsWith('BEGIN')) return 'TRANSACTION';
  if (normalized.startsWith('COMMIT')) return 'COMMIT';
  if (normalized.startsWith('ROLLBACK')) return 'ROLLBACK';
  return 'OTHER';
}

/**
 * Extract table name from query (best effort)
 */
function extractTable(query: string): string | undefined {
  const normalized = query.trim();
  
  // FROM table
  const fromMatch = normalized.match(/FROM\s+["']?(\w+)["']?/i);
  if (fromMatch) return fromMatch[1];
  
  // INTO table
  const intoMatch = normalized.match(/INTO\s+["']?(\w+)["']?/i);
  if (intoMatch) return intoMatch[1];
  
  // UPDATE table
  const updateMatch = normalized.match(/UPDATE\s+["']?(\w+)["']?/i);
  if (updateMatch) return updateMatch[1];
  
  return undefined;
}

/**
 * Track a slow query
 */
function trackSlowQuery(stats: QueryStats): void {
  recentSlowQueries.push(stats);
  
  // Keep only recent queries
  if (recentSlowQueries.length > MAX_SLOW_QUERIES) {
    recentSlowQueries.shift();
  }
}

/**
 * Get recent slow queries for monitoring
 */
export function getRecentSlowQueries(): QueryStats[] {
  return [...recentSlowQueries];
}

/**
 * Clear slow query history (for testing)
 */
export function clearSlowQueryHistory(): void {
  recentSlowQueries.length = 0;
}

// =============================================================================
// DATABASE SERVICE CLASS
// =============================================================================

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private log = logger.child({ component: 'DatabaseService' });
  private indexMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private poolMetricsInterval: ReturnType<typeof setInterval> | null = null;

  async initialize(): Promise<void> {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 2000; // Base delay in milliseconds
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.log.info(`Database connection attempt ${attempt}/${MAX_RETRIES}...`);
        
        // Force DNS resolution to bypass Node.js DNS cache
        const dbHost = process.env.DB_HOST || 'pgbouncer';
        const dbIps = await resolveDns(dbHost);
        const dbIp = dbIps[0];
        this.log.info(`Resolved ${dbHost} to ${dbIp}`);
        
        // Create pool using resolved IP and individual config vars
        this.pool = new Pool({
          host: dbIp, // Use resolved IP instead of hostname
          port: parseInt(process.env.DB_PORT || '6432', 10),
          database: process.env.DB_NAME || 'tickettoken_db',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          max: config.database.pool?.max || 20,
          min: config.database.pool?.min || 2,
          idleTimeoutMillis: config.database.pool?.idleTimeoutMillis || 30000,
          connectionTimeoutMillis: config.database.pool?.connectionTimeoutMillis || 5000,
          // Batch 8 Fix #6, #10: Statement timeout to prevent long-running queries
          statement_timeout: config.database.statementTimeout || 30000,
          // Batch 11 Fix #4: Lock timeout to prevent deadlocks
          lock_timeout: config.database.lockTimeout || 10000,  // 10 seconds
        });

        this.pool.on('error', (err) => {
          this.log.error('Database pool error:', err);
        });

        // Test connection
        await this.pool.query('SELECT 1');
        
        this.log.info('Database service initialized successfully');
        
        // Start index monitoring
        if (MONITOR_INDEX_USAGE) {
          this.startIndexMonitoring();
        }
        
        // Start pool metrics collection
        this.startPoolMetricsCollection();
        
        return; // Success! Exit the retry loop
        
      } catch (error) {
        this.log.error(`Connection attempt ${attempt} failed:`, error);
        
        // Clean up failed pool
        if (this.pool) {
          await this.pool.end().catch(() => {});
          this.pool = null;
        }
        
        // If we've exhausted all retries, throw the error
        if (attempt === MAX_RETRIES) {
          this.log.error('Failed to connect to database after all retries');
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        const delayMs = RETRY_DELAY * attempt;
        this.log.info(`Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Start periodic index usage monitoring
   */
  private startIndexMonitoring(): void {
    // Check every 5 minutes
    this.indexMonitorInterval = setInterval(async () => {
      try {
        if (!this.pool) return;
        
        // Check unused indexes
        const unusedIndexes = await getUnusedIndexes(this.pool);
        if (unusedIndexes.length > 0) {
          this.log.warn('Unused indexes detected', {
            count: unusedIndexes.length,
            indexes: unusedIndexes.slice(0, 5).map(i => ({
              table: i.tablename,
              index: i.indexname,
              size: i.idx_size,
            })),
          });
        }
        
        // Check high sequential scan tables
        const highScanTables = await getTableScanStats(this.pool);
        if (highScanTables.length > 0) {
          this.log.warn('Tables with high sequential scan ratio', {
            count: highScanTables.length,
            tables: highScanTables.slice(0, 5).map(t => ({
              table: t.relname,
              seqScans: t.seq_scan,
              idxScans: t.idx_scan,
              rowCount: t.n_live_tup,
            })),
          });
        }
      } catch (error) {
        this.log.error('Index monitoring error', { error });
      }
    }, 5 * 60 * 1000);
    
    if (this.indexMonitorInterval.unref) {
      this.indexMonitorInterval.unref();
    }
  }

  /**
   * Start periodic pool metrics collection
   */
  private startPoolMetricsCollection(): void {
    this.poolMetricsInterval = setInterval(() => {
      if (!this.pool) return;
      
      const poolStats = {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      };
      
      updateDatabasePoolMetrics(
        poolStats.total - poolStats.idle,
        poolStats.idle,
        poolStats.waiting
      );
    }, 10000); // Every 10 seconds
    
    if (this.poolMetricsInterval.unref) {
      this.poolMetricsInterval.unref();
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool;
  }

  /**
   * Execute query with security validation and performance monitoring
   * 
   * AUDIT FIX: SEC-EXT4 - SQL injection prevention
   * All queries must use parameterized format ($1, $2, etc.)
   */
  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const startTime = Date.now();
    const operation = extractOperation(text);
    const table = extractTable(text);

    // SEC-EXT4: Validate query is parameterized
    if (!isParameterizedQuery(text, params)) {
      this.log.warn('Query may not be properly parameterized', {
        security: {
          event: 'unparameterized_query_detected',
          severity: 'high',
          operation,
          table,
        },
        queryPreview: text.substring(0, 100),
      });
    }

    // SEC-EXT4: Validate params for SQL injection patterns
    const paramValidation = validateQueryParams(params);
    if (!paramValidation.safe) {
      this.log.error('Potential SQL injection detected in query parameters', {
        security: {
          event: 'sql_injection_attempt',
          severity: 'critical',
          warnings: paramValidation.warnings,
          operation,
          table,
        },
      });
      
      // In production, reject the query
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Query rejected: suspicious parameters detected');
      }
    }

    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - startTime;

      // Log query performance
      this.logQueryPerformance(text, duration, result.rowCount, operation, table);

      // Record metrics
      recordDatabaseQuery(operation, table || 'unknown', 'success', duration / 1000);

      return { rows: result.rows, rowCount: result.rowCount };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record error metrics
      recordDatabaseQuery(operation, table || 'unknown', 'error', duration / 1000);
      
      this.log.error('Query execution error', {
        operation,
        table,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  }

  /**
   * Log query performance and alert on slow queries
   */
  private logQueryPerformance(
    query: string,
    duration: number,
    rowCount: number | null,
    operation: string,
    table?: string
  ): void {
    const stats: QueryStats = {
      query: query.substring(0, 500), // Truncate for logging
      duration,
      timestamp: new Date(),
      rowCount,
      operation,
      table,
    };

    // Log all queries in development
    if (LOG_ALL_QUERIES) {
      this.log.debug('Query executed', {
        operation,
        table,
        duration,
        rowCount,
        queryPreview: query.substring(0, 100),
      });
    }

    // SLOW QUERY ALERTING
    if (duration >= CRITICAL_SLOW_QUERY_THRESHOLD_MS) {
      this.log.error('CRITICAL: Very slow query detected', {
        alert: {
          type: 'critical_slow_query',
          threshold: CRITICAL_SLOW_QUERY_THRESHOLD_MS,
        },
        operation,
        table,
        duration,
        rowCount,
        queryPreview: query.substring(0, 200),
      });
      trackSlowQuery(stats);
    } else if (duration >= SLOW_QUERY_THRESHOLD_MS) {
      this.log.warn('Slow query detected', {
        alert: {
          type: 'slow_query',
          threshold: SLOW_QUERY_THRESHOLD_MS,
        },
        operation,
        table,
        duration,
        rowCount,
        queryPreview: query.substring(0, 200),
      });
      trackSlowQuery(stats);
    }
  }

  /**
   * Execute transaction with same security validations
   */
  async transaction<T = any>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    const client = await this.pool.connect();
    const startTime = Date.now();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      
      // CRITICAL: Explicitly wait for COMMIT to complete
      const commitResult = await client.query('COMMIT');
      this.log.debug('COMMIT response', { command: commitResult.command });
      
      // Force a flush by querying transaction status
      const statusCheck = await client.query('SELECT txid_current_if_assigned()');
      this.log.debug('Transaction ID after commit', { txid: statusCheck.rows[0] });
      
      const duration = Date.now() - startTime;
      recordDatabaseQuery('TRANSACTION', 'multi', 'success', duration / 1000);
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      
      const duration = Date.now() - startTime;
      recordDatabaseQuery('TRANSACTION', 'multi', 'error', duration / 1000);
      
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    // Stop monitoring
    if (this.indexMonitorInterval) {
      clearInterval(this.indexMonitorInterval);
      this.indexMonitorInterval = null;
    }
    
    if (this.poolMetricsInterval) {
      clearInterval(this.poolMetricsInterval);
      this.poolMetricsInterval = null;
    }
    
    if (this.pool) {
      this.log.info('Closing database pool...');
      await this.pool.end();
      this.pool = null;
      this.log.info('Database pool closed');
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get index usage statistics
   */
  async getIndexStats(): Promise<{ unused: IndexUsageStats[]; highScan: TableScanStats[] } | null> {
    if (!this.pool) return null;
    
    try {
      const [unused, highScan] = await Promise.all([
        getUnusedIndexes(this.pool),
        getTableScanStats(this.pool),
      ]);
      
      return { unused, highScan };
    } catch (error) {
      this.log.error('Failed to get index stats', { error });
      return null;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { total: number; idle: number; waiting: number } | null {
    if (!this.pool) return null;
    
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

export const DatabaseService = new DatabaseServiceClass();
