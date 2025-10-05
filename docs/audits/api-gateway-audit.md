# DATABASE AUDIT: api-gateway
Generated: Thu Oct  2 15:05:54 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
```

## 2. DATABASE CONFIGURATION FILES

## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### services.ts
First 100 lines:
```typescript
// Service URL configuration with environment variable support
// Uses Docker service names when running in containers, localhost for local dev

export const getServiceUrl = (envVar: string, dockerService: string, port: number): string => {
  return process.env[envVar] || `http://${dockerService}:${port}`;
};

export const serviceUrls = {
  auth:         getServiceUrl('AUTH_SERVICE_URL',         'auth-service',         3001),
  venue:        getServiceUrl('VENUE_SERVICE_URL',        'venue-service',        3002),
  event:        getServiceUrl('EVENT_SERVICE_URL',        'event-service',        3003),
  ticket:       getServiceUrl('TICKET_SERVICE_URL',       'ticket-service',       3004),
  payment:      getServiceUrl('PAYMENT_SERVICE_URL',      'payment-service',      3005),
  marketplace:  getServiceUrl('MARKETPLACE_SERVICE_URL',  'marketplace-service',  3006),
  analytics:    getServiceUrl('ANALYTICS_SERVICE_URL',    'analytics-service',    3007),
  notification: getServiceUrl('NOTIFICATION_SERVICE_URL', 'notification-service', 3008),
  integration:  getServiceUrl('INTEGRATION_SERVICE_URL',  'integration-service',  3009),
  compliance:   getServiceUrl('COMPLIANCE_SERVICE_URL',   'compliance-service',   3010),
  queue:        getServiceUrl('QUEUE_SERVICE_URL',        'queue-service',        3011),
  search:       getServiceUrl('SEARCH_SERVICE_URL',       'search-service',       3012),
  file:         getServiceUrl('FILE_SERVICE_URL',         'file-service',         3013),
  monitoring:   getServiceUrl('MONITORING_SERVICE_URL',   'monitoring-service',   3014),
  blockchain:   getServiceUrl('BLOCKCHAIN_SERVICE_URL',   'blockchain-service',   3015),
  order:        getServiceUrl('ORDER_SERVICE_URL',        'order-service',        3016),
  scanning:     getServiceUrl('SCANNING_SERVICE_URL',     'scanning-service',     3020),
  minting:      getServiceUrl('MINTING_SERVICE_URL',      'minting-service',      3018),
  transfer:     getServiceUrl('TRANSFER_SERVICE_URL',     'transfer-service',     3019),
};
```

### aggregator.service.ts
First 100 lines:
```typescript
import { DataSource } from '../types';
import { ProxyService } from './proxy.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('aggregator-service');

export class AggregatorService {
  constructor(private proxyService: ProxyService) {}

  async aggregate(dataSources: DataSource[], request: any): Promise<any> {
    const required = dataSources.filter(ds => ds.required);
    const optional = dataSources.filter(ds => !ds.required);

    // Execute required requests first
    const requiredResults = await this.executeRequired(required, request);

    // Execute optional requests with timeout
    const optionalResults = await this.executeOptional(optional, request);

    // Merge all results
    return this.mergeResults(requiredResults, optionalResults, dataSources);
  }

  private async executeRequired(
    dataSources: DataSource[],
    request: any
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Execute in parallel
    const promises = dataSources.map(async (ds) => {
      try {
        const response = await this.proxyService.forward(
          { ...request, url: ds.endpoint },
          ds.service
        );

        const data = ds.transform ? ds.transform(response.data) : response.data;
        return { name: ds.name, data, success: true };
      } catch (error) {
        logger.error({
          dataSource: ds.name,
          service: ds.service,
          error: (error as any).message,
        }, 'Required data source failed');
        
        throw new Error(`Failed to fetch required data: ${ds.name}`);
      }
    });

    const responses = await Promise.all(promises);

    for (const response of responses) {
      results[response.name] = response.data;
    }

    return results;
  }

  private async executeOptional(
    dataSources: DataSource[],
    request: any
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Execute with timeout and fallback
    const promises = dataSources.map(async (ds) => {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 2000);
        });

        const dataPromise = this.proxyService.forward(
          { ...request, url: ds.endpoint },
          ds.service
        );

        const response = await Promise.race([dataPromise, timeoutPromise]);
        const data = ds.transform ? ds.transform(response.data) : response.data;
        
        return { name: ds.name, data, success: true };
      } catch (error) {
        logger.warn({
          dataSource: ds.name,
          service: ds.service,
          error: (error as any).message,
        }, 'Optional data source failed, using fallback');

        return { name: ds.name, data: ds.fallback, success: false };
      }
    });

    const responses = await Promise.allSettled(promises);

    for (const response of responses) {
      if (response.status === 'fulfilled') {
        results[response.value.name] = response.value.data;
      }
    }

```

### timeout.service.ts
First 100 lines:
```typescript
import { FastifyRequest } from 'fastify';
import { config, timeoutConfig } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('timeout-service');

export class TimeoutService {
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);
      }),
    ]);
  }

  calculateTimeout(request: FastifyRequest, service: string): number {
    const endpoint = `${request.method} ${request.routeOptions?.url || request.url}`;
    
    // Check service-specific endpoint timeouts
    const services = timeoutConfig.services as Record<string, any>;
    const serviceConfig = services[service];
    if (serviceConfig) {
      // Check exact endpoint match
      if (serviceConfig.endpoints[endpoint]) {
        logger.debug({
          service,
          endpoint,
          timeout: serviceConfig.endpoints[endpoint],
        }, 'Using endpoint-specific timeout');
        return serviceConfig.endpoints[endpoint];
      }

      // Return service default
      logger.debug({
        service,
        timeout: serviceConfig.default,
      }, 'Using service default timeout');
      return serviceConfig.default;
    }

    // Special handling for payment operations
    if (request.url.includes('/payment') || request.url.includes('/checkout')) {
      return config.timeouts.payment;
    }

    // Special handling for NFT operations
    if (request.url.includes('/nft') || request.url.includes('/mint')) {
      return config.timeouts.nftMinting;
    }

    // Default timeout
    return config.timeouts.default;
  }

  // Create a timeout controller for cascading timeouts
  createTimeoutController(totalTimeout: number): TimeoutController {
    return new TimeoutController(totalTimeout);
  }
}

export class TimeoutController {
  private startTime: number;
  private deadline: number;
  private consumed: number = 0;

  constructor(private totalTimeout: number) {
    this.startTime = Date.now();
    this.deadline = this.startTime + totalTimeout;
  }

  getRemaining(): number {
    const now = Date.now();
    return Math.max(0, this.deadline - now);
  }

  allocate(percentage: number): number {
    const remaining = this.getRemaining();
    const allocated = Math.floor(remaining * percentage);
    this.consumed += allocated;
    
    logger.debug({
      totalTimeout: this.totalTimeout,
      remaining,
      allocated,
      consumed: this.consumed,
    }, 'Timeout allocated');

    return allocated;
  }

  hasExpired(): boolean {
    return Date.now() >= this.deadline;
  }

```

### circuit-breaker.service.ts
First 100 lines:
```typescript
import CircuitBreaker from 'opossum';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { CircuitBreakerState } from '../types';

const logger = createLogger('circuit-breaker-service');

export class CircuitBreakerService {
  private breakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    this.initializeBreakers();
  }

  private initializeBreakers() {
    // Create circuit breakers for each service
    const services = Object.keys(config.services);
    
    for (const service of services) {
      const breaker = this.createBreaker(service);
      this.breakers.set(service, breaker);
    }
  }

  private createBreaker(name: string): CircuitBreaker {
    const options = {
      timeout: config.circuitBreaker.timeout,
      errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
      resetTimeout: config.circuitBreaker.resetTimeout,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      name,
      volumeThreshold: config.circuitBreaker.volumeThreshold,
    };

    const breaker = new CircuitBreaker(async (fn: Function) => fn(), options);

    // Set up event handlers
    this.setupBreakerEvents(breaker, name);

    return breaker;
  }

  private setupBreakerEvents(breaker: CircuitBreaker, name: string) {
    breaker.on('open', () => {
      logger.error({ service: name }, `Circuit breaker OPENED for ${name}`);
    });

    breaker.on('halfOpen', () => {
      logger.info({ service: name }, `Circuit breaker HALF-OPEN for ${name}`);
    });

    breaker.on('close', () => {
      logger.info({ service: name }, `Circuit breaker CLOSED for ${name}`);
    });

    breaker.on('failure', (error) => {
      logger.warn({ service: name, error: (error as any).message }, `Circuit breaker failure for ${name}`);
    });

    breaker.on('timeout', () => {
      logger.warn({ service: name }, `Circuit breaker timeout for ${name}`);
    });

    breaker.on('reject', () => {
      logger.error({ service: name }, `Circuit breaker rejected request for ${name}`);
    });

    breaker.on('success', (elapsed) => {
      logger.debug({ service: name, elapsed }, `Circuit breaker success for ${name}`);
    });
  }

  async execute<T>(
    name: string,
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      logger.warn({ service: name }, "No circuit breaker found, executing directly");
      return fn();
    }
    
    if (fallback) {
      breaker.fallback(fallback);
    }
    
    return breaker.fire(fn) as Promise<T>;
  }

  getState(name: string): CircuitBreakerState {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      return 'CLOSED';
    }

    if (breaker.opened) {
```

### retry.service.ts
First 100 lines:
```typescript
import { createLogger } from '../utils/logger';
import { RetryOptions } from '../types';

const logger = createLogger('retry-service');

export class RetryService {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      multiplier = 2,
      jitter = true,
      retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({ attempt, maxRetries }, 'Executing function');
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error, attempt, maxRetries, retryableErrors)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, {
          baseDelay,
          maxDelay,
          multiplier,
          jitter,
        });

        logger.warn({
          attempt,
          maxRetries,
          delay,
          error: (error as any).message,
        }, `Retry attempt ${attempt}/${maxRetries} in ${delay}ms`);

        await this.sleep(delay);
      }
    }

    logger.error({
      attempts: maxRetries,
      error: lastError?.message,
    }, 'All retry attempts exhausted');

    throw lastError;
  }

  private shouldRetry(
    error: any,
    attempt: number,
    maxRetries: number,
    retryableErrors: string[]
  ): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= maxRetries) {
      return false;
    }

    // Don't retry on client errors (4xx)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      logger.debug({ statusCode: error.response.status }, 'Client error, not retrying');
      return false;
    }

    // Check if error code is retryable
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // Retry on server errors (5xx)
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Retry on timeout errors
    if ((error as any).message && (error as any).message.includes('timeout')) {
      return true;
    }

    return false;
  }

  private calculateDelay(
    attempt: number,
    config: {
      baseDelay: number;
      maxDelay: number;
      multiplier: number;
      jitter: boolean;
```

### proxy.service.ts
First 100 lines:
```typescript
import { serviceUrls } from '../config/services';
import axios, { AxiosRequestConfig } from 'axios';

export class ProxyService {
  private serviceMap: Record<string, string>;

  constructor() {
    this.serviceMap = {
      'auth-service': serviceUrls.auth,
      'venue-service': serviceUrls.venue,
      'event-service': serviceUrls.event,
      'ticket-service': serviceUrls.ticket,
      'payment-service': serviceUrls.payment,
      'nft-service': serviceUrls.marketplace,
      'notification-service': serviceUrls.notification,
      'analytics-service': serviceUrls.analytics,
      'marketplace-service': serviceUrls.marketplace,
      'integration-service': serviceUrls.integration,
      'compliance-service': serviceUrls.compliance,
      'queue-service': serviceUrls.queue,
      'search-service': serviceUrls.search,
      'file-service': serviceUrls.file,
      'monitoring-service': serviceUrls.monitoring,
      'blockchain-service': serviceUrls.blockchain,
      'order-service': serviceUrls.order,
      'scanning-service': serviceUrls.scanning,
      'minting-service': serviceUrls.minting,
      'transfer-service': serviceUrls.transfer,
    };
  }

  getServiceUrl(serviceName: string): string {
    return this.serviceMap[serviceName];
  }

  setForwardedHeaders(request: any, headers: any): void {
    headers['x-forwarded-for'] = request.ip;
    headers['x-forwarded-proto'] = request.protocol;
    headers['x-forwarded-host'] = request.hostname || request.headers.host || 'api-gateway';
    headers['x-forwarded-port'] = request.socket.localPort;
  }

  async forward(request: any, service: string, options?: any): Promise<any> {
    const serviceUrl = this.getServiceUrl(service);
    if (!serviceUrl) {
      throw new Error(`Service ${service} not found`);
    }

    const headers = { ...request.headers };
    this.setForwardedHeaders(request, headers);

    const config: AxiosRequestConfig = {
      method: request.method || 'GET',
      url: `${serviceUrl}${request.url || ''}`,
      headers,
      data: request.body || request.data,
      timeout: options?.timeout || 10000,
      ...options
    };

    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      throw error;
    }
  }
}
```

### service-discovery.service.ts
First 100 lines:
```typescript
import { ServiceInstance } from '../types';
import { REDIS_KEYS } from '../config/redis';
import { createLogger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config';

const logger = createLogger('service-discovery');

export class ServiceDiscoveryService {
  private cache = new Map<string, { instances: ServiceInstance[]; timestamp: number }>();
  private redis: any;

  constructor(dependencies: any = {}) {
    this.redis = dependencies.redis;
    if (!this.redis) {
      logger.warn('Redis not available for service discovery - using in-memory cache only');
    }
    this.startHealthCheckInterval();
  }

  async discover(serviceName: string): Promise<ServiceInstance[]> {
    // Check cache first
    const cached = this.cache.get(serviceName);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.instances;
    }

    // For now, return static instances
    const instances = this.getStaticInstances(serviceName);

    // Update cache
    this.cache.set(serviceName, {
      instances,
      timestamp: Date.now(),
    });

    return instances;
  }

  async register(service: ServiceInstance): Promise<void> {
    if (!this.redis) {
      logger.debug('Skipping Redis registration - Redis not available');
      return;
    }

    const key = `${REDIS_KEYS.SERVICE_DISCOVERY}${service.name}:${service.id}`;

    await this.redis.setex(
      key,
      REDIS_KEYS.SERVICE_DISCOVERY,
      JSON.stringify({
        ...service,
        registeredAt: Date.now(),
      })
    );

    logger.info({
      service: service.name,
      id: service.id,
      address: `${service.address}:${service.port}`,
    }, 'Service instance registered');
  }

  async deregister(serviceId: string): Promise<void> {
    if (!this.redis) return;
    
    const keys = await this.redis.keys(`${REDIS_KEYS.SERVICE_DISCOVERY}*:${serviceId}`);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async getHealthyInstances(serviceName: string): Promise<ServiceInstance[]> {
    const allInstances = await this.discover(serviceName);
    const healthyInstances: ServiceInstance[] = [];

    for (const instance of allInstances) {
      if (await this.checkInstanceHealth(instance)) {
        healthyInstances.push(instance);
      }
    }

    return healthyInstances;
  }

  private getStaticInstances(serviceName: string): ServiceInstance[] {
    const services = config.services as Record<string, string>;
    const serviceUrl = services[serviceName];

    if (!serviceUrl) {
      return [];
    }

    try {
      const url = new URL(serviceUrl);
      return [{
        id: `${serviceName}-static`,
        name: serviceName,
        address: url.hostname,
```

### load-balancer.service.ts
First 100 lines:
```typescript
import { createHash } from 'crypto';
import { ServiceInstance, LoadBalancerStrategy } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('load-balancer-service');

export class LoadBalancerService {
  private roundRobinCounters: Map<string, number> = new Map();
  private leastConnectionsMap: Map<string, Map<string, number>> = new Map();

  selectInstance(
    service: string,
    instances: ServiceInstance[],
    strategy: LoadBalancerStrategy = 'round-robin',
    sessionKey?: string
  ): ServiceInstance {
    if (instances.length === 0) {
      throw new Error(`No instances available for service: ${service}`);
    }

    // Filter healthy instances
    const healthyInstances = instances.filter(instance => instance.healthy);
    
    if (healthyInstances.length === 0) {
      logger.warn({ service }, 'No healthy instances available, using all instances');
      return this.selectByStrategy(service, instances, strategy, sessionKey);
    }

    return this.selectByStrategy(service, healthyInstances, strategy, sessionKey);
  }

  private selectByStrategy(
    service: string,
    instances: ServiceInstance[],
    strategy: LoadBalancerStrategy,
    sessionKey?: string
  ): ServiceInstance {
    switch (strategy) {
      case 'round-robin':
        return this.roundRobin(service, instances);
      
      case 'least-connections':
        return this.leastConnections(service, instances);
      
      case 'random':
        return this.random(instances);
      
      case 'consistent-hash':
        if (!sessionKey) {
          logger.warn({ service }, 'No session key provided for consistent hash, falling back to random');
          return this.random(instances);
        }
        return this.consistentHash(instances, sessionKey);
      
      default:
        logger.warn({ service, strategy }, 'Unknown strategy, falling back to round-robin');
        return this.roundRobin(service, instances);
    }
  }

  private roundRobin(service: string, instances: ServiceInstance[]): ServiceInstance {
    const counter = this.roundRobinCounters.get(service) || 0;
    const index = counter % instances.length;
    
    this.roundRobinCounters.set(service, counter + 1);
    
    const selected = instances[index];
    logger.debug({ service, instance: selected.id }, 'Selected instance (round-robin)');
    
    return selected;
  }

  private leastConnections(service: string, instances: ServiceInstance[]): ServiceInstance {
    if (!this.leastConnectionsMap.has(service)) {
      this.leastConnectionsMap.set(service, new Map());
    }
    
    const connectionCounts = this.leastConnectionsMap.get(service)!;
    
    let leastConnections = Infinity;
    let selectedInstance: ServiceInstance | null = null;
    
    for (const instance of instances) {
      const connections = connectionCounts.get(instance.id) || 0;
      
      if (connections < leastConnections) {
        leastConnections = connections;
        selectedInstance = instance;
      }
    }
    
    if (!selectedInstance) {
      selectedInstance = instances[0];
    }
    
    // Increment connection count
    connectionCounts.set(
      selectedInstance.id,
      (connectionCounts.get(selectedInstance.id) || 0) + 1
    );
```


## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

