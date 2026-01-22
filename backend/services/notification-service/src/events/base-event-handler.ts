import Bull from 'bull';
import { logger } from '../config/logger';
import { db } from '../config/database';
import { getAuthServiceClient, getEventServiceClient } from '../clients';
import { createRequestContext } from '@tickettoken/shared';

export abstract class BaseEventHandler {
  protected queue: Bull.Queue;
  protected serviceName: string;

  constructor(queueName: string, serviceName: string) {
    this.serviceName = serviceName;
    this.queue = new Bull(queueName, {
      redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'redis',
        password: process.env.REDIS_PASSWORD
      }
    });
  }

  abstract initializeListeners(): void;

  /**
   * Create request context for HMAC-authenticated service calls
   */
  protected createServiceContext(tenantId?: string): ReturnType<typeof createRequestContext> {
    return createRequestContext({
      tenantId: tenantId || process.env.DEFAULT_TENANT_ID,
      serviceName: 'notification-service',
    });
  }

  protected async getUserDetails(userId: string, tenantId?: string): Promise<any> {
    try {
      // Query user from database first
      const result = await db('users')
        .where('id', userId)
        .first();

      if (!result) {
        // Fallback to auth service API with HMAC authentication
        const authClient = getAuthServiceClient();
        const ctx = this.createServiceContext(tenantId);
        const user = await authClient.getUserById(userId, ctx);

        if (!user) {
          throw new Error(`User not found: ${userId}`);
        }

        return user;
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get user details for ${userId}:`, error);
      // Return minimal fallback data
      return {
        id: userId,
        email: `user_${userId}@tickettoken.com`,
        name: 'Valued Customer'
      };
    }
  }

  protected async getEventDetails(eventId: string, tenantId?: string): Promise<any> {
    try {
      const result = await db('events')
        .where('id', eventId)
        .first();

      if (!result) {
        // Fallback to event service API with HMAC authentication
        const eventClient = getEventServiceClient();
        const ctx = this.createServiceContext(tenantId);
        const event = await eventClient.getEventById(eventId, ctx);

        if (!event) {
          throw new Error(`Event not found: ${eventId}`);
        }

        return event;
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get event details for ${eventId}:`, error);
      return { id: eventId, name: 'Event' };
    }
  }

  protected async recordNotification(data: any): Promise<void> {
    try {
      await db('notification_history').insert({
        user_id: data.userId,
        type: data.type,
        channel: data.channel,
        recipient: data.recipient,
        status: data.status,
        metadata: JSON.stringify(data.metadata || {}),
        created_at: new Date(),
        updated_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to record notification:', error);
    }
  }

  async start(): Promise<void> {
    this.initializeListeners();
    logger.info(`${this.serviceName} event handler started`);
  }

  async stop(): Promise<void> {
    await this.queue.close();
    logger.info(`${this.serviceName} event handler stopped`);
  }
}
