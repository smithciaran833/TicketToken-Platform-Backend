import amqp from 'amqplib/callback_api';
import { logger } from '../utils/logger';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin@tickettoken-rabbitmq:5672';
const EXCHANGE_NAME = 'tickettoken_events';
const QUEUE_NAME = 'order_service_queue';
// MEDIUM: Dead letter queue for failed messages
const DLQ_EXCHANGE_NAME = 'tickettoken_events_dlx';
const DLQ_QUEUE_NAME = 'order_service_dlq';

// MEDIUM: Reconnection configuration
const RECONNECT_INITIAL_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_MULTIPLIER = 2;

let connection: amqp.Connection | null = null;
let channel: amqp.Channel | null = null;
let isConnecting = false;
let reconnectAttempts = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;

/**
 * MEDIUM: Connect to RabbitMQ with automatic reconnection
 */
export async function connectRabbitMQ(): Promise<void> {
  if (isConnecting) {
    logger.debug('RabbitMQ connection already in progress');
    return;
  }

  isConnecting = true;

  return new Promise((resolve, reject) => {
    amqp.connect(RABBITMQ_URL, (error, conn) => {
      if (error) {
        logger.error('Failed to connect to RabbitMQ', { error: error.message });
        isConnecting = false;
        scheduleReconnect();
        reject(error);
        return;
      }

      connection = conn;
      reconnectAttempts = 0; // Reset on successful connection

      conn.createChannel((error, ch) => {
        if (error) {
          logger.error('Failed to create RabbitMQ channel', { error: error.message });
          isConnecting = false;
          reject(error);
          return;
        }

        channel = ch;

        // MEDIUM: Assert dead letter exchange and queue first
        ch.assertExchange(DLQ_EXCHANGE_NAME, 'topic', { durable: true });
        ch.assertQueue(DLQ_QUEUE_NAME, {
          durable: true,
          exclusive: false,
          autoDelete: false,
        }, (dlqError) => {
          if (dlqError) {
            logger.error('Failed to create DLQ', { error: dlqError.message });
          } else {
            ch.bindQueue(DLQ_QUEUE_NAME, DLQ_EXCHANGE_NAME, '#');
            logger.info('Dead letter queue configured', { queue: DLQ_QUEUE_NAME });
          }
        });

        // Assert main exchange (topic type for routing)
        ch.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

        // Assert main queue with DLQ configuration
        ch.assertQueue(QUEUE_NAME, {
          durable: true,
          exclusive: false,
          autoDelete: false,
          arguments: {
            // MEDIUM: Route failed messages to DLQ
            'x-dead-letter-exchange': DLQ_EXCHANGE_NAME,
            'x-dead-letter-routing-key': 'order.failed',
          },
        }, (error, queue) => {
          if (error) {
            logger.error('Failed to create queue', { error: error.message });
            isConnecting = false;
            reject(error);
            return;
          }

          // Bind queue to exchange for order and payment events
          ch.bindQueue(queue.queue, EXCHANGE_NAME, 'order.*');
          ch.bindQueue(queue.queue, EXCHANGE_NAME, 'payment.*');
          ch.bindQueue(queue.queue, EXCHANGE_NAME, 'dispute.*');

          logger.info('RabbitMQ connected and configured', {
            exchange: EXCHANGE_NAME,
            queue: queue.queue,
            dlqExchange: DLQ_EXCHANGE_NAME,
            dlqQueue: DLQ_QUEUE_NAME,
          });

          // MEDIUM: Handle connection error with reconnection
          conn.on('error', (err) => {
            logger.error('RabbitMQ connection error', { error: err.message });
            // Don't schedule reconnect here - 'close' event will fire
          });

          // MEDIUM: Handle connection close with automatic reconnection
          conn.on('close', () => {
            logger.warn('RabbitMQ connection closed');
            connection = null;
            channel = null;
            isConnecting = false;
            scheduleReconnect();
          });

          // Handle channel errors
          ch.on('error', (err) => {
            logger.error('RabbitMQ channel error', { error: err.message });
          });

          ch.on('close', () => {
            logger.warn('RabbitMQ channel closed');
            channel = null;
          });

          isConnecting = false;
          resolve();
        });
      });
    });
  });
}

/**
 * MEDIUM: Schedule reconnection with exponential backoff
 */
function scheduleReconnect(): void {
  if (reconnectTimeout) {
    return; // Already scheduled
  }

  reconnectAttempts++;
  const delay = Math.min(
    RECONNECT_INITIAL_DELAY_MS * Math.pow(RECONNECT_MULTIPLIER, reconnectAttempts - 1),
    RECONNECT_MAX_DELAY_MS
  );

  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  const actualDelay = Math.round(delay + jitter);

  logger.info('Scheduling RabbitMQ reconnection', {
    attempt: reconnectAttempts,
    delayMs: actualDelay,
  });

  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    try {
      await connectRabbitMQ();
      logger.info('RabbitMQ reconnected successfully', { attempts: reconnectAttempts });
    } catch (error) {
      logger.error('RabbitMQ reconnection failed', {
        attempt: reconnectAttempts,
        error: error instanceof Error ? error.message : error,
      });
      // scheduleReconnect will be called by the 'close' handler or connectRabbitMQ failure
    }
  }, actualDelay);
}

/**
 * Check if RabbitMQ is connected
 */
export function isConnected(): boolean {
  return connection !== null && channel !== null;
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
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export async function closeRabbitMQ(): Promise<void> {
  // Cancel any pending reconnection
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

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
  dlqExchange: DLQ_EXCHANGE_NAME,
  dlqQueue: DLQ_QUEUE_NAME,
};
