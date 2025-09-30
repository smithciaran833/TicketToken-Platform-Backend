import { pgPool } from '../utils/database';
import { healthService } from './health.service';
import { metricsService } from './metrics.service';
import { alertService } from './alert.service';
import { logger } from '../utils/logger';

class DashboardService {
  async getOverview(): Promise<any> {
    try {
      const [health, activeAlerts, recentMetrics] = await Promise.all([
        healthService.getOverallHealth(),
        alertService.getActiveAlerts(),
        this.getRecentMetrics(),
      ]);

      return {
        health,
        alerts: {
          total: activeAlerts.length,
          critical: activeAlerts.filter(a => a.severity === 'critical').length,
          warning: activeAlerts.filter(a => a.severity === 'warning').length,
        },
        metrics: recentMetrics,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting dashboard overview:', error);
      throw error;
    }
  }

  async getSLAMetrics(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          service_name,
          AVG(uptime_percentage) as avg_uptime,
          AVG(response_time_p95) as avg_p95_latency,
          SUM(violations) as total_violations
         FROM sla_metrics
         WHERE period_start >= $1
         GROUP BY service_name`,
        [params.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
      );

      return {
        services: result.rows,
        period: params.period || '30d',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting SLA metrics:', error);
      throw error;
    }
  }

  async getPerformanceMetrics(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          service_name,
          endpoint,
          AVG(response_time_ms) as avg_response_time,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95,
          percentile_cont(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99,
          COUNT(*) as request_count
         FROM performance_metrics
         WHERE timestamp > NOW() - INTERVAL '1 hour'
         GROUP BY service_name, endpoint
         ORDER BY request_count DESC
         LIMIT 20`
      );

      return {
        endpoints: result.rows,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      throw error;
    }
  }

  async getBusinessMetrics(params: any): Promise<any> {
    try {
      // This would connect to your business metrics
      // For now, returning mock data structure
      return {
        revenue: {
          today: 0,
          week: 0,
          month: 0,
        },
        tickets: {
          sold_today: 0,
          active_events: 0,
        },
        venues: {
          active: 0,
          total: 0,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting business metrics:', error);
      throw error;
    }
  }

  async getIncidents(params: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT * FROM incidents 
         WHERE status != 'closed'
         ORDER BY severity, detected_at DESC
         LIMIT 10`
      );

      return {
        incidents: result.rows,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Error getting incidents:', error);
      throw error;
    }
  }

  private async getRecentMetrics(): Promise<any> {
    try {
      const result = await pgPool.query(
        `SELECT 
          metric_name,
          service_name,
          AVG(value) as avg_value
         FROM metrics
         WHERE timestamp > NOW() - INTERVAL '5 minutes'
         GROUP BY metric_name, service_name`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting recent metrics:', error);
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();
