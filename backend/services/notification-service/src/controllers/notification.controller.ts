import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { NotificationRequest } from '../types/notification.types';
import { logger } from '../config/logger';
import { validationResult } from 'express-validator';

export class NotificationController {
  async send(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const request: NotificationRequest = req.body;
      const result = await notificationService.send(request);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to send notification', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async sendBatch(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const requests: NotificationRequest[] = req.body.notifications;
      const results = await Promise.allSettled(
        requests.map(request => notificationService.send(request))
      );

      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      res.status(200).json({
        success: true,
        data: {
          total: requests.length,
          successful: successful.length,
          failed: failed.length,
          results: results.map((r, i) => ({
            index: i,
            status: r.status,
            result: r.status === 'fulfilled' ? r.value : null,
            error: r.status === 'rejected' ? r.reason.message : null,
          })),
        },
      });
    } catch (error: any) {
      logger.error('Failed to send batch notifications', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const status = await notificationService.getNotificationStatus(id);

      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Notification not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      logger.error('Failed to get notification status', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export const notificationController = new NotificationController();
