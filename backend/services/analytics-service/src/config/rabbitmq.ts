const amqp = require('amqplib/callback_api');
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { config } from './index';
import { logger } from '../utils/logger';

let connection: any;
let channel: any;

export async function connectRabbitMQ(): Promise<void> {
  return new Promise((resolve, reject) => {
    amqp.connect(config.rabbitmq.url, (error: any, conn: any) => {
      if (error) {
        logger.error('Failed to connect to RabbitMQ:', error);
        reject(error);
        return;
      }
      
      connection = conn;
      
      connection.createChannel((error: any, ch: any) => {
        if (error) {
          logger.error('Failed to create channel:', error);
          reject(error);
          return;
        }
        
        channel = ch;
        
        // Create exchange
        channel.assertExchange(config.rabbitmq.exchange, 'topic', {
          durable: true,
        });
        
        // Create queue
        channel.assertQueue(config.rabbitmq.queue, {
          durable: true,
          exclusive: false,
          autoDelete: false,
        }, (error: any, queue: any) => {
          if (error) {
            logger.error('Failed to create queue:', error);
            reject(error);
            return;
          }
          
          // Bind queue to exchange for all event types
          channel.bindQueue(queue.queue, config.rabbitmq.exchange, '#');
          
          logger.info('RabbitMQ connected and configured');
          
          // Handle connection events
          connection.on('error', (err: any) => {
            logger.error('RabbitMQ connection error:', err);
          });
          
          connection.on('close', () => {
            logger.warn('RabbitMQ connection closed');
          });
          
          resolve();
        });
      });
    });
  });
}

export function getChannel() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return channel;
}

export async function publishEvent(routingKey: string, data: any) {
  try {
    const message = Buffer.from(JSON.stringify(data));
    channel.publish(
      config.rabbitmq.exchange,
      routingKey,
      message,
      { persistent: true }
    );
  } catch (error) {
    logger.error('Failed to publish event:', error);
    throw error;
  }
}

export async function closeRabbitMQ() {
  return new Promise<void>((resolve) => {
    if (channel) {
      channel.close(() => {
        if (connection) {
          connection.close(() => {
            logger.info('RabbitMQ connection closed');
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
