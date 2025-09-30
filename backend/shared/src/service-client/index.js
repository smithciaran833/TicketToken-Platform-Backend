const axios = require('axios');
const ServiceRegistry = require('../service-registry');
const CircuitBreaker = require('../circuit-breaker');

class ServiceClient {
  constructor(registry) {
    this.registry = registry || new ServiceRegistry();
    this.breakers = new Map();
    this.axios = axios.create({
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  getBreaker(serviceName) {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker({
        name: serviceName,
        failureThreshold: 5,
        resetTimeout: 30000
      }));
    }
    return this.breakers.get(serviceName);
  }

  async call(serviceName, method, path, data = null, options = {}) {
    const breaker = this.getBreaker(serviceName);
    
    return breaker.call(async () => {
      const service = await this.registry.discover(serviceName);
      
      if (service.status !== 'healthy') {
        throw new Error(`Service ${serviceName} is unhealthy`);
      }

      const config = {
        method,
        url: `${service.url}${path}`,
        ...options
      };

      if (data) {
        if (method === 'GET') {
          config.params = data;
        } else {
          config.data = data;
        }
      }

      if (process.env.SERVICE_TOKEN) {
        config.headers = {
          ...config.headers,
          'X-Service-Token': process.env.SERVICE_TOKEN
        };
      }

      const response = await this.axios(config);
      return response.data;
    });
  }

  async get(serviceName, path, params, options) {
    return this.call(serviceName, 'GET', path, params, options);
  }

  async post(serviceName, path, data, options) {
    return this.call(serviceName, 'POST', path, data, options);
  }

  async put(serviceName, path, data, options) {
    return this.call(serviceName, 'PUT', path, data, options);
  }

  async delete(serviceName, path, data, options) {
    return this.call(serviceName, 'DELETE', path, data, options);
  }

  getAllBreakers() {
    const status = [];
    for (const [name, breaker] of this.breakers) {
      status.push(breaker.getStatus());
    }
    return status;
  }
}

module.exports = ServiceClient;
