const amqp = require('amqplib');
const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.channel = null;
    this.exchange = 'tickettoken.events';
    this.subscribers = new Map();
  }

  async connect(url) {
    // Use admin credentials we found
    const rabbitUrl = url || process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';
    
    try {
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();
      
      await this.channel.assertExchange(this.exchange, 'topic', { 
        durable: true 
      });
      
      console.log('✅ Connected to RabbitMQ Event Bus');
      
      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
        setTimeout(() => this.reconnect(), 5000);
      });
      
      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
      });
      
      return true;
      
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error.message);
      // Don't reconnect in test mode
      if (process.env.NODE_ENV !== 'test') {
        setTimeout(() => this.connect(rabbitUrl), 5000);
      }
      return false;
    }
  }

  async reconnect() {
    try {
      await this.cleanup();
      await this.connect();
    } catch (error) {
      console.error('Reconnection failed:', error);
    }
  }

  async publish(eventType, data, options = {}) {
    if (!this.channel) {
      console.warn('Event bus not connected, skipping publish');
      return null;
    }

    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      source: process.env.SERVICE_NAME || 'unknown',
      correlationId: options.correlationId || this.generateId(),
      data
    };

    const routingKey = eventType.replace(/\./g, '_');
    
    try {
      await this.channel.publish(
        this.exchange,
        routingKey,
        Buffer.from(JSON.stringify(event)),
        { persistent: true }
      );
      
      console.log(`📤 Published event: ${eventType}`);
      this.emit('event:published', event);
      
      return event;
    } catch (error) {
      console.error('Failed to publish event:', error);
      throw error;
    }
  }

  async subscribe(pattern, handler, options = {}) {
    if (!this.channel) {
      console.warn('Event bus not connected, skipping subscription');
      return null;
    }

    const queueName = options.queue || `${process.env.SERVICE_NAME || 'service'}.${pattern}`;
    
    const queue = await this.channel.assertQueue(queueName, {
      durable: true,
      exclusive: false
    });
    
    const routingKey = pattern.replace(/\./g, '_');
    
    await this.channel.bindQueue(queue.queue, this.exchange, routingKey);
    
    await this.channel.consume(queue.queue, async (msg) => {
      if (!msg) return;
      
      try {
        const event = JSON.parse(msg.content.toString());
        console.log(`📥 Received event: ${event.type}`);
        
        await handler(event);
        
        this.channel.ack(msg);
        this.emit('event:processed', event);
        
      } catch (error) {
        console.error(`Error processing event:`, error);
        
        if (options.requeue !== false) {
          this.channel.nack(msg, false, true);
        } else {
          this.channel.ack(msg);
        }
        
        this.emit('event:error', { error, message: msg });
      }
    });
    
    this.subscribers.set(pattern, { handler, queue: queue.queue });
    
    console.log(`✅ Subscribed to pattern: ${pattern}`);
    return queue.queue;
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async cleanup() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}

module.exports = EventBus;
