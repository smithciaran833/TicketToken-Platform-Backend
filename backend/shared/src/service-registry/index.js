const Redis = require('ioredis');
const axios = require('axios');

class ServiceRegistry {
  constructor(redisUrl = null) {
    // Debug logging
    console.log('[ServiceRegistry] Constructor called with:', redisUrl);
    console.log('[ServiceRegistry] REDIS_URL env:', process.env.REDIS_URL ? 'SET' : 'NOT SET');
    console.log('[ServiceRegistry] REDIS_PASSWORD env:', process.env.REDIS_PASSWORD ? 'SET' : 'NOT SET');
    
    // Use REDIS_URL from environment if not provided
    const url = redisUrl || process.env.REDIS_URL || `redis://:${process.env.REDIS_PASSWORD}@localhost:6379`;
    const maskedUrl = url?.replace(/\/\/:(.*?)@/, '\/\/:<redacted>@'); console.log('[ServiceRegistry] Using URL:', maskedUrl);
    
    this.redis = new Redis(url);
    this.services = new Map();
    this.healthCheckInterval = 5000;
    this.healthCheckers = new Map();
  }

  async register(serviceName, port, metadata = {}) {
    const serviceInfo = {
      name: serviceName,
      port,
      host: process.env.NODE_ENV === 'production' ? process.env.HOSTNAME : 'localhost',
      url: `http://localhost:${port}`,
      status: 'healthy',
      lastHeartbeat: Date.now(),
      version: process.env.npm_package_version || '1.0.0',
      startTime: Date.now(),
      ...metadata
    };

    await this.redis.setex(
      `service:${serviceName}`,
      30,
      JSON.stringify(serviceInfo)
    );

    await this.redis.sadd('services', serviceName);
    this.services.set(serviceName, serviceInfo);
    
    // Start health check
    this.startHealthCheck(serviceName, port);
    
    console.log(`✅ Service registered: ${serviceName} on port ${port}`);
    return serviceInfo;
  }

  async deregister(serviceName) {
    await this.redis.del(`service:${serviceName}`);
    await this.redis.srem('services', serviceName);
    this.services.delete(serviceName);
    this.stopHealthCheck(serviceName);
    console.log(`Service deregistered: ${serviceName}`);
  }

  async getAllServices() {
    const serviceNames = await this.redis.smembers('services');
    const services = [];
    
    for (const name of serviceNames) {
      const data = await this.redis.get(`service:${name}`);
      if (data) {
        services.push(JSON.parse(data));
      }
    }
    
    return services;
  }

  async getService(serviceName) {
    const data = await this.redis.get(`service:${serviceName}`);
    return data ? JSON.parse(data) : null;
  }

  async heartbeat(serviceName) {
    const service = await this.getService(serviceName);
    if (service) {
      service.lastHeartbeat = Date.now();
      await this.redis.setex(
        `service:${serviceName}`,
        30,
        JSON.stringify(service)
      );
    }
  }

  startHealthCheck(serviceName, port) {
    if (this.healthCheckers.has(serviceName)) {
      return;
    }

    const checker = setInterval(async () => {
      try {
        const response = await axios.get(`http://localhost:${port}/health`, {
          timeout: 3000
        });
        
        if (response.status === 200) {
          await this.updateServiceStatus(serviceName, 'healthy');
        }
      } catch (error) {
        await this.updateServiceStatus(serviceName, 'unhealthy');
      }
    }, this.healthCheckInterval);

    this.healthCheckers.set(serviceName, checker);
  }

  stopHealthCheck(serviceName) {
    const checker = this.healthCheckers.get(serviceName);
    if (checker) {
      clearInterval(checker);
      this.healthCheckers.delete(serviceName);
    }
  }

  async updateServiceStatus(serviceName, status) {
    const service = await this.getService(serviceName);
    if (service && service.status !== status) {
      service.status = status;
      await this.redis.setex(
        `service:${serviceName}`,
        30,
        JSON.stringify(service)
      );
      console.log(`Service ${serviceName} status updated to: ${status}`);
    }
  }

  async cleanup() {
    // Stop all health checkers
    for (const [name, checker] of this.healthCheckers) {
      clearInterval(checker);
    }
    this.healthCheckers.clear();
    
    // Close Redis connection
    await this.redis.quit();
  }
}

module.exports = ServiceRegistry;
