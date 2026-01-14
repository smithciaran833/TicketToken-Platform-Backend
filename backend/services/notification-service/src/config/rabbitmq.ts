import { QUEUES } from "@tickettoken/shared";
const amqp = require('amqplib');
import { env } from './env';
import { logger } from './logger';

export class RabbitMQService {
  private connection: any = null;
  private channel: any = null;
  private isConnected: boolean = false;

  async connect(): Promise<void> {
    try {
      // AUDIT FIX S2S-1: Enforce TLS for RabbitMQ in production
      const url = env.RABBITMQ_URL;
      
      if (env.NODE_ENV === 'production') {
        if (!url.startsWith('amqps://')) {
          throw new Error(
            'SECURITY: RabbitMQ must use TLS (amqps://) in production. ' +
            'Current URL uses unencrypted connection. ' +
            'Set RABBITMQ_URL to amqps://...'
          );
        }
        logger.info('RabbitMQ TLS enabled for production');
      } else if (!url.startsWith('amqps://')) {
        logger.warn('RabbitMQ using unencrypted connection (non-production)');
      }

      this.connection = await amqp.connect(url);
      
      if (!this.connection) {
        throw new Error('Failed to establish RabbitMQ connection');
      }
      
      this.channel = await this.connection.createChannel();
      
      if (!this.channel) {
        throw new Error('Failed to create RabbitMQ channel');
      }

      await this.channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
      await this.channel.assertQueue(env.RABBITMQ_QUEUE, { durable: true });

      const routingKeys = [
        'payment.completed',
        'ticket.purchased',
        'ticket.transferred',
        'event.reminder',
        'event.cancelled',
        'event.updated',
        'user.registered',
        'user.password_reset',
        'venue.announcement',
        'marketing.campaign'
      ];

      for (const key of routingKeys) {
        await this.channel.bindQueue(env.RABBITMQ_QUEUE, env.RABBITMQ_EXCHANGE, key);
      }

      await this.channel.prefetch(1);

      this.connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error:', err);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        setTimeout(() => this.connect(), 5000);
      });

      this.isConnected = true;
      logger.info('RabbitMQ connected and configured');
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      setTimeout(() => this.connect(), 5000);
      throw error;
    }
  }

  async consume(callback: (msg: any) => Promise<void>): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    await this.channel.consume(env.RABBITMQ_QUEUE, async (msg: any) => {
      if (msg) {
        try {
          await callback(msg);
          if (this.channel) {
            this.channel.ack(msg);
          }
        } catch (error) {
          logger.error('Error processing message:', error);
          if (this.channel) {
            this.channel.nack(msg, false, true);
          }
        }
      }
    });
  }

  async publish(routingKey: string, data: any): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const message = Buffer.from(JSON.stringify(data));
    this.channel.publish(env.RABBITMQ_EXCHANGE, routingKey, message, {
      persistent: true,
      timestamp: Date.now(),
    });
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.isConnected = false;
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection:', error);
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const rabbitmqService = new RabbitMQService();
