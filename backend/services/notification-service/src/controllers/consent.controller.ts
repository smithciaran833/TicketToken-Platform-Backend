import { FastifyRequest, FastifyReply } from 'fastify';
import { complianceService } from '../services/compliance.service';
import { logger } from '../config/logger';
import { NotificationChannel, NotificationType } from '../types/notification.types';

export class ConsentController {
  async grant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = request.body as {
        customerId: string;
        channel: NotificationChannel;
        type: NotificationType;
        source: string;
        venueId?: string;
      };

      const { customerId, channel, type, source, venueId } = body;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];

      await complianceService.recordConsent(
        customerId,
        channel,
        type,
        source,
        venueId,
        ipAddress,
        userAgent
      );

      reply.status(201).send({
        success: true,
        message: 'Consent recorded successfully',
      });
    } catch (error: any) {
      logger.error('Failed to record consent', error);
      reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  async revoke(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = request.body as {
        customerId: string;
        channel: NotificationChannel;
        type?: NotificationType;
        venueId?: string;
      };

      const { customerId, channel, type, venueId } = body;

      await complianceService.revokeConsent(
        customerId,
        channel,
        type,
        venueId
      );

      reply.status(200).send({
        success: true,
        message: 'Consent revoked successfully',
      });
    } catch (error: any) {
      logger.error('Failed to revoke consent', error);
      reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }

  async check(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const params = request.params as { customerId: string };
      const query = request.query as {
        channel?: NotificationChannel;
        type?: NotificationType;
        venueId?: string;
      };

      const { customerId } = params;
      const { channel, type, venueId } = query;

      const consentModel = require('../models/consent.model').consentModel;
      const hasConsent = await consentModel.hasConsent(
        customerId,
        channel,
        type,
        venueId as string
      );

      reply.status(200).send({
        success: true,
        data: {
          hasConsent,
          customerId,
          channel,
          type,
          venueId,
        },
      });
    } catch (error: any) {
      logger.error('Failed to check consent', error);
      reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  }
}

export const consentController = new ConsentController();
