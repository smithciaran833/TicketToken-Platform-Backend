import { FastifyRequest, FastifyReply } from 'fastify';
import { notificationService } from '../services/notification.service';
import { NotificationRequest } from '../types/notification.types';
import { logger } from '../config/logger';

export class NotificationController {
  async send(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const notificationRequest = request.body as NotificationRequest;
      const result = await notificationService.send(notificationRequest);

      reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to send notification', error);
      reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  async sendBatch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = request.body as { notifications: NotificationRequest[] };
      const requests = body.notifications;

      const results = await Promise.allSettled(
        requests.map(req => notificationService.send(req))
      );

      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      reply.status(200).send({
        success: true,
        data: {
          total: requests.length,
          successful: successful.length,
          failed: failed.length,
          results: results.map((r, i) => ({
            index: i,
            status: r.status,
            result: r.status === 'fulfilled' ? r.value : null,
            error: r.status === 'rejected' ? (r.reason as Error).message : null,
          })),
        },
      });
    } catch (error: any) {
      logger.error('Failed to send batch notifications', error);
      reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  async getStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const params = request.params as { id: string };
      const { id } = params;
      
      const status = await notificationService.getNotificationStatus(id);

      if (!status) {
        reply.status(404).send({
          success: false,
          error: 'Notification not found',
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: status,
      });
    } catch (error: any) {
      logger.error('Failed to get notification status', error);
      reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }
}

export const notificationController = new NotificationController();
