import { FastifyInstance } from 'fastify';
import CircuitBreaker from 'opossum';
import { createRequestLogger } from '../utils/logger';
import { REDIS_KEYS } from '../config/redis';

const CIRCUIT_BREAKER_CONFIGS = {
  'venue-service': {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'auth-service': {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
  },
  'event-service': {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 20,
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
