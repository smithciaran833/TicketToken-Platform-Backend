import { FastifyInstance } from 'fastify';
import { createContainer, asClass, asValue, asFunction } from 'awilix';
import { ProxyService } from './proxy.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { LoadBalancerService } from './load-balancer.service';
import { ServiceDiscoveryService } from './service-discovery.service';
import { AggregatorService } from './aggregator.service';
import { RetryService } from './retry.service';
import { TimeoutService } from './timeout.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('services');

export async function setupServices(server: FastifyInstance) {
  logger.info('Setting up services and dependency injection...');
  
  // Create dependency injection container
  const container = createContainer({
    injectionMode: 'CLASSIC',
  });
  
  // Register services
  container.register({
    // Core dependencies
    redis: asValue(server.redis),
    logger: asValue(logger),
    
    // Services
    circuitBreakerService: asClass(CircuitBreakerService).singleton(),
    loadBalancerService: asClass(LoadBalancerService).singleton(),
    serviceDiscoveryService: asClass(ServiceDiscoveryService).singleton(),
    retryService: asClass(RetryService).singleton(),
    timeoutService: asClass(TimeoutService).singleton(),
    
    // ProxyService - no arguments needed
    proxyService: asFunction(() => {
      return new ProxyService();
    }).singleton(),
    
    // AggregatorService depends on proxyService
    aggregatorService: asClass(AggregatorService).singleton(),
  });
  
  // Resolve all services
  const services = {
    proxyService: container.resolve('proxyService') as ProxyService,
    circuitBreakerService: container.resolve('circuitBreakerService') as CircuitBreakerService,
    loadBalancerService: container.resolve('loadBalancerService') as LoadBalancerService,
    serviceDiscoveryService: container.resolve('serviceDiscoveryService') as ServiceDiscoveryService,
    aggregatorService: container.resolve('aggregatorService') as AggregatorService,
    retryService: container.resolve('retryService') as RetryService,
    timeoutService: container.resolve('timeoutService') as TimeoutService,
  };
  
  // Add services to Fastify instance
  server.decorate('services', services);
  server.decorate('container', container);
  
  logger.info('All services initialized successfully');
  
  // ServiceDiscoveryService starts health checks automatically in its constructor
  // No need to call startHealthChecks() - it doesn't exist
}
