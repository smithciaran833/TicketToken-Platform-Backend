import Bull from 'bull';
import { logger } from '../config/logger';
import { db } from '../config/database';

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

  protected async getUserDetails(userId: string): Promise<any> {
    try {
      // Query user from database
      const result = await db('users')
        .where('id', userId)
        .first();
      
      if (!result) {
        // Fallback to auth service API
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
        const response = await fetch(`${authServiceUrl}/api/v1/users/${userId}`, {
          headers: {
            'X-Service-Token': process.env.SERVICE_TOKEN || '',
            'X-Service-Name': this.serviceName
          }
        });
        
        if (!response.ok) {
          throw new Error(`User not found: ${userId}`);
        }
        
        return await response.json();
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

  protected async getEventDetails(eventId: string): Promise<any> {
    try {
      const result = await db('events')
        .where('id', eventId)
        .first();
      
      if (!result) {
        const eventServiceUrl = process.env.EVENT_SERVICE_URL || 'http://event-service:3003';
        const response = await fetch(`${eventServiceUrl}/api/v1/events/${eventId}`, {
          headers: {
            'X-Service-Token': process.env.SERVICE_TOKEN || '',
            'X-Service-Name': this.serviceName
          }
        });
        
        if (!response.ok) {
          throw new Error(`Event not found: ${eventId}`);
        }
        
        return await response.json();
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
