// WP-12 Phase 4: Resilient RabbitMQ Connection

const amqp = require('amqplib');
const EventEmitter = require('events');

class ResilientRabbitMQ extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      url: config.url || 'amqp://localhost',
      retryDelay: config.retryDelay || 5000,
      maxRetries: config.maxRetries || -1, // -1 for infinite
      prefetch: config.prefetch || 10
    };
    
    this.connection = null;
    this.channel = null;
    this.connected = false;
    this.retryCount = 0;
  }

  async connect() {
    try {
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      
      await this.channel.prefetch(this.config.prefetch);
      
      this.connected = true;
      this.retryCount = 0;
      console.log('✅ RabbitMQ connected');
      
      // Handle connection events
      this.connection.on('error', (err) => this.handleError(err));
      this.connection.on('close', () => this.handleClose());
      
      this.emit('connected');
      return this.channel;
      
    } catch (error) {
      await this.handleConnectionFailure(error);
    }
  }

  async handleError(error) {
    console.error('RabbitMQ error:', error.message);
    this.connected = false;
    this.emit('error', error);
  }

  async handleClose() {
    console.log('RabbitMQ connection closed');
    this.connected = false;
    this.emit('disconnected');
    await this.reconnect();
  }

  async handleConnectionFailure(error) {
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

  async reconnect() {
    if (!this.connected) {
      await this.connect();
    }
  }

  async publish(exchange, routingKey, content, options = {}) {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }
    
    const messageOptions = {
      persistent: true,
      messageId: Date.now().toString(),
      timestamp: Date.now(),
      ...options
    };
    
    return this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(content)),
      messageOptions
    );
  }

  async consume(queue, handler, options = {}) {
    if (!this.connected) {
      throw new Error('RabbitMQ not connected');
    }
    
    return this.channel.consume(queue, handler, options);
  }

  async assertQueue(queue, options = {}) {
    if (!this.connected) {
      await this.connect();
    }
    return this.channel.assertQueue(queue, options);
  }

  async close() {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    this.connected = false;
  }
}

module.exports = ResilientRabbitMQ;
