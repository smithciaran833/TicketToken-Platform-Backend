import * as amqplib from 'amqplib';
import { config } from '../config';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

// MEDIUM Fix: DLQ Configuration
const DLQ_CONFIG = {
  /** Number of retries before moving to DLQ */
  maxRetries: 3,
  /** Delay between retries (with exponential backoff) */
  retryDelayMs: 1000,
  /** DLQ suffix */
  dlqSuffix: '.dlq',
  /** TTL for messages in DLQ (24 hours) */
  dlqMessageTtl: 24 * 60 * 60 * 1000,
};

class QueueServiceClass extends EventEmitter {
  private connection: any = null;
  private publishChannel: any = null;
  private consumeChannel: any = null;
  private log = logger.child({ component: 'QueueService' });
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  /** Track message retry counts */
  private messageRetries: Map<string, number> = new Map();

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
        // MEDIUM Fix: Create DLQ for each queue
        const dlqName = `${queue}${DLQ_CONFIG.dlqSuffix}`;
        
        // Create the DLQ first
        await this.publishChannel.assertQueue(dlqName, {
          durable: true,
          arguments: {
            'x-message-ttl': DLQ_CONFIG.dlqMessageTtl,
          }
        });
        
        // Create main queue with DLQ binding
        await this.publishChannel.assertQueue(queue, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': dlqName,
          }
        });
        
        this.log.info('Queue setup with DLQ', { queue, dlq: dlqName });
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

  /**
   * MEDIUM Fix: Enhanced consume with DLQ support and retry tracking
   */
  async consume(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
    if (!this.consumeChannel) {
      throw new Error('Queue service not initialized');
    }

    await this.consumeChannel.prefetch(1);

    await this.consumeChannel.consume(queue, async (msg: any) => {
      if (!msg) return;

      const messageId = msg.properties.messageId || msg.fields.deliveryTag.toString();
      
      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);

        // Success - clear retry count and ack
        this.messageRetries.delete(messageId);
        if (this.consumeChannel) {
          this.consumeChannel.ack(msg);
        }
      } catch (error: any) {
        this.log.error('Error processing message:', { 
          error: error.message,
          queue,
          messageId,
        });

        // Track retries
        const retries = (this.messageRetries.get(messageId) || 0) + 1;
        this.messageRetries.set(messageId, retries);

        if (this.consumeChannel) {
          if (retries >= DLQ_CONFIG.maxRetries) {
            // Max retries exceeded - send to DLQ (by rejecting without requeue)
            this.log.warn('Message moved to DLQ after max retries', {
              queue,
              dlq: `${queue}${DLQ_CONFIG.dlqSuffix}`,
              messageId,
              retries,
              error: error.message,
            });
            this.messageRetries.delete(messageId);
            // nack with requeue=false sends to DLQ via dead-letter-exchange
            this.consumeChannel.nack(msg, false, false);
          } else {
            // Retry with delay (exponential backoff)
            const delay = DLQ_CONFIG.retryDelayMs * Math.pow(2, retries - 1);
            this.log.info('Retrying message after delay', {
              queue,
              messageId,
              retries,
              delayMs: delay,
            });
            
            // Requeue the message for retry
            setTimeout(() => {
              if (this.consumeChannel) {
                this.consumeChannel.nack(msg, false, true);
              }
            }, delay);
          }
        }
      }
    });
  }

  /**
   * Consume messages from DLQ for manual processing/alerting
   */
  async consumeDLQ(queue: string, handler: (msg: any, originalQueue: string) => Promise<void>): Promise<void> {
    const dlqName = `${queue}${DLQ_CONFIG.dlqSuffix}`;
    
    if (!this.consumeChannel) {
      throw new Error('Queue service not initialized');
    }

    await this.consumeChannel.prefetch(1);

    await this.consumeChannel.consume(dlqName, async (msg: any) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content, queue);

        if (this.consumeChannel) {
          this.consumeChannel.ack(msg);
        }
      } catch (error: any) {
        this.log.error('Error processing DLQ message:', { 
          error: error.message,
          dlq: dlqName,
        });
        // DLQ messages should not be requeued - acknowledge to prevent infinite loop
        if (this.consumeChannel) {
          this.consumeChannel.ack(msg);
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

  // ===========================================================================
  // MEDIUM Fix: Tenant-Scoped Queue Operations
  // Fixes: "Queue not tenant-scoped - Uses single global queue"
  // ===========================================================================

  /**
   * Publish message to tenant-specific queue
   */
  async publishTenantScoped(baseName: string, tenantId: string, message: any): Promise<void> {
    const tenantQueue = `${baseName}.tenant.${tenantId}`;
    
    // Ensure queue exists
    if (this.publishChannel) {
      await this.publishChannel.assertQueue(tenantQueue, { durable: true });
    }

    // Add tenant context to message
    const tenantMessage = {
      ...message,
      _meta: {
        ...message._meta,
        tenantId,
        publishedAt: new Date().toISOString()
      }
    };

    await this.publish(tenantQueue, tenantMessage);
    
    this.log.debug('Published to tenant-scoped queue', {
      queue: tenantQueue,
      tenantId,
      messageType: message.type
    });
  }

  /**
   * Consume messages from tenant-specific queue
   */
  async consumeTenantScoped(
    baseName: string, 
    tenantId: string, 
    handler: (msg: any) => Promise<void>
  ): Promise<void> {
    const tenantQueue = `${baseName}.tenant.${tenantId}`;
    
    this.log.info('Starting tenant-scoped consumer', { queue: tenantQueue, tenantId });
    
    // Wrap handler to set tenant context
    const wrappedHandler = async (msg: any) => {
      // Verify tenant matches
      if (msg._meta?.tenantId && msg._meta.tenantId !== tenantId) {
        this.log.error('Tenant mismatch in queue message', {
          expected: tenantId,
          received: msg._meta.tenantId,
          queue: tenantQueue
        });
        throw new Error('Tenant mismatch in queue message');
      }
      
      await handler(msg);
    };

    await this.consume(tenantQueue, wrappedHandler);
  }

  /**
   * Create tenant-aware job processor
   * 
   * MEDIUM Fix: Recurring jobs not tenant-aware
   * Fixes: "Recurring jobs not tenant-aware - No tenant context in jobs"
   */
  async processTenantJob(
    tenantId: string,
    jobName: string,
    processor: () => Promise<void>
  ): Promise<void> {
    const { TenantDB } = await import('../utils/tenant-db');
    
    this.log.info('Processing tenant job', { tenantId, jobName });
    
    await TenantDB.withJobContext(tenantId, jobName, async () => {
      await processor();
    });
  }

  /**
   * Schedule recurring job for all tenants
   */
  async scheduleRecurringTenantJob(
    jobName: string,
    getTenantIds: () => Promise<string[]>,
    processor: (tenantId: string) => Promise<void>,
    intervalMs: number
  ): Promise<void> {
    const runJob = async () => {
      try {
        const tenantIds = await getTenantIds();
        
        this.log.info('Running recurring tenant job', {
          jobName,
          tenantCount: tenantIds.length
        });

        for (const tenantId of tenantIds) {
          try {
            await this.processTenantJob(tenantId, jobName, () => processor(tenantId));
          } catch (error: any) {
            this.log.error('Tenant job failed', {
              jobName,
              tenantId,
              error: error.message
            });
            // Continue with other tenants
          }
        }
      } catch (error: any) {
        this.log.error('Recurring job failed', {
          jobName,
          error: error.message
        });
      }
    };

    // Run immediately, then on interval
    await runJob();
    setInterval(runJob, intervalMs);
    
    this.log.info('Scheduled recurring tenant job', { jobName, intervalMs });
  }
}

export const QueueService = new QueueServiceClass();
