import { register } from 'prom-client';
import { healthService } from './health.service';
import { alertService } from './alert.service';
import { pgPool, redisClient } from '../utils/database';
import { logger } from '../utils/logger';

class DashboardAggregatorService {
  async getSystemStatus(): Promise<any> {
    try {
      // Get current metrics from Prometheus registry
      const metrics = await register.getMetricsAsJSON();
      
      // Extract key metrics
      const systemMetrics: any = {};
      for (const metric of metrics) {
        if (metric.name === 'system_cpu_usage_percent') {
          systemMetrics.cpu = metric.values[0]?.value || 0;
        }
        if (metric.name === 'system_memory_usage_percent') {
          systemMetrics.memory = metric.values[0]?.value || 0;
        }
        if (metric.name === 'process_resident_memory_bytes') {
          systemMetrics.processMemory = (metric.values[0]?.value || 0) / (1024 * 1024); // Convert to MB
        }
      }

      // Get service status
      const serviceMetrics: any = {};
      for (const metric of metrics) {
        if (metric.name === 'service_up') {
          for (const value of metric.values) {
            const serviceName = value.labels?.service;
            if (serviceName) {
              serviceMetrics[serviceName] = {
                up: value.value === 1,
                port: value.labels?.port || 'unknown',
              };
            }
          }
        }
      }

      // Get database status
      const databaseStatus: any = {
        postgresql: false,
        redis: false,
        mongodb: false,
      };

      try {
        if (pgPool) {
          await pgPool.query('SELECT 1');
          databaseStatus.postgresql = true;
        }
      } catch (e) {}

      try {
        if (redisClient) {
          await redisClient.ping();
          databaseStatus.redis = true;
        }
      } catch (e) {}

      // Get active alerts
      const activeAlerts = await alertService.getActiveAlerts().catch(() => []);

      return {
        timestamp: new Date(),
        system: {
          cpu: `${systemMetrics.cpu?.toFixed(1) || 0}%`,
          memory: `${systemMetrics.memory?.toFixed(1) || 0}%`,
          processMemory: `${systemMetrics.processMemory?.toFixed(1) || 0} MB`,
        },
        services: serviceMetrics,
        databases: databaseStatus,
        alerts: {
          total: activeAlerts.length,
          critical: activeAlerts.filter((a: any) => a.severity === 'critical').length,
          warning: activeAlerts.filter((a: any) => a.severity === 'warning').length,
        },
        servicesCount: {
          total: Object.keys(serviceMetrics).length,
          up: Object.values(serviceMetrics).filter((s: any) => s.up).length,
          down: Object.values(serviceMetrics).filter((s: any) => !s.up).length,
        },
      };
    } catch (error) {
      logger.error('Error aggregating dashboard data:', error);
      throw error;
    }
  }

  async getMetricsSummary(): Promise<any> {
    try {
      const metrics = await register.getMetricsAsJSON();
      const summary: any = {
        timestamp: new Date(),
        categories: {
          system: [],
          services: [],
          database: [],
          business: [],
        },
      };

      for (const metric of metrics) {
        const metricSummary = {
          name: metric.name,
          type: metric.type,
          value: metric.values[0]?.value,
          help: metric.help,
        };

        if (metric.name.startsWith('system_')) {
          summary.categories.system.push(metricSummary);
        } else if (metric.name.startsWith('service_') || metric.name.startsWith('http_')) {
          summary.categories.services.push(metricSummary);
        } else if (metric.name.includes('postgres') || metric.name.includes('redis') || metric.name.includes('mongo')) {
          summary.categories.database.push(metricSummary);
        } else if (metric.name.startsWith('business_')) {
          summary.categories.business.push(metricSummary);
        }
      }

      return summary;
    } catch (error) {
      logger.error('Error getting metrics summary:', error);
      throw error;
    }
  }
}

export const dashboardAggregatorService = new DashboardAggregatorService();
