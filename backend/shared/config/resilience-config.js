// WP-12 Phase 2: Resilience Configuration

module.exports = {
  circuitBreakers: {
    stripe: {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringWindow: 60000
    },
    square: {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringWindow: 60000
    },
    blockchain: {
      failureThreshold: 3,
      resetTimeout: 60000,
      monitoringWindow: 120000
    },
    database: {
      failureThreshold: 10,
      resetTimeout: 10000,
      monitoringWindow: 30000
    },
    redis: {
      failureThreshold: 10,
      resetTimeout: 5000,
      monitoringWindow: 30000
    }
  },
  
  retry: {
    default: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2
    },
    payment: {
      maxRetries: 2,
      initialDelay: 2000,
      maxDelay: 10000,
      factor: 2
    },
    blockchain: {
      maxRetries: 5,
      initialDelay: 3000,
      maxDelay: 60000,
      factor: 1.5
    }
  },
  
  timeouts: {
    database: 5000,
    redis: 2000,
    http: 10000,
    blockchain: 30000
  }
};
