// WP-12 Phase 4: Dead Letter Queue Handler

import { EventEmitter } from 'events';
import * as amqp from 'amqplib';

interface DLQMessage {
  content: any;
  retryCount: number;
  originalQueue: string;
  error?: string;
  timestamp?: string;
}

interface DLQConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier?: number;
  poisonThreshold?: number;
  dlqName?: string;
}

interface DLQStats {
  retryQueue: number;
  poisonMessages: number;
  config: Required<DLQConfig>;
}

class DLQHandler extends EventEmitter {
  private config: Required<DLQConfig>;
  private retryCount: Map<string, number>;
  private poisonMessages: Set<string>;

  constructor(config: DLQConfig) {
    super();

    this.config = {
      maxRetries: config.maxRetries || 5,
      retryDelay: config.retryDelay || 1000,
      backoffMultiplier: config.backoffMultiplier || 2,
      poisonThreshold: config.poisonThreshold || 10,
      dlqName: config.dlqName || 'dead-letter-queue',
    };

    this.retryCount = new Map();
    this.poisonMessages = new Set();
  }

  async processMessage(
    channel: amqp.Channel,
    message: amqp.ConsumeMessage,
    processFn: (msg: amqp.ConsumeMessage) => Promise<void>
  ): Promise<void> {
    const messageId = message.properties.messageId || JSON.stringify(message.content);

    try {
      // Check if message is poison
      if (this.isPoisonMessage(messageId)) {
        console.log(`☠️  Poison message detected: ${messageId}`);
        await this.sendToDLQ(channel, message, 'POISON_MESSAGE');
        channel.ack(message);
        return;
      }

      // Process the message
      await processFn(message);

      // Success - reset retry count
      this.retryCount.delete(messageId);
      channel.ack(message);
    } catch (error) {
      await this.handleFailure(channel, message, error as Error);
    }
  }

  async handleFailure(
    channel: amqp.Channel,
    message: amqp.ConsumeMessage,
    error: Error
  ): Promise<void> {
    const messageId = message.properties.messageId || JSON.stringify(message.content);
    const retries = this.retryCount.get(messageId) || 0;

    console.log(
      `Message failed (attempt ${retries + 1}/${this.config.maxRetries}):`,
      error.message
    );

    if (retries >= this.config.maxRetries) {
      // Max retries exceeded - send to DLQ
      console.log(`Max retries exceeded for message ${messageId}`);
      await this.sendToDLQ(channel, message, 'MAX_RETRIES_EXCEEDED');
      channel.ack(message);
      this.retryCount.delete(messageId);
    } else {
      // Retry with exponential backoff
      const delay = this.calculateBackoff(retries);
      this.retryCount.set(messageId, retries + 1);

      setTimeout(() => {
        channel.nack(message, false, true); // Requeue the message
      }, delay);
    }
  }

  calculateBackoff(retryCount: number): number {
    return Math.min(
      this.config.retryDelay * Math.pow(this.config.backoffMultiplier, retryCount),
      60000 // Max 1 minute
    );
  }

  async sendToDLQ(
    channel: amqp.Channel,
    message: amqp.ConsumeMessage,
    reason: string
  ): Promise<void> {
    const dlqMessage: DLQMessage = {
      content: message.content.toString(),
      retryCount: this.retryCount.get(message.properties.messageId) || 0,
      originalQueue: message.fields.routingKey,
      error: reason,
      timestamp: new Date().toISOString(),
    };

    await channel.sendToQueue(this.config.dlqName, Buffer.from(JSON.stringify(dlqMessage)), {
      persistent: true,
    });

    console.log(`Message sent to DLQ: ${reason}`);
    this.emit('dlq', dlqMessage);
  }

  isPoisonMessage(messageId: string): boolean {
    const count = this.retryCount.get(messageId) || 0;
    if (count > this.config.poisonThreshold) {
      this.poisonMessages.add(messageId);
      return true;
    }
    return this.poisonMessages.has(messageId);
  }

  getStats(): DLQStats {
    return {
      retryQueue: this.retryCount.size,
      poisonMessages: this.poisonMessages.size,
      config: this.config,
    };
  }
}

export default DLQHandler;
