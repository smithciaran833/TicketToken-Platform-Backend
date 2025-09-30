// WP-12 Phase 3: Resilient Database Connection Pool

const { Pool } = require('pg');
const EventEmitter = require('events');

class ResilientPool extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      ...config,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
      // Retry configuration
      retryDelay: config.retryDelay || 1000,
      maxRetries: config.maxRetries || 10,
      backoffFactor: config.backoffFactor || 1.5
    };
    
    this.pool = null;
    this.retryCount = 0;
    this.connected = false;
    
    this.connect();
  }

  async connect() {
    try {
      this.pool = new Pool(this.config);
      
      // Test connection
      await this.pool.query('SELECT 1');
      
      this.connected = true;
      this.retryCount = 0;
      console.log('✅ Database connected');
      this.emit('connected');
      
      // Setup error handlers
      this.pool.on('error', (err) => this.handleError(err));
      
    } catch (error) {
      await this.handleConnectionFailure(error);
    }
  }

  async handleConnectionFailure(error) {
    this.connected = false;
    this.retryCount++;
    
    if (this.retryCount <= this.config.maxRetries) {
      const delay = this.calculateBackoff();
      console.log(`⚠️  Database connection failed, retry ${this.retryCount}/${this.config.maxRetries} in ${delay}ms`);
      
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('❌ Database connection failed after max retries');
      this.emit('error', error);
    }
  }

  calculateBackoff() {
    return Math.min(
      this.config.retryDelay * Math.pow(this.config.backoffFactor, this.retryCount - 1),
      30000 // Max 30 seconds
    );
  }

  async query(...args) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    
    try {
      return await this.pool.query(...args);
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        await this.handleConnectionFailure(error);
        throw error;
      }
      throw error;
    }
  }

  async handleError(error) {
    console.error('Database pool error:', error.message);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      await this.connect();
    }
  }

  async end() {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
    }
  }
}

module.exports = ResilientPool;
