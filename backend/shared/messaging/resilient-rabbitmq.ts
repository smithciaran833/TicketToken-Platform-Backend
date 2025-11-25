// WP-12 Phase 4: Resilient RabbitMQ Connection

import * as amqp from 'amqplib';
import { EventEmitter } from 'events';

interface RabbitMQConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  retryDelay?: number;
  maxRetries?: number;
  prefetch?: number;
}

interface QueueOptions {
  durable?: boolean;
  prefetch?: number;
}

type MessageHandler = (msg: amqp.ConsumeMessage | null) => Promise<void> | void;

class ResilientRabbitMQ extends EventEmitter {
  private config: Required<RabbitMQConfig>;
  private connection: any;
  private channel: any;
  private connected: boolean;
  private retryCount: number;

  constructor(config: RabbitMQConfig) {
    super();

    this.config = {
      url: config.url || 'amqp://localhost',
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || -1,
      retryDelay: config.retryDelay || 5000,
      maxRetries: config.maxRetries || -1, // -1 for infinite
      prefetch: config.prefetch || 10,
    };

    this.connection = null;
    this.channel = null;
    this.connected = false;
    this.retryCount = 0;
  }

  async connect(): Promise<amqp.Channel | undefined> {
    try {
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();

      await this.channel.prefetch(this.config.prefetch);

      this.connected = true;
      this.retryCount = 0;
      console.log('✅ RabbitMQ connected');

      // Handle connection events
      this.connection.on('error', (err: Error) => this.handleError(err));
      this.connection.on('close', () => this.handleClose());

      this.emit('connected');
      return this.channel;
    } catch (error) {
      await this.handleConnectionFailure(error as Error);
    }
  }

  async handleError(error: Error): Promise<void> {
    console.error('RabbitMQ error:', error.message);
    this.connected = false;
    this.emit('error', error);
  }

  async handleClose(): Promise<void> {
    console.log('RabbitMQ connection closed');
    this.connected = false;
    this.emit('disconnected');
    await this.reconnect();
  }

  async handleConnectionFailure(error: Error): Promise<void> {
    this.connected = false;
    this.retryCount++;

    if (this.config.maxRetries === -1 || this.retryCount <= this.config.maxRetries) {
      console.log(`RabbitMQ reconnecting (attempt ${this.retryCount})...`);
      setTimeout(() => this.connect(), this.config.retryDelay);
    } else {
      console.error('RabbitMQ max retries exceeded');
      this.emit('error', new Error('Max connection retries exceeded'));
    }
  }

  async reconnect(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  async publish(
    exchange: string,
    routingKey: string,
    content: any,
    options: amqp.Options.Publish = {}
  ): Promise<boolean> {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }

    const messageOptions: amqp.Options.Publish = {
      persistent: true,
      messageId: Date.now().toString(),
      timestamp: Date.now(),
      ...options,
    };

    return this.channel!.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(content)),
      messageOptions
    );
  }

  async consume(
    queue: string,
    handler: MessageHandler,
    options: amqp.Options.Consume = {}
  ): Promise<amqp.Replies.Consume> {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }

    return this.channel!.consume(queue, handler, options);
  }

  async assertQueue(
    queue: string,
    options: amqp.Options.AssertQueue = {}
  ): Promise<amqp.Replies.AssertQueue> {
    if (!this.connected) {
      await this.connect();
    }
    return this.channel!.assertQueue(queue, options);
  }

  async close(): Promise<void> {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    this.connected = false;
  }
}

export default ResilientRabbitMQ;
