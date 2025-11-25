import amqp from 'amqplib/callback_api';
import { logger } from '../utils/logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin@tickettoken-rabbitmq:5672';
const EXCHANGE_NAME = 'tickettoken_events';
const QUEUE_NAME = 'order_service_queue';

let connection: amqp.Connection | null = null;
let channel: amqp.Channel | null = null;

export async function connectRabbitMQ(): Promise<void> {
  return new Promise((resolve, reject) => {
    amqp.connect(RABBITMQ_URL, (error, conn) => {
      if (error) {
        logger.error('Failed to connect to RabbitMQ', { error: error.message });
        reject(error);
        return;
      }

      connection = conn;

      conn.createChannel((error, ch) => {
        if (error) {
          logger.error('Failed to create RabbitMQ channel', { error: error.message });
          reject(error);
          return;
        }

        channel = ch;

        // Assert exchange (topic type for routing)
        ch.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

        // Assert queue
        ch.assertQueue(QUEUE_NAME, {
          durable: true,
          exclusive: false,
          autoDelete: false,
        }, (error, queue) => {
          if (error) {
            logger.error('Failed to create queue', { error: error.message });
            reject(error);
            return;
          }

          // Bind queue to exchange for order events
          ch.bindQueue(queue.queue, EXCHANGE_NAME, 'order.*');

          logger.info('RabbitMQ connected and configured', {
            exchange: EXCHANGE_NAME,
            queue: queue.queue,
          });

          // Handle connection events
          conn.on('error', (err) => {
            logger.error('RabbitMQ connection error', { error: err.message });
          });

          conn.on('close', () => {
            logger.warn('RabbitMQ connection closed');
            connection = null;
            channel = null;
          });

          resolve();
        });
      });
    });
  });
}

export function getChannel(): amqp.Channel {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ() first.');
  }
  return channel;
}

export async function publishEvent(routingKey: string, data: any): Promise<void> {
  try {
    const ch = getChannel();
    const message = Buffer.from(JSON.stringify(data));
    
    const published = ch.publish(
      EXCHANGE_NAME,
      routingKey,
      message,
      { persistent: true }
    );

    if (!published) {
      logger.warn('Failed to publish event (buffer full)', { routingKey });
    } else {
      logger.debug('Event published', { routingKey, dataSize: message.length });
    }
  } catch (error) {
    logger.error('Failed to publish event', { 
      routingKey, 
      error: error instanceof Error ? error.message : error 
    });
    throw error;
  }
}

export async function closeRabbitMQ(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (channel) {
      channel.close(() => {
        if (connection) {
          connection.close(() => {
            logger.info('RabbitMQ connection closed');
            connection = null;
            channel = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

export const rabbitmqConfig = {
  url: RABBITMQ_URL,
  exchange: EXCHANGE_NAME,
  queue: QUEUE_NAME,
};
