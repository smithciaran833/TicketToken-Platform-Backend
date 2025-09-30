import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { MonitoringService } from '../services/monitoring.service';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';

export class MetricsController {
  private monitoringService: MonitoringService;
  
  constructor() {
    this.monitoringService = MonitoringService.getInstance();
  }
  
  // Prometheus metrics endpoint
  async getPrometheusMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.monitoringService.getPrometheusMetrics();
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      logger.error('Failed to get Prometheus metrics:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }
  
  // JSON metrics summary
  async getMetricsSummary(req: Request, res: Response): Promise<void> {
    try {
      const summary = await this.monitoringService.getMetricsSummary();
      res.json(summary);
    } catch (error) {
      logger.error('Failed to get metrics summary:', error);
      res.status(500).json({ error: 'Failed to get metrics summary' });
    }
  }
  
  // Get queue throughput
  async getThroughput(req: Request, res: Response): Promise<void> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT 
           queue_name,
           DATE_TRUNC('minute', captured_at) as minute,
           MAX(completed_count) - MIN(completed_count) as jobs_per_minute
         FROM queue_metrics
         WHERE captured_at > NOW() - INTERVAL '1 hour'
         GROUP BY queue_name, minute
         ORDER BY minute DESC`
      );
      
      res.json({
        throughput: result.rows,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to get throughput:', error);
      res.status(500).json({ error: 'Failed to get throughput' });
    }
  }
  
  // Get failure analysis
  async getFailureAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const pool = getPool();
      
      // Get failure trends
      const failures = await pool.query(
        `SELECT 
           queue_name,
           DATE_TRUNC('hour', captured_at) as hour,
           AVG(failed_count) as avg_failures
         FROM queue_metrics
         WHERE captured_at > NOW() - INTERVAL '24 hours'
         GROUP BY queue_name, hour
         ORDER BY hour DESC`
      );
      
      // Get recent failed jobs from dead letter
      const deadLetter = await pool.query(
        `SELECT 
           queue_name,
           job_type,
           COUNT(*) as count,
           MAX(created_at) as last_failure
         FROM dead_letter_jobs
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY queue_name, job_type
         ORDER BY count DESC
         LIMIT 10`
      );
      
      res.json({
        trends: failures.rows,
        topFailures: deadLetter.rows,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to get failure analysis:', error);
      res.status(500).json({ error: 'Failed to get failure analysis' });
    }
  }
}
