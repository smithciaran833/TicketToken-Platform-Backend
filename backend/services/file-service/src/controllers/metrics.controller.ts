import { FastifyRequest, FastifyReply } from 'fastify';
import { metricsService } from '../services/metrics.service';
import { db } from '../config/database';
import { logger } from '../utils/logger';

export class MetricsController {
  /**
   * Get Prometheus metrics
   * GET /metrics
   */
  async getMetrics(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const metrics = await metricsService.getMetrics();
      
      reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(metrics);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get metrics');
      reply.status(500).send({ error: 'Failed to retrieve metrics' });
    }
  }

  /**
   * Get metrics as JSON
   * GET /metrics/json
   */
  async getMetricsJSON(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const metrics = await metricsService.getMetricsJSON();
      reply.send({ metrics });
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get metrics JSON');
      reply.status(500).send({ error: 'Failed to retrieve metrics' });
    }
  }

  /**
   * Get service statistics
   * GET /metrics/stats
   */
  async getStats(_request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get file statistics from database
      const fileStats = await db('files')
        .whereNull('deleted_at')
        .select(
          db.raw('COUNT(*) as total_files'),
          db.raw('SUM(file_size) as total_size'),
          db.raw('COUNT(DISTINCT uploaded_by) as unique_uploaders')
        )
        .first();

      // Get file type distribution
      const fileTypeStats = await db('files')
        .whereNull('deleted_at')
        .select('content_type')
        .count('* as count')
        .groupBy('content_type')
        .orderBy('count', 'desc')
        .limit(10);

      // Get recent upload stats (last 24 hours)
      const recentUploads = await db('files')
        .where('created_at', '>=', db.raw("NOW() - INTERVAL '24 hours'"))
        .count('* as count')
        .first();

      // Get virus scan stats
      const virusScanStats = await db('av_scans')
        .select('scan_result')
        .count('* as count')
        .groupBy('scan_result');

      // Get quarantined files count
      const quarantinedCount = await db('quarantined_files')
        .whereNull('deleted_at')
        .count('* as count')
        .first();

      // Update gauge metrics
      if (fileStats) {
        const stats = fileStats as any;
        const totalFiles = parseInt(String(stats.total_files || 0));
        const totalSize = parseInt(String(stats.total_size || 0));
        metricsService.updateFileStats(totalFiles, totalSize);
      }

      const stats = fileStats as any;
      reply.send({
        files: {
          total: parseInt(String(stats?.total_files || 0)),
          total_size_bytes: parseInt(String(stats?.total_size || 0)),
          total_size_mb: Math.round(parseInt(String(stats?.total_size || 0)) / 1024 / 1024),
          unique_uploaders: parseInt(String(stats?.unique_uploaders || 0)),
          recent_uploads_24h: parseInt(String((recentUploads as any)?.count || 0))
        },
        file_types: fileTypeStats.map((stat: any) => ({
          type: stat.content_type,
          count: parseInt(String(stat.count))
        })),
        virus_scans: virusScanStats.map((stat: any) => ({
          result: stat.scan_result,
          count: parseInt(String(stat.count))
        })),
        quarantined: parseInt(String((quarantinedCount as any)?.count || 0)),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get stats');
      reply.status(500).send({ error: 'Failed to retrieve statistics' });
    }
  }

  /**
   * Get health check with detailed status
   * GET /metrics/health
   */
  async getDetailedHealth(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        components: {
          database: await this.checkDatabase(),
          storage: await this.checkStorage(),
          virusScanner: await this.checkVirusScanner()
        }
      };

      const allHealthy = Object.values(health.components).every(c => c.status === 'healthy');
      health.status = allHealthy ? 'healthy' : 'degraded';

      reply.status(allHealthy ? 200 : 503).send(health);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Health check failed');
      reply.status(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<{ status: string; latency_ms?: number; error?: string }> {
    try {
      const start = Date.now();
      await db.raw('SELECT 1');
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency_ms: latency
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check storage health
   */
  private async checkStorage(): Promise<{ status: string; provider?: string; error?: string }> {
    try {
      const provider = process.env.STORAGE_PROVIDER || 'local';
      
      // Basic check - just verify provider is configured
      return {
        status: 'healthy',
        provider
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check virus scanner health
   */
  private async checkVirusScanner(): Promise<{ status: string; version?: string; error?: string }> {
    try {
      const { virusScanService } = await import('../services/virus-scan.service');
      const health = await virusScanService.getHealth();
      
      return {
        status: health.healthy ? 'healthy' : 'degraded',
        version: health.version,
        error: health.error
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
