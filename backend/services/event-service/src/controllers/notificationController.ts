import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'NotificationController' });

export class NotificationController {
  async createNotification(req: Request, res: Response) {
    try {
      const { userId, user_id, type, title, message, status } = req.body;
      const finalUserId = userId || user_id; // Handle both field names
      
      const db = DatabaseService.getPool();
      const result = await db.query(
        `INSERT INTO notifications (user_id, type, title, message, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [finalUserId, type, title, message, status || 'SENT']
      );
      
      log.info('Notification created', { id: result.rows[0].id, type });
      res.json(result.rows[0]);
    } catch (error) {
      log.error('Failed to create notification', error);
      res.status(500).json({ error: 'Failed to create notification' });
    }
  }

  async getUserNotifications(req: Request, res: Response) {
    const { userId } = req.params;
    const { status = 'all', limit = 20 } = req.query;
    
    try {
      const db = DatabaseService.getPool();
      let query = `
        SELECT * FROM notifications
        WHERE user_id = $1
      `;
      const params: any[] = [userId];
      
      if (status !== 'all') {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const result = await db.query(query, params);
      
      res.json({
        userId,
        notifications: result.rows,
        unreadCount: result.rows.filter(n => n.status === 'SENT' || n.status === 'pending').length
      });
    } catch (error) {
      log.error('Failed to get notifications', error);
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }

  async markAsRead(req: Request, res: Response) {
    const { notificationId } = req.params;
    
    try {
      const db = DatabaseService.getPool();
      await db.query(
        `UPDATE notifications
         SET status = 'read', read_at = NOW()
         WHERE id = $1`,
        [notificationId]
      );
      
      res.json({ success: true });
    } catch (error) {
      log.error('Failed to mark notification as read', error);
      res.status(500).json({ error: 'Failed to update notification' });
    }
  }
}

export const notificationController = new NotificationController();
