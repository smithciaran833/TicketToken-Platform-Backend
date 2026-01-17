import { ServiceHealthChecker } from './service.checker';
import { DatabaseHealthChecker } from './database.checker';
import { RedisHealthChecker } from './redis.checker';
import { logger } from '../utils/logger';
import { config } from '../config';

const checkers: any[] = [];
let checkInterval: NodeJS.Timeout | null = null;

export async function initializeHealthCheckers() {
  try {
    logger.info('Initializing health checkers...');

    // Service checkers for each microservice
    const services = [
      'auth', 'venue', 'event', 'ticket',
      'payment', 'marketplace', 'analytics', 'apiGateway'
    ];

    for (const service of services) {
      const serviceConfig = (config.services as any)[service];
      checkers.push(new ServiceHealthChecker(service, serviceConfig));
    }

    // Infrastructure checkers
    checkers.push(new DatabaseHealthChecker());
    checkers.push(new RedisHealthChecker());

    // Start periodic health checks
    checkInterval = setInterval(() => {
      runHealthChecks();
    }, config.intervals.healthCheck);

    // Run initial check
    await runHealthChecks();

    logger.info('Health checkers initialized');
  } catch (error) {
    logger.error('Failed to initialize health checkers:', error);
    throw error;
  }
}

async function runHealthChecks() {
  const results = await Promise.allSettled(
    checkers.map(checker => checker.check())
  );

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      const rejectedResult = results[i] as PromiseRejectedResult;
      logger.error(`Health check failed for ${checkers[i].getName()}:`, rejectedResult.reason);
    }
  }
}

export function stopHealthCheckers() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
