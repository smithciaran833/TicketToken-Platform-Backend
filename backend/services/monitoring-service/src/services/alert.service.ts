import { pgPool, redisClient } from '../utils/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface Alert {
  id: string;
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  state: 'pending' | 'firing' | 'resolved';
  service?: string;
  value?: number;
  threshold?: number;
  started_at: Date;
  resolved_at?: Date;
  acknowledged?: boolean;
  acknowledged_by?: string;
  acknowledged_at?: Date;
}

class AlertService {
  async getActiveAlerts(): Promise<Alert[]> {
    try {
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE state IN ('pending', 'firing')
         ORDER BY severity, started_at DESC`
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting active alerts:', error);
      throw error;
    }
  }

  async getAlert(id: string): Promise<Alert | null> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alerts WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting alert:', error);
      throw error;
    }
  }

  async acknowledgeAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET acknowledged = true,
             acknowledged_by = $2,
             acknowledged_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.acknowledged_by || 'system']
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  async resolveAlert(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alerts 
         SET state = 'resolved',
             resolved_at = NOW(),
             resolution_note = $2
         WHERE id = $1
         RETURNING *`,
        [id, data.resolution_note || null]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Clear from cache
      await redisClient.del(`alert:${id}`);

      return result.rows[0];
    } catch (error) {
      logger.error('Error resolving alert:', error);
      throw error;
    }
  }

  async getAlertHistory(params: any): Promise<any[]> {
    try {
      const limit = params.limit || 100;
      const offset = params.offset || 0;
      
      const result = await pgPool.query(
        `SELECT * FROM alerts 
         WHERE timestamp > NOW() - INTERVAL '30 days'
         ORDER BY started_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert history:', error);
      throw error;
    }
  }

  async getAlertRules(): Promise<any[]> {
    try {
      const result = await pgPool.query(
        'SELECT * FROM alert_rules WHERE enabled = true ORDER BY severity, rule_name'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting alert rules:', error);
      throw error;
    }
  }

  async createAlertRule(data: any): Promise<any> {
    try {
      const id = uuidv4();
      const result = await pgPool.query(
        `INSERT INTO alert_rules (id, rule_name, metric_name, condition, threshold, severity, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity, true]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating alert rule:', error);
      throw error;
    }
  }

  async updateAlertRule(id: string, data: any): Promise<any> {
    try {
      const result = await pgPool.query(
        `UPDATE alert_rules 
         SET rule_name = $2,
             metric_name = $3,
             condition = $4,
             threshold = $5,
             severity = $6,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, data.rule_name, data.metric_name, data.condition, data.threshold, data.severity]
      );

      if (result.rowCount === 0) {
        throw new Error('Alert rule not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Error updating alert rule:', error);
      throw error;
    }
  }

  async deleteAlertRule(id: string): Promise<void> {
    try {
      await pgPool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    } catch (error) {
      logger.error('Error deleting alert rule:', error);
      throw error;
    }
  }
}

export const alertService = new AlertService();
