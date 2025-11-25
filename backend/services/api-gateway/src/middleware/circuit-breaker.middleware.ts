import { FastifyInstance } from 'fastify';
import CircuitBreaker from 'opossum';
import { createRequestLogger } from '../utils/logger';
import { REDIS_KEYS } from '../config/redis';

const CIRCUIT_BREAKER_CONFIGS = {
  // Existing services
  'venue-service': {
    timeout: 10000, // Standard operations
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'auth-service': {
    timeout: 5000, // Fast operations (auth checks)
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'event-service': {
    timeout: 10000, // Standard operations
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  // Missing services - Phase 2 additions
  'ticket-service': {
    timeout: 10000, // Standard operations
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'payment-service': {
    timeout: 30000, // Payment processing can be slow
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 15,
  },
  'marketplace-service': {
    timeout: 15000, // Marketplace operations (escrow, etc.)
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'analytics-service': {
    timeout: 10000, // Analytics queries
    errorThresholdPercentage: 60, // More tolerant for analytics
    resetTimeout: 60000,
    volumeThreshold: 10,
  },
  'notification-service': {
    timeout: 5000, // Fast notification sends
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'integration-service': {
    timeout: 15000, // External integrations can be slow
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 15,
  },
  'compliance-service': {
    timeout: 10000, // Compliance checks
    errorThresholdPercentage: 40, // Lower threshold for compliance
    resetTimeout: 60000,
    volumeThreshold: 10,
  },
  'queue-service': {
    timeout: 5000, // Fast queue operations
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'search-service': {
    timeout: 10000, // Search operations
    errorThresholdPercentage: 60, // More tolerant for search
    resetTimeout: 60000,
    volumeThreshold: 15,
  },
  'file-service': {
    timeout: 30000, // File uploads can be slow
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 10,
  },
  'monitoring-service': {
    timeout: 5000, // Fast monitoring data
    errorThresholdPercentage: 70, // Very tolerant for monitoring
    resetTimeout: 60000,
    volumeThreshold: 10,
  },
  'blockchain-service': {
    timeout: 60000, // Blockchain operations are slow
    errorThresholdPercentage: 50,
    resetTimeout: 120000, // Longer reset for blockchain
    volumeThreshold: 10,
  },
  'order-service': {
    timeout: 10000, // Standard operations
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'scanning-service': {
    timeout: 5000, // Fast QR scanning
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'minting-service': {
    timeout: 90000, // NFT minting is very slow
    errorThresholdPercentage: 50,
    resetTimeout: 120000, // Longer reset for minting
    volumeThreshold: 10,
  },
  'transfer-service': {
    timeout: 30000, // Transfer operations with blockchain
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 15,
  },
};

// Store circuit breakers
const circuitBreakers = new Map();

export async function setupCircuitBreakerMiddleware(server: FastifyInstance) {
  // Create circuit breakers for each service
  for (const [service, config] of Object.entries(CIRCUIT_BREAKER_CONFIGS)) {
    const breaker = createCircuitBreaker(service, config, server);
    circuitBreakers.set(service, breaker);
  }

  // Add circuit breaker to server instance
  server.decorate('circuitBreakers', circuitBreakers);

  // Monitor circuit breaker states
  monitorCircuitBreakers(server);
}

function createCircuitBreaker(serviceName: string, config: any, server: FastifyInstance) {
  const options = {
    timeout: config.timeout,
    errorThresholdPercentage: config.errorThresholdPercentage,
    resetTimeout: config.resetTimeout,
    volumeThreshold: config.volumeThreshold,
    halfOpenAfter: config.resetTimeout / 2,
  };

  const breaker = new CircuitBreaker(async (request: any) => {
    // This is a placeholder - actual implementation would make the service call
    return request();
  }, options);

  breaker.on('open', async () => {
    const logger = createRequestLogger('circuit-breaker');
    logger.error({
      service: serviceName,
      state: 'open',
      stats: breaker.stats,
    }, `Circuit breaker opened for ${serviceName}`);
  });

  breaker.on('halfOpen', () => {
    const logger = createRequestLogger('circuit-breaker');
    logger.info({
      service: serviceName,
      state: 'half-open',
    }, `Circuit breaker half-open for ${serviceName}`);
  });

  return breaker;
}

function monitorCircuitBreakers(server: FastifyInstance) {
  setInterval(() => {
    const metrics: any = {};
    for (const [service, breaker] of circuitBreakers) {
      const stats = (breaker as any).stats;
      metrics[service] = {
        state: (breaker as any).opened ? 'OPEN' : 'CLOSED',
        requests: stats.fires,
        failures: stats.failures,
        successes: stats.successes,
        timeouts: stats.timeouts,
      };
    }
    
    const logger = createRequestLogger('circuit-breaker');
    logger.info({ metrics }, 'Circuit breaker metrics');
  }, 60000); // Log every minute
}

export function getCircuitBreaker(serviceName: string): CircuitBreaker | undefined {
  return circuitBreakers.get(serviceName);
}
