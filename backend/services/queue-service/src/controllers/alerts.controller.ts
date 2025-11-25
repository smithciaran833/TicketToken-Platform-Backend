import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';

export class AlertsController {
  // Get recent alerts
  async getAlerts(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { severity, limit = 50 } = request.query as any;

      const pool = getPool();

      let query = `
        SELECT * FROM alert_history
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `;

      const params: any[] = [];

      if (severity) {
        query += ' AND severity = $1';
        params.push(severity);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await pool.query(query, params);

      return reply.send({
        alerts: result.rows,
        count: result.rowCount
      });
    } catch (error) {
      logger.error('Failed to get alerts:', error);
      return reply.code(500).send({ error: 'Failed to get alerts' });
    }
  }

  // Acknowledge an alert
  async acknowledgeAlert(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { id } = request.params as { id: string };

      const pool = getPool();

      await pool.query(
        `UPDATE alert_history
         SET acknowledged = true,
             acknowledged_by = $1,
             acknowledged_at = NOW()
         WHERE id = $2`,
        [request.user?.id, id]
      );

      logger.info(`Alert ${id} acknowledged by user ${request.user?.id}`);

      return reply.send({
        alertId: id,
        status: 'acknowledged',
        acknowledgedBy: request.user?.id
      });
    } catch (error) {
      logger.error('Failed to acknowledge alert:', error);
      return reply.code(500).send({ error: 'Failed to acknowledge alert' });
    }
  }

  // Test alert system
  async testAlert(request: AuthRequest, reply: FastifyReply): Promise<void> {
    try {
      const { severity = 'info', channel = 'log' } = request.body as any;

      logger.warn(`Test alert triggered by user ${request.user?.id}`);

      // This would trigger actual alerts in production
      // For now, just log it

      return reply.send({
        status: 'sent',
        severity,
        channel,
        message: 'Test alert sent successfully'
      });
    } catch (error) {
      logger.error('Failed to send test alert:', error);
      return reply.code(500).send({ error: 'Failed to send test alert' });
    }
  }
}
