import { FastifyInstance } from 'fastify';
import { pgPool } from '../utils/database';
import { logger } from '../utils/logger';

export default async function grafanaRoutes(server: FastifyInstance) {
  // Grafana health check
  server.get('/', async (request, reply) => {
    return { status: 'ok' };
  });

  // Search endpoint for metrics
  server.post('/search', async (request, reply) => {
    try {
      const result = await pgPool.query(
        'SELECT DISTINCT metric_name FROM metrics ORDER BY metric_name'
      );
      return result.rows.map(row => row.metric_name);
    } catch (error) {
      logger.error('Grafana search error:', error);
      return [];
    }
  });

  // Query endpoint for time series data
  server.post('/query', async (request, reply) => {
    try {
      const { targets, range } = request.body as any;
      const from = new Date(range.from);
      const to = new Date(range.to);
      
      const results = await Promise.all(
        targets.map(async (target: any) => {
          const query = `
            SELECT 
              extract(epoch from timestamp) * 1000 as time,
              value
            FROM metrics
            WHERE metric_name = $1
              AND timestamp BETWEEN $2 AND $3
            ORDER BY timestamp
          `;
          
          const result = await pgPool.query(query, [target.target, from, to]);
          
          return {
            target: target.target,
            datapoints: result.rows.map(row => [
              parseFloat(row.value),
              parseInt(row.time)
            ])
          };
        })
      );
      
      return results;
    } catch (error) {
      logger.error('Grafana query error:', error);
      return [];
    }
  });

  // Annotations endpoint
  server.post('/annotations', async (request, reply) => {
    try {
      const { range, annotation } = request.body as any;
      const from = new Date(range.from);
      const to = new Date(range.to);
      
      // Get fraud detection events as annotations
      const query = `
        SELECT 
          extract(epoch from timestamp) * 1000 as time,
          metric_name as title,
          value as text
        FROM metrics
        WHERE metric_name LIKE 'fraud_%'
          AND value > 5
          AND timestamp BETWEEN $1 AND $2
        ORDER BY timestamp
      `;
      
      const result = await pgPool.query(query, [from, to]);
      
      return result.rows.map(row => ({
        time: parseInt(row.time),
        title: row.title,
        text: `Value: ${row.text}`,
        tags: ['fraud', 'alert']
      }));
    } catch (error) {
      logger.error('Grafana annotations error:', error);
      return [];
    }
  });
}
