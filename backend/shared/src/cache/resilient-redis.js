// WP-12 Phase 3: Resilient Redis Connection

const Redis = require('ioredis');
const EventEmitter = require('events');

class ResilientRedis extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: false,
      ...config
    };
    
    this.client = null;
    this.connected = false;
    
    this.connect();
  }

  connect() {
    this.client = new Redis(this.config);
    
    this.client.on('connect', () => {
      this.connected = true;
      console.log('✅ Redis connected');
      this.emit('connected');
    });
    
    this.client.on('error', (err) => {
      console.error('Redis error:', err.message);
      this.emit('error', err);
    });
    
    this.client.on('close', () => {
      this.connected = false;
      console.log('Redis connection closed');
      this.emit('disconnected');
    });
    
    this.client.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });
    
    return this.client;
  }

  async get(key) {
    if (!this.connected) {
      console.warn('Redis not connected, skipping cache');
      return null;
    }
    return await this.client.get(key);
  }

  async set(key, value, ttl) {
    if (!this.connected) {
      console.warn('Redis not connected, skipping cache');
      return null;
    }
    if (ttl) {
      return await this.client.setex(key, ttl, value);
    }
    return await this.client.set(key, value);
  }

  async del(key) {
    if (!this.connected) return null;
    return await this.client.del(key);
  }

  async quit() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

module.exports = ResilientRedis;
