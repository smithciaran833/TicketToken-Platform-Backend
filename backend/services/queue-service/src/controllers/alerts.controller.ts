import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { getPool } from '../config/database.config';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth.middleware';

export class AlertsController {
  // Get recent alerts
  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const { severity, limit = 50 } = req.query;
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
      
      res.json({
        alerts: result.rows,
        count: result.rowCount
      });
    } catch (error) {
      logger.error('Failed to get alerts:', error);
      res.status(500).json({ error: 'Failed to get alerts' });
    }
  }
  
  // Acknowledge an alert
  async acknowledgeAlert(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const pool = getPool();
      
      await pool.query(
        `UPDATE alert_history 
         SET acknowledged = true, 
             acknowledged_by = $1,
             acknowledged_at = NOW()
         WHERE id = $2`,
        [req.user?.id, id]
      );
      
      logger.info(`Alert ${id} acknowledged by user ${req.user?.id}`);
      
      res.json({
        alertId: id,
        status: 'acknowledged',
        acknowledgedBy: req.user?.id
      });
    } catch (error) {
      logger.error('Failed to acknowledge alert:', error);
      res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  }
  
  // Test alert system
  async testAlert(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { severity = 'info', channel = 'log' } = req.body;
      
      logger.warn(`Test alert triggered by user ${req.user?.id}`);
      
      // This would trigger actual alerts in production
      // For now, just log it
      
      res.json({
        status: 'sent',
        severity,
        channel,
        message: 'Test alert sent successfully'
      });
    } catch (error) {
      logger.error('Failed to send test alert:', error);
      res.status(500).json({ error: 'Failed to send test alert' });
    }
  }
}
