import * as amqplib from 'amqplib';
import { config } from '../config';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

class QueueServiceClass extends EventEmitter {
  private connection: any = null;
  private publishChannel: any = null;
  private consumeChannel: any = null;
  private log = logger.child({ component: 'QueueService' });
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  async initialize(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(config.rabbitmq.url);

      this.connection.on('error', (err: any) => {
        this.log.error('RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.log.warn('RabbitMQ connection closed');
        this.handleConnectionError();
      });

      this.publishChannel = await this.connection.createChannel();
      this.consumeChannel = await this.connection.createChannel();

      await this.setupQueues();

      this.reconnectAttempts = 0;
      this.log.info('Queue service connected');
      this.emit('connected');
    } catch (error) {
      this.log.error('Failed to connect to RabbitMQ:', error);
      this.handleConnectionError();
      throw error;
    }
  }

  private async setupQueues(): Promise<void> {
    const queues = Object.values(config.rabbitmq.queues);

    for (const queue of queues) {
      if (this.publishChannel) {
        await this.publishChannel.assertQueue(queue, { durable: true });
      }
    }
  }

  private handleConnectionError(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);

    this.log.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        this.log.error('Reconnection failed:', error);
      }
    }, delay);
  }

  async publish(queue: string, message: any): Promise<void> {
    if (!this.publishChannel) {
      this.log.warn('Queue service not initialized, message not sent', { queue, messageType: message.type });
      return; // Gracefully skip publishing when queue is not available
    }

    const messageBuffer = Buffer.from(JSON.stringify(message));

    try {
      const sent = this.publishChannel.sendToQueue(queue, messageBuffer, { persistent: true });

      if (!sent) {
        this.log.warn('Message was not sent, queue buffer full', { queue });
        throw new Error('Queue buffer full');
      }
    } catch (error) {
      this.log.error('Failed to publish message:', error);
      throw error;
    }
  }

  async consume(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
    if (!this.consumeChannel) {
      throw new Error('Queue service not initialized');
    }

    await this.consumeChannel.prefetch(1);

    await this.consumeChannel.consume(queue, async (msg: any) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);

        if (this.consumeChannel) {
          this.consumeChannel.ack(msg);
        }
      } catch (error) {
        this.log.error('Error processing message:', error);

        if (this.consumeChannel) {
          this.consumeChannel.nack(msg, false, true);
        }
      }
    });
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.publishChannel) {
      await this.publishChannel.close();
    }

    if (this.consumeChannel) {
      await this.consumeChannel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }

    this.log.info('Queue service closed');
  }

  isConnected(): boolean {
    return this.connection !== null && this.publishChannel !== null;
  }
}

export const QueueService = new QueueServiceClass();
