import { pgPool, redisClient, mongoClient } from '../../utils/database';
import { metricsService } from '../../services/metrics.service';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export class DatabaseMetricsCollector {
  private interval: NodeJS.Timeout | null = null;
  private name = 'DatabaseMetricsCollector';

  getName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.interval = setInterval(async () => {
      await this.collect();
    }, 60000); // Every minute
    
    await this.collect();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async collect(): Promise<void> {
    // PostgreSQL metrics
    if (pgPool) {
      try {
        const poolMetrics = pgPool;
        await metricsService.pushMetrics({
          name: 'postgres_pool_total',
          type: 'gauge',
          service: 'monitoring-service',
          value: poolMetrics.totalCount,
          labels: { database: 'tickettoken_platform' },
        });

        await metricsService.pushMetrics({
          name: 'postgres_pool_idle',
          type: 'gauge',
          service: 'monitoring-service',
          value: poolMetrics.idleCount,
          labels: { database: 'tickettoken_platform' },
        });

        await metricsService.pushMetrics({
          name: 'postgres_pool_waiting',
          type: 'gauge',
          service: 'monitoring-service',
          value: poolMetrics.waitingCount,
          labels: { database: 'tickettoken_platform' },
        });

        // Query database size
        const sizeResult = await pgPool.query(`
          SELECT pg_database_size('tickettoken_platform') as size
        `);
        
        await metricsService.pushMetrics({
          name: 'postgres_database_size_bytes',
          type: 'gauge',
          service: 'monitoring-service',
          value: parseInt(sizeResult.rows[0].size),
          labels: { database: 'tickettoken_platform' },
        });
      } catch (error) {
        logger.debug('PostgreSQL metrics collection failed:', error);
      }
    }

    // Redis metrics
    if (redisClient) {
      try {
        const info = await redisClient.info('stats');
        const lines = info.split('\r\n');
        
        for (const line of lines) {
          if (line.includes('instantaneous_ops_per_sec')) {
            const value = parseInt(line.split(':')[1]);
            await metricsService.pushMetrics({
              name: 'redis_ops_per_second',
              type: 'gauge',
              service: 'monitoring-service',
              value,
              labels: { database: 'redis' },
            });
          }
          if (line.includes('keyspace_hits')) {
            const value = parseInt(line.split(':')[1]);
            await metricsService.pushMetrics({
              name: 'redis_keyspace_hits',
              type: 'counter',
              service: 'monitoring-service',
              value,
              labels: { database: 'redis' },
            });
          }
        }
      } catch (error) {
        logger.debug('Redis metrics collection failed:', error);
      }
    }

    // MongoDB metrics
    if (mongoClient) {
      try {
        const stats = await mongoClient.db().stats();
        await metricsService.pushMetrics({
          name: 'mongodb_database_size_bytes',
          type: 'gauge',
          service: 'monitoring-service',
          value: stats.dataSize,
          labels: { database: 'tickettoken_monitoring' },
        });

        await metricsService.pushMetrics({
          name: 'mongodb_collections_count',
          type: 'gauge',
          service: 'monitoring-service',
          value: stats.collections,
          labels: { database: 'tickettoken_monitoring' },
        });
      } catch (error) {
        logger.debug('MongoDB metrics collection failed:', error);
      }
    }
  }
}
