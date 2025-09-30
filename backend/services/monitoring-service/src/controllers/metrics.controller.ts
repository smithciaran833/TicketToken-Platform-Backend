import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { metricsService } from '../services/metrics.service';
import { pgPool } from '../utils/database';
import { logger } from '../utils/logger';
import { register } from 'prom-client';

export const metricsController = {
  async getMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get metrics from PostgreSQL instead of InfluxDB
      const result = await pgPool.query(`
        SELECT 
          metric_name,
          service_name,
          value,
          labels,
          timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '5 minutes'
        ORDER BY timestamp DESC
        LIMIT 1000
      `);
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching metrics:', error);
      return [];
    }
  },

  async pushMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const metrics = request.body as any;
      await metricsService.pushMetrics(metrics);
      return { success: true };
    } catch (error) {
      logger.error('Error pushing metrics:', error);
      return reply.code(500).send({ error: 'Failed to push metrics' });
    }
  },

  async exportPrometheusMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      const metrics = await register.metrics();
      reply.type('text/plain');
      return metrics;
    } catch (error) {
      logger.error('Error exporting prometheus metrics:', error);
      return reply.code(500).send({ error: 'Failed to export metrics' });
    }
  },

  async getLatestMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get the latest value for each metric
      const result = await pgPool.query(`
        SELECT DISTINCT ON (metric_name, service_name) 
          metric_name,
          service_name,
          value,
          timestamp
        FROM metrics
        WHERE timestamp > NOW() - INTERVAL '1 hour'
        ORDER BY metric_name, service_name, timestamp DESC
      `);
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching latest metrics:', error);
      return [];
    }
  },

  async getMetricsByService(request: FastifyRequest<{ Params: { service: string } }>, reply: FastifyReply) {
    try {
      const { service } = request.params;
      const result = await pgPool.query(`
        SELECT * FROM metrics
        WHERE service_name = $1
        AND timestamp > NOW() - INTERVAL '1 hour'
        ORDER BY timestamp DESC
        LIMIT 100
      `, [service]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error fetching service metrics:', error);
      return [];
    }
  }
};
