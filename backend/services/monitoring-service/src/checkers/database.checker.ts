import { Pool } from 'pg';
import { logger } from '../logger';

export class DatabaseHealthChecker {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1, // Use minimal pool for health checks
      connectionTimeoutMillis: 5000,
    });
  }

  getName(): string {
    return 'DatabaseHealthChecker';
  }
  
  async check(): Promise<any> {
    const start = Date.now();
    
    try {
      // Test database connection with simple query
      const result = await this.pool.query('SELECT 1 as health_check, NOW() as timestamp');
      const latency = Date.now() - start;

      // Check if query returned expected result
      if (result.rows.length === 0 || result.rows[0].health_check !== 1) {
        return {
          status: 'unhealthy',
          error: 'Invalid health check query result',
          latency,
        };
      }

      // Get connection pool stats
      const poolStats = {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      };

      return {
        status: latency < 1000 ? 'healthy' : 'degraded',
        latency,
        timestamp: result.rows[0].timestamp,
        pool: poolStats,
        message: latency < 1000 ? 'Database responsive' : 'Database slow',
      };
    } catch (error: any) {
      const latency = Date.now() - start;
      logger.error('Database health check failed:', error);

      return {
        status: 'unhealthy',
        error: error.message,
        code: error.code,
        latency,
        message: 'Database connection failed',
      };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
