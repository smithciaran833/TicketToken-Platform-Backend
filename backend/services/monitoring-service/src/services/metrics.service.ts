import { pgPool } from '../utils/database';
import { logger } from '../utils/logger';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Initialize Prometheus metrics
collectDefaultMetrics();

class MetricsService {
  async pushMetrics(data: any): Promise<void> {
    try {
      // Make sure we have a database connection
      if (!pgPool) {
        logger.error('Database not connected');
        return;
      }

      const query = `
        INSERT INTO metrics (metric_name, service_name, value, metric_type, labels, timestamp)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `;
      
      const metricName = data.metric_name || data.name || 'unknown';
      const serviceName = data.service_name || 'monitoring-service';
      const value = data.value || 0;
      const metricType = data.type || data.metric_type || 'gauge';
      const labels = data.labels || {};
      
      await pgPool.query(query, [
        metricName,
        serviceName,
        value,
        metricType,
        JSON.stringify(labels)
      ]);
      
      logger.debug(`Stored metric: ${metricName} = ${value}`);
    } catch (error) {
      // Type guard for error
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Don't log InfluxDB errors, just PostgreSQL ones
      if (!errorMessage.includes('InfluxDB') && !errorMessage.includes('unauthorized')) {
        logger.error('Error pushing metrics to PostgreSQL:', errorMessage);
      }
    }
  }

  async queryMetrics(query: string): Promise<any[]> {
    try {
      if (!pgPool) {
        logger.error('Database not connected');
        return [];
      }
      const result = await pgPool.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error querying metrics:', error);
      return [];
    }
  }

  getPrometheusRegistry() {
    return register;
  }
}

export const metricsService = new MetricsService();

// Import Kafka producer
import { kafkaProducer } from '../streaming/kafka-producer';

// Add method to stream metrics to Kafka
export async function streamMetricToKafka(metric: any) {
  await kafkaProducer.sendMetric(metric);
}
